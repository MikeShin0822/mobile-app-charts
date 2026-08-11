import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const EXPECTED_COUNTRIES = ['KR', 'US', 'JP', 'CN', 'FR', 'AU', 'DE'];
const EXPECTED_STORES = ['apple', 'google'];
const TRANSLATED_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
const EXPECTED_TOP_N = 25;
const EXPECTED_RECORDS = EXPECTED_COUNTRIES.length * EXPECTED_STORES.length * EXPECTED_TOP_N;

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

async function main() {
  const date = kstDate();
  const snapshotPath = path.join(DATA_DIR, `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

  assert(snapshot.officialOnly === true, 'Snapshot must remain officialOnly=true.');
  assert(snapshot.topN === EXPECTED_TOP_N, `Expected topN=${EXPECTED_TOP_N}.`);
  assert(Array.isArray(snapshot.records), 'Snapshot records must be an array.');
  assert(
    snapshot.records.length === EXPECTED_RECORDS,
    `Expected ${EXPECTED_RECORDS} records, received ${snapshot.records.length}.`,
  );

  for (const store of EXPECTED_STORES) {
    for (const country of EXPECTED_COUNTRIES) {
      const source = snapshot.sources?.[`${store}-${country}`];
      assert(source, `Missing source metadata for ${store}-${country}.`);
      assert(
        String(source.status).startsWith('verified'),
        `Source ${store}-${country} is not verified: ${source.status}.`,
      );

      const records = snapshot.records
        .filter(record => record.store === store && record.country === country)
        .sort((a, b) => a.rank - b.rank);

      assert(
        records.length === EXPECTED_TOP_N,
        `${store}-${country}: expected ${EXPECTED_TOP_N} records, received ${records.length}.`,
      );

      const ranks = new Set(records.map(record => record.rank));
      assert(
        ranks.size === EXPECTED_TOP_N &&
          [...Array(EXPECTED_TOP_N)].every((_, index) => ranks.has(index + 1)),
        `${store}-${country}: ranks must be exactly 1-${EXPECTED_TOP_N}.`,
      );

      const ids = new Set();
      for (const record of records) {
        assert(record.appId, `${store}-${country} #${record.rank}: appId is missing.`);
        assert(!ids.has(record.appId), `${store}-${country}: duplicate appId ${record.appId}.`);
        ids.add(record.appId);

        assert(record.title, `${store}-${country} #${record.rank}: title is missing.`);
        assert(record.originalTitle, `${store}-${country} #${record.rank}: originalTitle is missing.`);
        assert(record.category, `${store}-${country} #${record.rank}: category is missing.`);
        assert(isHttpUrl(record.icon), `${store}-${country} #${record.rank}: icon URL is missing or invalid.`);
        assert(isHttpUrl(record.url), `${store}-${country} #${record.rank}: store URL is missing or invalid.`);

        const url = new URL(record.url);
        if (store === 'apple') {
          assert(
            url.hostname === 'apps.apple.com',
            `${store}-${country} #${record.rank}: expected an apps.apple.com URL.`,
          );
        } else {
          assert(
            url.hostname === 'play.google.com',
            `${store}-${country} #${record.rank}: expected a play.google.com URL.`,
          );
        }

        if (TRANSLATED_COUNTRIES.has(country)) {
          assert(
            record.translatedTitle,
            `${store}-${country} #${record.rank}: translatedTitle is missing.`,
          );
          assert(
            record.title === `${record.translatedTitle} (${record.originalTitle})`,
            `${store}-${country} #${record.rank}: title must use 한글 번역(원어) format.`,
          );
        } else {
          assert(
            record.title === record.originalTitle,
            `${store}-${country} #${record.rank}: KR/US title must remain the store original.`,
          );
        }
      }
    }
  }

  console.log(
    `Validated ${snapshot.records.length} official records with icons, store links, categories, and localized titles.`,
  );
}

main().catch(error => {
  console.error(`Snapshot validation failed: ${error.message}`);
  process.exitCode = 1;
});
