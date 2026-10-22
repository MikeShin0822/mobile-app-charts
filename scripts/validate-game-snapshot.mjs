import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_UNAVAILABLE, descriptionQuality } from './descriptions.mjs';
import { categoryQuality } from './apple-categories.mjs';
import { buildGameCategories, GAME_COUNTRIES, todayKst } from './collect-game-charts.mjs';

const DATA_DIR = path.join(process.cwd(), 'data', 'games');
const STORES = ['apple', 'google'];
const TRANSLATED_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
const ALLOWED_STATUSES = new Set(['verified', 'unavailable']);
const TOP_N = 25;

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

function isOfficialAppleChart(url, country) {
  return url.protocol === 'https:' &&
    url.hostname === 'rss.marketingtools.apple.com' &&
    url.pathname === `/api/v2/${country.toLowerCase()}/games/top-free/25/games.json`;
}

function isOfficialAppleLookup(url, appId, country) {
  return url.protocol === 'https:' &&
    url.hostname === 'itunes.apple.com' &&
    url.pathname === '/lookup' &&
    url.searchParams.get('country') === country.toLowerCase() &&
    (url.searchParams.get('id') || '').split(',').includes(appId.replace(/^ios:/, ''));
}

function isOfficialGoogleChart(url) {
  return url.protocol === 'https:' && url.hostname === 'play.google.com' &&
    (url.pathname.includes('/category/GAME') || url.searchParams.get('cat') === 'GAME');
}

function isOfficialGoogleDetail(url, appId) {
  return url.protocol === 'https:' && url.hostname === 'play.google.com' &&
    url.pathname.includes('/store/apps/details') &&
    url.searchParams.get('id') === appId.replace(/^android:/, '');
}

