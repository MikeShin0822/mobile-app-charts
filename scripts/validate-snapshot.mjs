import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { appleCategory, categoryQuality, UNKNOWN_CATEGORY } from './apple-categories.mjs';
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_UNAVAILABLE,
  descriptionQuality,
} from './descriptions.mjs';
import { buildCategories } from '../tools/category-composition.mjs';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const EXPECTED_COUNTRIES = ['KR', 'US', 'JP', 'CN', 'FR', 'AU', 'DE'];
const EXPECTED_STORES = ['apple', 'google'];
const TRANSLATED_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
const EXPECTED_TOP_N = 25;
const ALLOWED_STATUSES = new Set(['verified', 'unavailable']);
const LEGACY_DESCRIPTION_CATEGORIES = new Set([
  '예술·디자인', '자동차', '뷰티', '도서·참고자료', '비즈니스', '날씨', '유틸리티',
  '여행', '여행·지역', '스포츠', '소셜', '커뮤니케이션', '뉴스', '뉴스·잡지',
  '생산성', '사진', '사진·비디오', '내비게이션', '지도·내비게이션', '음악',
  '음악·오디오', '라이프스타일', '건강·피트니스', '게임', '금융', '엔터테인먼트',
  '교육', '도서', '의료', '잡지·신문', '카탈로그', '음식·음료', '쇼핑', '도구',
  '만화', '데이트', '이벤트', '주택·홈', '라이브러리·데모', '육아', '맞춤설정',
  '개발자 도구', '그래픽·디자인', '기타', '미확인',
]);

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

function isLegacyCategoryDeveloperDescription(record) {
  const parts = String(record.description || '').split(/\s+·\s+/u);
  if (parts.length !== 2) return false;
  const [category, developer] = parts.map(value => value.trim());
  return LEGACY_DESCRIPTION_CATEGORIES.has(category) &&
    (developer === String(record.developer || '').trim() ||
      developer === '개발사' || developer === '개발사 정보 없음');
}

function assertQuality(actual, expected, label) {
  assert(
    actual?.status === expected.status &&
      actual?.verified === expected.verified &&
      actual?.unavailable === expected.unavailable,
    `${label} is missing or inconsistent.`,
  );
}

function isAppleLookupForRecord(url, country, record) {
  return url.protocol === 'https:' &&
    url.hostname === 'itunes.apple.com' &&
    url.pathname === '/lookup' &&
    url.searchParams.get('country') === country.toLowerCase() &&
    (url.searchParams.get('id') || '').split(',').includes(record.appId.slice(4));
}

function isAppleAppPageForRecord(url, record) {
  return url.protocol === 'https:' &&
    url.hostname === 'apps.apple.com' &&
    url.pathname.includes(`/id${record.appId.slice(4)}`);
}

function isGoogleAppPageForRecord(url, record) {
  return url.protocol === 'https:' &&
    url.hostname === 'play.google.com' &&
    url.pathname === '/store/apps/details' &&
    url.searchParams.get('id') === record.appId.replace(/^android:/, '');
}

