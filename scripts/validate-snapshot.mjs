import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const EXPECTED_COUNTRIES = ['KR', 'US', 'JP', 'CN', 'FR', 'AU', 'DE'];
const EXPECTED_STORES = ['apple', 'google'];
const TRANSLATED_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
const EXPECTED_TOP_N = 25;
const ALLOWED_STATUSES = new Set(['verified', 'unavailable']);

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isVerified(source) {
  return source?.status === 'verified';
}

async function main() {
  const date = kstDate();
  const snapshotPath = path.join(DATA_DIR, `${date}.json`);
  const indexPath = path.join(DATA_DIR, 'index.json');
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  const index = JSON.parse(await fs.readFile(indexPath, 'utf8'));

  assert(snapshot.date === date, `Expected snapshot date ${date}, received ${snapshot.date}.`);
  assert(!Number.isNaN(Date.parse(snapshot.generatedAt)), 'generatedAt must be a valid ISO date.');
  assert(snapshot.officialOnly === true, 'Snapshot must remain officialOnly=true.');
  assert(snapshot.topN === EXPECTED_TOP_N, `Expected topN=${EXPECTED_TOP_N}.`);
  assert(Array.isArray(snapshot.records), 'Snapshot records must be an array.');
  assert(snapshot.sources && typeof snapshot.sources === 'object', 'Snapshot sources are missing.');
  assert(
    snapshot.categoryComposition && typeof snapshot.categoryComposition === 'object',
    'categoryComposition is missing.',
  );

  let verifiedCharts = 0;
  let expectedRecords = 0;

  for (const store of EXPECTED_STORES) {
    for (const country of EXPECTED_COUNTRIES) {
      const key = `${store}-${country}`;
      const source = snapshot.sources[key];
      assert(source, `Missing source metadata for ${key}.`);
      assert(
        ALLOWED_STATUSES.has(source.status),
        `Source ${key} has unsupported status: ${source.status}.`,
      );
      assert(source.store === store, `${key}: source.store must be ${store}.`);
      assert(source.country === country, `${key}: source.country must be ${country}.`);
      assert(isHttpUrl(source.url), `${key}: official source URL is missing or invalid.`);

      const sourceUrl = new URL(source.url);
      if (store === 'apple') {
        assert(
          ['rss.marketingtools.apple.com', 'apps.apple.com'].includes(sourceUrl.hostname),
          `${key}: expected an official Apple URL.`,
        );
      } else {
        assert(sourceUrl.hostname === 'play.google.com', `${key}: expected a play.google.com URL.`);
      }

      const records = snapshot.records
        .filter(record => record.store === store && record.country === country)
        .sort((a, b) => a.rank - b.rank);

      const composition = snapshot.categoryComposition[key];
      assert(composition, `${key}: category composition is missing.`);
      assert(composition.store === store, `${key}: composition.store must be ${store}.`);
      assert(composition.country === country, `${key}: composition.country must be ${country}.`);
      assert(composition.status === source.status, `${key}: composition status must match source status.`);
      assert(Array.isArray(composition.categories), `${key}: composition categories must be an array.`);
      const categoryTotal = composition.categories.reduce(
        (sum, item) => sum + Number(item.count || 0),
        0,
      );
      assert(categoryTotal === composition.total, `${key}: category counts do not match total.`);
      assert(composition.total === records.length, `${key}: composition total does not match records.`);

      if (isVerified(source)) {
        verifiedCharts += 1;
        expectedRecords += EXPECTED_TOP_N;
        assert(
          records.length === EXPECTED_TOP_N,
          `${key}: verified source must contain exactly ${EXPECTED_TOP_N} records; received ${records.length}.`,
        );
        assert(
          composition.total === EXPECTED_TOP_N,
          `${key}: verified composition must total ${EXPECTED_TOP_N}.`,
        );

        const ranks = new Set(records.map(record => record.rank));
        assert(
          ranks.size === EXPECTED_TOP_N &&
            [...Array(EXPECTED_TOP_N)].every((_, index) => ranks.has(index + 1)),
          `${key}: ranks must be exactly 1-${EXPECTED_TOP_N}.`,
        );

        const ids = new Set();
        for (const record of records) {
          assert(record.appId, `${key} #${record.rank}: appId is missing.`);
          assert(!ids.has(record.appId), `${key}: duplicate appId ${record.appId}.`);
          ids.add(record.appId);

          assert(
            record.appId.startsWith(store === 'apple' ? 'ios:' : 'android:'),
            `${key} #${record.rank}: appId prefix does not match store.`,
          );
          assert(record.title, `${key} #${record.rank}: title is missing.`);
          assert(record.originalTitle, `${key} #${record.rank}: originalTitle is missing.`);
          assert(record.description, `${key} #${record.rank}: description is missing.`);
          assert(record.category, `${key} #${record.rank}: category is missing.`);
          assert(isHttpUrl(record.icon), `${key} #${record.rank}: icon URL is missing or invalid.`);
          assert(isHttpUrl(record.url), `${key} #${record.rank}: store URL is missing or invalid.`);

          const url = new URL(record.url);
          if (store === 'apple') {
            assert(url.hostname === 'apps.apple.com', `${key} #${record.rank}: expected an App Store URL.`);
          } else {
            assert(url.hostname === 'play.google.com', `${key} #${record.rank}: expected a Play Store URL.`);
          }

          if (TRANSLATED_COUNTRIES.has(country)) {
            assert(record.translatedTitle, `${key} #${record.rank}: translatedTitle is missing.`);
            assert(
              record.title === `${record.translatedTitle} (${record.originalTitle})`,
              `${key} #${record.rank}: title must use 한글 번역(원어) format.`,
            );
          } else {
            assert(
              record.title === record.originalTitle,
              `${key} #${record.rank}: KR/US title must remain the store original.`,
            );
          }
        }
      } else {
        assert(
          records.length === 0,
          `${key}: unavailable source must not contain guessed or partial records.`,
        );
        assert(composition.total === 0, `${key}: unavailable composition total must be 0.`);
        assert(
          composition.categories.length === 0,
          `${key}: unavailable composition categories must be empty.`,
        );
        assert(source.note, `${key}: unavailable source must include a reason in note.`);
      }
    }
  }

  assert(
    snapshot.records.length === expectedRecords,
    `Expected ${expectedRecords} records from ${verifiedCharts} verified charts, received ${snapshot.records.length}.`,
  );

  const indexEntry = (index.snapshots || []).find(item => item.date === date);
  assert(indexEntry, `data/index.json is missing the ${date} snapshot.`);
  assert(indexEntry.file === `data/${date}.json`, `${date}: index file path is incorrect.`);
  assert(indexEntry.officialOnly === true, `${date}: index entry must remain officialOnly=true.`);
  for (const store of EXPECTED_STORES) {
    const expectedCoverage = EXPECTED_COUNTRIES.filter(country =>
      isVerified(snapshot.sources[`${store}-${country}`]),
    ).length;
    assert(
      indexEntry.coverage?.[store] === expectedCoverage,
      `${date}: index coverage for ${store} must be ${expectedCoverage}.`,
    );
  }

  console.log(
    `Validated ${snapshot.records.length} official records across ${verifiedCharts}/14 verified charts; ` +
      `${14 - verifiedCharts} charts recorded as unavailable without guessed records.`,
  );
}

main().catch(error => {
  console.error(`Snapshot validation failed: ${error.message}`);
  process.exitCode = 1;
});