export function validateGameSnapshot(snapshot, index, date = snapshot.date) {
  assert(snapshot.date === date, `Expected game snapshot date ${date}, received ${snapshot.date}.`);
  assert(snapshot.chartType === 'games', 'Game snapshot chartType must be games.');
  assert(snapshot.officialOnly === true, 'Game snapshot must remain officialOnly=true.');
  assert(snapshot.topN === TOP_N, `Expected game topN=${TOP_N}.`);
  assert(!Number.isNaN(Date.parse(snapshot.generatedAt)), 'Game generatedAt must be a valid ISO date.');
  assert(Array.isArray(snapshot.records), 'Game records must be an array.');
  assert(snapshot.sources && typeof snapshot.sources === 'object', 'Game sources are missing.');
  assert(snapshot.categoryComposition && typeof snapshot.categoryComposition === 'object',
    'Game categoryComposition is missing.');

  let verifiedCharts = 0;
  let expectedRecords = 0;
  let unavailableDescriptions = 0;
  let unavailableCategories = 0;

  for (const store of STORES) {
    for (const country of GAME_COUNTRIES) {
      const key = `${store}-${country.code}`;
      const source = snapshot.sources[key];
      assert(source, `Missing game source ${key}.`);
      assert(source.chartType === 'games', `${key}: source.chartType must be games.`);
      assert(source.store === store && source.country === country.code,
        `${key}: source identity is inconsistent.`);
      assert(ALLOWED_STATUSES.has(source.status), `${key}: unsupported status ${source.status}.`);
      assert(isHttpUrl(source.url), `${key}: official source URL is missing.`);
      const sourceUrl = new URL(source.url);
      assert(store === 'apple'
        ? isOfficialAppleChart(sourceUrl, country.code)
        : isOfficialGoogleChart(sourceUrl), `${key}: source URL is not an official game chart.`);

      const records = snapshot.records
        .filter(record => record.store === store && record.country === country.code)
        .sort((a, b) => a.rank - b.rank);
      assert(records.every(record => record.chartType === 'games'), `${key}: records must be game records.`);

      const composition = snapshot.categoryComposition[key];
      assert(composition, `${key}: category composition is missing.`);
      assert(composition.chartType === 'games', `${key}: composition.chartType must be games.`);
      assert(composition.store === store && composition.country === country.code,
        `${key}: composition identity is inconsistent.`);
      assert(composition.status === source.status, `${key}: composition status must match source.`);
      assert(composition.total === records.length, `${key}: composition total does not match records.`);
      assert(JSON.stringify(composition.categories) === JSON.stringify(buildGameCategories(records)),
        `${key}: category composition does not match records.`);

      if (!isVerified(source)) {
        assert(records.length === 0, `${key}: unavailable chart must contain zero records.`);
        assert(composition.total === 0 && composition.categories.length === 0,
          `${key}: unavailable chart composition must be empty.`);
        assert(String(source.note || '').trim(), `${key}: unavailable chart needs a reason.`);
        continue;
      }

      verifiedCharts += 1;
      expectedRecords += TOP_N;
      assert(records.length === TOP_N, `${key}: verified game chart must contain exactly ${TOP_N} records.`);
      const ranks = new Set(records.map(record => record.rank));
      assert(ranks.size === TOP_N && Array.from({ length: TOP_N }, (_, i) => ranks.has(i + 1)).every(Boolean),
        `${key}: ranks must be exactly 1-${TOP_N}.`);

      const ids = new Set();
      for (const record of records) {
        assert(record.appId?.startsWith(store === 'apple' ? 'ios:' : 'android:'),
          `${key} #${record.rank}: stable app ID is missing or has the wrong prefix.`);
        assert(!ids.has(record.appId), `${key}: duplicate app ID ${record.appId}.`);
        ids.add(record.appId);
        assert(record.title && record.originalTitle, `${key} #${record.rank}: title is missing.`);
        assert(record.category, `${key} #${record.rank}: category is missing.`);
        assert(isHttpUrl(record.icon), `${key} #${record.rank}: icon URL is missing.`);
        assert(isHttpUrl(record.url), `${key} #${record.rank}: store URL is missing.`);
        const appUrl = new URL(record.url);
        assert(store === 'apple'
          ? appUrl.hostname === 'apps.apple.com'
          : isOfficialGoogleDetail(appUrl, record.appId),
        `${key} #${record.rank}: app URL is not the matching official store detail page.`);

        assert(['verified', 'unavailable'].includes(record.descriptionStatus),
          `${key} #${record.rank}: description status is missing.`);
        assert(isHttpUrl(record.descriptionSource), `${key} #${record.rank}: description source is missing.`);
        assert(!Number.isNaN(Date.parse(record.descriptionCheckedAt)),
          `${key} #${record.rank}: descriptionCheckedAt is missing.`);
        const descriptionSource = new URL(record.descriptionSource);
        const descriptionSourceValid = store === 'apple'
          ? isOfficialAppleLookup(descriptionSource, record.appId, country.code)
          : isOfficialGoogleDetail(descriptionSource, record.appId);
        assert(descriptionSourceValid, `${key} #${record.rank}: description source does not match the app.`);
        if (record.descriptionStatus === 'verified') {
          assert(record.description && record.description !== DESCRIPTION_UNAVAILABLE,
            `${key} #${record.rank}: verified description is empty.`);
          assert(record.description.length <= DESCRIPTION_MAX_LENGTH,
            `${key} #${record.rank}: description exceeds ${DESCRIPTION_MAX_LENGTH} characters.`);
          assert(record.descriptionReason === null,
            `${key} #${record.rank}: verified description must not have a failure reason.`);
        } else {
          unavailableDescriptions += 1;
          assert(record.description === DESCRIPTION_UNAVAILABLE && String(record.descriptionReason || '').trim(),
            `${key} #${record.rank}: unavailable description must be explicit and reasoned.`);
        }

        if (store === 'apple') {
          assert(['verified', 'unavailable'].includes(record.categoryStatus),
            `${key} #${record.rank}: Apple category status is missing.`);
          assert(isHttpUrl(record.categorySource), `${key} #${record.rank}: Apple category source is missing.`);
          const categorySource = new URL(record.categorySource);
          assert(isOfficialAppleChart(categorySource, country.code) ||
            isOfficialAppleLookup(categorySource, record.appId, country.code),
          `${key} #${record.rank}: Apple category source is not official or does not match the app.`);
          if (record.categoryStatus === 'unavailable') unavailableCategories += 1;
        }

        if (TRANSLATED_COUNTRIES.has(country.code)) {
          assert(record.translatedTitle,
            `${key} #${record.rank}: translatedTitle is required for ${country.code}.`);
          assert(record.title === `${record.translatedTitle} (${record.originalTitle})`,
            `${key} #${record.rank}: title format is inconsistent.`);
        } else {
          assert(record.title === record.originalTitle,
            `${key} #${record.rank}: KR/US title must remain the store original.`);
        }
      }

      const quality = descriptionQuality(records);
      assert(source.descriptionQuality?.status === quality.status &&
        source.descriptionQuality?.verified === quality.verified &&
        source.descriptionQuality?.unavailable === quality.unavailable,
      `${key}: descriptionQuality is missing or inconsistent.`);
      if (store === 'apple') {
        const appleQuality = categoryQuality(records);
        assert(source.categoryQuality?.status === appleQuality.status &&
          source.categoryQuality?.verified === appleQuality.verified &&
          source.categoryQuality?.unavailable === appleQuality.unavailable,
        `${key}: categoryQuality is missing or inconsistent.`);
      }
    }
  }

  assert(snapshot.records.length === expectedRecords,
    `Expected ${expectedRecords} game records from ${verifiedCharts} verified charts, received ${snapshot.records.length}.`);

  assert(index.chartType === 'games', 'Game index chartType must be games.');
  const indexEntry = (index.snapshots || []).find(item => item.date === date);
  assert(indexEntry, `Game index is missing ${date}.`);
  assert(indexEntry.file === `data/games/${date}.json`, `${date}: game index path is incorrect.`);
  assert(indexEntry.chartType === 'games' && indexEntry.officialOnly === true,
    `${date}: game index metadata is invalid.`);
  for (const store of STORES) {
    const expectedCoverage = GAME_COUNTRIES.filter(country =>
      isVerified(snapshot.sources[`${store}-${country.code}`]),
    ).length;
    assert(indexEntry.coverage?.[store] === expectedCoverage,
      `${date}: game index coverage for ${store} must be ${expectedCoverage}.`);
  }

  return { verifiedCharts, records: snapshot.records.length, unavailableDescriptions, unavailableCategories };
}

async function main() {
  const date = process.argv[2] || todayKst();
  const snapshot = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${date}.json`), 'utf8'));
  const index = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'index.json'), 'utf8'));
  const result = validateGameSnapshot(snapshot, index, date);
  console.log(
    `Validated ${result.records} official game records across ${result.verifiedCharts}/14 verified charts; ` +
      `${result.unavailableCategories} Apple categories and ${result.unavailableDescriptions} descriptions unavailable.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Game snapshot validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
