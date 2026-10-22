import { fetchJson } from './fetch-json.mjs';
import { officialDescriptionMetadata, unavailableDescription } from './descriptions.mjs';

export const APPLE_CATEGORIES = {
  '6000': '비즈니스', '6001': '날씨', '6002': '유틸리티', '6003': '여행',
  '6004': '스포츠', '6005': '소셜', '6006': '도서·참고자료', '6007': '생산성',
  '6008': '사진·비디오', '6009': '뉴스', '6010': '내비게이션', '6011': '음악',
  '6012': '라이프스타일', '6013': '건강·피트니스', '6014': '게임', '6015': '금융',
  '6016': '엔터테인먼트', '6017': '교육', '6018': '도서', '6020': '의료',
  '6021': '잡지·신문', '6022': '카탈로그', '6023': '음식·음료', '6024': '쇼핑',
  '6026': '개발자 도구', '6027': '그래픽·디자인',
};

export const UNKNOWN_CATEGORY = '미확인';
const text = value => typeof value === 'string' ? value.trim() : '';

// RSS may include a generic Apps genre (36). Never treat it as an app category.
export function appleCategory(id, name) {
  const categoryId = String(id ?? '').trim();
  if (!/^\d+$/.test(categoryId) || categoryId === '36') return null;
  const category = APPLE_CATEGORIES[categoryId] || text(name);
  return category ? { category, categoryId } : null;
}

export function rssCategory(item) {
  if (!Array.isArray(item?.genres)) return null;
  return item.genres.map(genre => appleCategory(genre?.genreId, genre?.name)).find(Boolean) || null;
}

export function categoryLabel(record) {
  if (record.store === 'apple' && (record.categoryStatus === 'unavailable' ||
      !String(record.categoryId || '').trim() || !text(record.category) || record.category === '기타')) {
    return UNKNOWN_CATEGORY;
  }
  return text(record.category) || (record.store === 'apple' ? UNKNOWN_CATEGORY : '기타');
}

export function categoryQuality(records) {
  const unavailable = records.filter(row => categoryLabel(row) === UNKNOWN_CATEGORY).length;
  return {
    status: unavailable ? 'incomplete' : 'complete',
    verified: records.length - unavailable,
    unavailable,
  };
}

function lookupEndpoint(ids, country) {
  const endpoint = new URL('https://itunes.apple.com/lookup');
  endpoint.searchParams.set('id', ids.join(','));
  endpoint.searchParams.set('country', country.toLowerCase());
  endpoint.searchParams.set('entity', 'software');
  return endpoint;
}

async function lookupAppleApps(ids, country, { fetcher = fetchJson } = {}) {
  const validIds = [...new Set(ids.map(id => String(id)).filter(id => /^\d+$/.test(id)))];
  const endpoint = lookupEndpoint(validIds, country);
  const byId = new Map();
  let failure = null;

  try {
    if (!validIds.length) throw new Error('No valid Apple app IDs');
    const json = await fetcher(endpoint);
    if (!Array.isArray(json?.results)) throw new Error('Malformed Apple lookup response');
    for (const item of json.results) {
      const id = String(item?.trackId ?? '');
      if (item?.wrapperType !== 'software' || !validIds.includes(id)) continue;
      // Conflicting/duplicate results are ambiguous, not trustworthy metadata.
      byId.set(id, byId.has(id) ? null : item);
    }
  } catch (error) {
    failure = `lookup_failed: ${error.message}`;
  }

  return { byId, endpoint, failure };
}

// Category-only helper retained for historical backfills and focused tests.
// It requests only the IDs whose RSS category is missing.
export async function resolveAppleCategories(items, country, {
  fetcher = fetchJson,
  checkedAt = new Date().toISOString(),
} = {}) {
  const rssUrl = `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/apps/top-free/25/apps.json`;
  const resolved = items.map(item => {
    const category = rssCategory(item);
    return category && {
      ...category,
      categoryStatus: 'verified',
      categorySource: rssUrl,
      categoryCheckedAt: checkedAt,
      categoryReason: null,
    };
  });
  const missing = items.filter((_, i) => !resolved[i]);
  const { byId, endpoint, failure } = await lookupAppleApps(
    missing.map(item => item.id),
    country,
    { fetcher },
  );

  return items.map((item, i) => {
    if (resolved[i]) return resolved[i];
    const detail = byId.get(String(item.id));
    const category = detail && appleCategory(detail.primaryGenreId, detail.primaryGenreName);
    return category
      ? {
          ...category,
          categoryStatus: 'verified',
          categorySource: endpoint.href,
          categoryCheckedAt: checkedAt,
          categoryReason: null,
        }
      : {
          category: UNKNOWN_CATEGORY,
          categoryId: '',
          categoryStatus: 'unavailable',
          categorySource: endpoint.href,
          categoryCheckedAt: checkedAt,
          categoryReason: failure || (detail ? 'lookup_category_missing' : 'lookup_app_not_found_or_ambiguous'),
        };
  });
}

// Current collection path: one official lookup request per storefront enriches
// every ranked app with a real App Store description and fills missing RSS categories.
export async function resolveAppleMetadata(items, country, {
  fetcher = fetchJson,
  checkedAt = new Date().toISOString(),
} = {}) {
  const rssUrl = `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/apps/top-free/25/apps.json`;
  const rssCategories = items.map(rssCategory);
  const { byId, endpoint, failure } = await lookupAppleApps(
    items.map(item => item.id),
    country,
    { fetcher },
  );

  return items.map((item, i) => {
    const detail = byId.get(String(item.id));
    const lookupCategory = detail && appleCategory(detail.primaryGenreId, detail.primaryGenreName);
    const category = rssCategories[i] || lookupCategory;
    const categoryMetadata = category
      ? {
          ...category,
          categoryStatus: 'verified',
          categorySource: rssCategories[i] ? rssUrl : endpoint.href,
          categoryCheckedAt: checkedAt,
          categoryReason: null,
        }
      : {
          category: UNKNOWN_CATEGORY,
          categoryId: '',
          categoryStatus: 'unavailable',
          categorySource: endpoint.href,
          categoryCheckedAt: checkedAt,
          categoryReason: failure || (detail ? 'lookup_category_missing' : 'lookup_app_not_found_or_ambiguous'),
        };

    const descriptionMetadata = detail
      ? officialDescriptionMetadata(detail.description, endpoint.href, checkedAt)
      : unavailableDescription(
          endpoint.href,
          checkedAt,
          failure || 'lookup_app_not_found_or_ambiguous',
        );

    return { ...categoryMetadata, ...descriptionMetadata };
  });
}