export function validateSnapshot(snapshot, index, date = snapshot.date) {
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
      assert(
        JSON.stringify(composition.categories) === JSON.stringify(buildCategories(records)),
        `${key}: category composition does not match record categories.`,
      );

      if (store === 'apple' && records.length) {
        assertQuality(source.categoryQuality, categoryQuality(records), `${key}: categoryQuality`);
      }
      if (records.length) {
        assertQuality(source.descriptionQuality, descriptionQuality(records), `${key}: descriptionQuality`);
      }

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
            assert(['verified', 'unavailable'].includes(record.categoryStatus),
              `${key} #${record.rank}: categoryStatus is missing or unsupported.`);
            assert(!Number.isNaN(Date.parse(record.categoryCheckedAt)),
              `${key} #${record.rank}: categoryCheckedAt is missing.`);
            assert(isHttpUrl(record.categorySource), `${key} #${record.rank}: categorySource is missing.`);
            const categoryUrl = new URL(record.categorySource);
            const rssPath = `/api/v2/${country.toLowerCase()}/apps/top-free/25/apps.json`;
            const isRss = categoryUrl.protocol === 'https:' &&
              categoryUrl.hostname === 'rss.marketingtools.apple.com' &&
              categoryUrl.pathname === rssPath;
            const isLookup = isAppleLookupForRecord(categoryUrl, country, record);
            assert(isRss || isLookup,
              `${key} #${record.rank}: categorySource must match official storefront/app ID.`);
            if (record.categoryStatus === 'verified') {
              const category = appleCategory(record.categoryId, record.category);
              assert(category && category.category === record.category &&
                !['기타', UNKNOWN_CATEGORY].includes(record.category),
                `${key} #${record.rank}: verified category requires real metadata.`);
              assert(record.categoryReason === null,
                `${key} #${record.rank}: verified category must not have a failure reason.`);
            } else {
              assert(record.category === UNKNOWN_CATEGORY && record.categoryId === '' &&
                typeof record.categoryReason === 'string' && record.categoryReason.trim(),
                `${key} #${record.rank}: unavailable category must be explicit, empty-ID and reasoned.`);
            }
          } else {
            assert(isGoogleAppPageForRecord(url, record),
              `${key} #${record.rank}: expected a matching Play Store app URL.`);
          }

          assert(['verified', 'unavailable'].includes(record.descriptionStatus),
            `${key} #${record.rank}: descriptionStatus is missing or unsupported.`);
          assert(!Number.isNaN(Date.parse(record.descriptionCheckedAt)),
            `${key} #${record.rank}: descriptionCheckedAt is missing.`);
          assert(isHttpUrl(record.descriptionSource),
            `${key} #${record.rank}: descriptionSource is missing or invalid.`);
          const descriptionUrl = new URL(record.descriptionSource);
          const validDescriptionSource = store === 'apple'
            ? isAppleLookupForRecord(descriptionUrl, country, record) ||
              isAppleAppPageForRecord(descriptionUrl, record)
            : isGoogleAppPageForRecord(descriptionUrl, record);
          assert(validDescriptionSource,
            `${key} #${record.rank}: descriptionSource must be the matching official app detail source.`);

          if (record.descriptionStatus === 'verified') {
            assert(record.description !== DESCRIPTION_UNAVAILABLE,
              `${key} #${record.rank}: verified description cannot use unavailable placeholder.`);
            assert(!isLegacyCategoryDeveloperDescription(record),
              `${key} #${record.rank}: verified description cannot use legacy category/developer text.`);
            assert(record.description.length <= DESCRIPTION_MAX_LENGTH,
              `${key} #${record.rank}: short description exceeds ${DESCRIPTION_MAX_LENGTH} characters.`);
            assert(record.descriptionReason === null,
              `${key} #${record.rank}: verified description must not have a failure reason.`);
          } else {
            assert(record.description === DESCRIPTION_UNAVAILABLE &&
              typeof record.descriptionReason === 'string' && record.descriptionReason.trim(),
              `${key} #${record.rank}: unavailable description must be explicit and reasoned.`);
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

  return {
    verifiedCharts,
    records: snapshot.records.length,
    unavailableCategories: snapshot.records.filter(row => row.categoryStatus === 'unavailable').length,
    unavailableDescriptions: snapshot.records.filter(row => row.descriptionStatus === 'unavailable').length,
  };
}

async function main() {
  const date = process.argv[2] || kstDate();
  const snapshot = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${date}.json`), 'utf8'));
  const index = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'index.json'), 'utf8'));
  const result = validateSnapshot(snapshot, index, date);
  console.log(
    `Validated ${result.records} official records across ${result.verifiedCharts}/14 verified charts; ` +
      `${result.unavailableCategories} Apple categories and ` +
      `${result.unavailableDescriptions} descriptions explicitly unavailable.`,
  );
  if (result.unavailableCategories) {
    console.warn(
      `::warning::Apple category metadata incomplete: ${result.unavailableCategories} unavailable; ranks preserved.`,
    );
  }
  if (result.unavailableDescriptions) {
    console.warn(
      `::warning::Official descriptions incomplete: ${result.unavailableDescriptions} unavailable; no text was invented.`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(`Snapshot validation failed: ${error.message}`);
  process.exitCode = 1;
});
