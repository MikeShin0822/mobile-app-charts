import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { fetchJson } from './fetch-json.mjs';
import { appleCategory, resolveAppleMetadata, categoryQuality } from './apple-categories.mjs';
import {
  descriptionQuality,
  officialDescriptionMetadata,
  unavailableDescription,
} from './descriptions.mjs';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'games');
const TRANSLATIONS_FILE = path.join(ROOT, 'data', 'translations.json');
const TOP_N = 25;
const TRANSLATE_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
export const GAME_COUNTRIES = [
  { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
  { code: 'US', apple: 'us', google: 'us', lang: 'en' },
  { code: 'JP', apple: 'jp', google: 'jp', lang: 'ja' },
  { code: 'CN', apple: 'cn', google: 'cn', lang: 'zh-CN' },
  { code: 'FR', apple: 'fr', google: 'fr', lang: 'fr' },
  { code: 'AU', apple: 'au', google: 'au', lang: 'en' },
  { code: 'DE', apple: 'de', google: 'de', lang: 'de' },
];

const GAME_CATEGORIES = {
  GAME: '게임',
  GAME_ACTION: '액션',
  GAME_ADVENTURE: '어드벤처',
  GAME_ARCADE: '아케이드',
  GAME_BOARD: '보드',
  GAME_CARD: '카드',
  GAME_CASINO: '카지노',
  GAME_CASUAL: '캐주얼',
  GAME_EDUCATIONAL: '교육',
  GAME_MUSIC: '음악',
  GAME_PUZZLE: '퍼즐',
  GAME_RACING: '레이싱',
  GAME_ROLE_PLAYING: '롤플레잉',
  GAME_SIMULATION: '시뮬레이션',
  GAME_SPORTS: '스포츠',
  GAME_STRATEGY: '전략',
  GAME_TRIVIA: '퀴즈',
  GAME_WORD: '단어',
};

const BRAND_TRANSLATIONS = new Map(Object.entries({
  Roblox: '로블록스', Minecraft: '마인크래프트', Fortnite: '포트나이트',
  'Pokémon GO': '포켓몬 GO', 'Brawl Stars': '브롤스타즈',
  'Clash Royale': '클래시 로얄', 'Clash of Clans': '클래시 오브 클랜',
  'Candy Crush Saga': '캔디크러쉬사가', 'Royal Match': '로얄 매치',
  'MONOPOLY GO!': '모노폴리 GO!', 'PUBG MOBILE': '배틀그라운드 모바일',
}));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const todayKst = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function retry(label, operation, { attempts = 3, baseDelayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`${label} attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeGameCategory(value, genreId) {
  const key = String(genreId || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (GAME_CATEGORIES[key]) return GAME_CATEGORIES[key];
  if (key.startsWith('GAME_')) return cleanTitle(value) || key.replace(/^GAME_/, '');
  return cleanTitle(value) || '게임';
}

function specificAppleGameCategory(item) {
  if (!Array.isArray(item?.genres)) return null;
  const categories = item.genres
    .map(genre => appleCategory(genre?.genreId, genre?.name))
    .filter(Boolean);
  return categories.find(category => category.categoryId !== '6014') || categories[0] || null;
}

async function translateToKorean(text, cache, { fetcher = fetchJson } = {}) {
  const original = cleanTitle(text);
  if (!original) return original;
  if (BRAND_TRANSLATIONS.has(original)) return BRAND_TRANSLATIONS.get(original);
  if (cache[original]) return cache[original];

  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'auto');
  endpoint.searchParams.set('tl', 'ko');
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('q', original);

  try {
    const result = await fetcher(endpoint, { attempts: 3, timeoutMs: 15000 });
    const translated = cleanTitle((result?.[0] || []).map(part => part?.[0] || '').join('')) || original;
    cache[original] = translated;
    await sleep(140);
    return translated;
  } catch (error) {
    console.warn(`Game title translation fallback for “${original}”: ${error.message}`);
    return original;
  }
}

async function titleFields(originalTitle, country, cache, options = {}) {
  const original = cleanTitle(originalTitle);
  if (!TRANSLATE_COUNTRIES.has(country)) {
    return { title: original, originalTitle: original, translatedTitle: null };
  }
  const translated = await translateToKorean(original, cache, options);
  return {
    title: `${translated} (${original})`,
    originalTitle: original,
    translatedTitle: translated,
  };
}

function assertCompleteOfficialChart(records, label) {
  if (records.length !== TOP_N) {
    throw new Error(`${label} returned ${records.length}/${TOP_N} entries; exact TOP ${TOP_N} mapping is unavailable`);
  }
  const ids = new Set();
  for (const record of records) {
    if (!record.appId || !record.originalTitle || !record.url) {
      throw new Error(`${label} contains an entry without a stable app ID, title, or official URL`);
    }
    if (ids.has(record.appId)) throw new Error(`${label} contains duplicate app ID ${record.appId}`);
    ids.add(record.appId);
  }
}

async function parallelMap(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function collectAppleGames(country, translationCache, {
  fetcher = fetchJson,
  titleResolver = titleFields,
  checkedAt = new Date().toISOString(),
} = {}) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${country.apple}/games/top-free/${TOP_N}/games.json`;
  const json = await fetcher(url);
  const items = json?.feed?.results || [];
  if (!items.length) throw new Error('Apple games RSS returned no chart entries');

  const chartItems = items.slice(0, TOP_N);
  const lookupItems = chartItems.map(item => ({ ...item, genres: [] }));
  const metadata = await resolveAppleMetadata(lookupItems, country.apple, { fetcher, checkedAt });
  const records = [];

  for (const [index, item] of chartItems.entries()) {
    const titles = await titleResolver(item.name, country.code, translationCache, { fetcher });
    const specificCategory = specificAppleGameCategory(item);
    const officialMetadata = { ...metadata[index] };
    if (specificCategory && specificCategory.categoryId !== '6014') {
      Object.assign(officialMetadata, {
        ...specificCategory,
        categoryStatus: 'verified',
        categorySource: url,
        categoryCheckedAt: checkedAt,
        categoryReason: null,
      });
    }
    records.push({
      chartType: 'games',
      store: 'apple',
      country: country.code,
      rank: index + 1,
      appId: `ios:${item.id}`,
      ...titles,
      ...officialMetadata,
      developer: item.artistName || '',
      icon: item.artworkUrl100 || '',
      url: item.url || '',
    });
  }

  assertCompleteOfficialChart(records, `${country.code} Apple App Store games`);
  return {
    records,
    url,
    status: 'verified',
    categoryQuality: categoryQuality(records),
    descriptionQuality: descriptionQuality(records),
  };
}

export async function collectGoogleGames(country, translationCache, {
  gplayModule,
  checkedAt = new Date().toISOString(),
  detailConcurrency = 3,
} = {}) {
  const gplay = gplayModule || await import('@mradex77/google-play-scraper');
  const url = `https://play.google.com/store/apps/category/GAME?gl=${country.code}&hl=${encodeURIComponent(country.lang)}`;
  const items = await retry(`${country.code} Google Play TOP_FREE games`, () => gplay.list({
    collection: gplay.collection.TOP_FREE,
    category: gplay.category.GAME,
    country: country.google,
    lang: country.lang,
    num: TOP_N,
    fullDetail: false,
  }));
  if (!Array.isArray(items) || !items.length) throw new Error('Google Play games returned no chart entries');

  const chartItems = items.slice(0, TOP_N);
  const client = typeof gplay.createClient === 'function'
    ? gplay.createClient({ country: country.google, lang: country.lang, throttle: 4 })
    : null;
  const details = client
    ? await parallelMap(chartItems, detailConcurrency, item => retry(
        `${country.code} Google Play game ${item.appId}`,
        () => client.app({ appId: item.appId }),
        { attempts: 3, baseDelayMs: 1200 },
      ))
    : chartItems.map(() => null);

  const records = [];
  for (const [index, item] of chartItems.entries()) {
    const detail = details[index] && !details[index].error ? details[index] : null;
    const titles = await titleFields(item.title, country.code, translationCache);
    const appId = item.appId;
    const appUrl = detail?.url || item.url ||
      `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&gl=${country.code}&hl=${encodeURIComponent(country.lang)}`;
    const category = normalizeGameCategory(detail?.genre || item.genre, detail?.genreId || item.genreId);
    const descriptionMetadata = detail?.summary || detail?.description || item.summary || item.description
      ? officialDescriptionMetadata(
          detail?.summary || detail?.description || item.summary || item.description,
          appUrl,
          checkedAt,
        )
      : unavailableDescription(
          appUrl,
          checkedAt,
          details[index]?.error
            ? `detail_lookup_failed: ${details[index].error.message}`
            : 'official_description_missing',
        );

    records.push({
      chartType: 'games',
      store: 'google',
      country: country.code,
      rank: index + 1,
      appId: `android:${appId}`,
      ...titles,
      ...descriptionMetadata,
      category,
      categoryId: String(detail?.genreId || item.genreId || 'GAME'),
      developer: detail?.developer || item.developer || '',
      icon: detail?.icon || item.icon || '',
      url: appUrl,
    });
  }

  assertCompleteOfficialChart(records, `${country.code} Google Play games`);
  return {
    records,
    url,
    status: 'verified',
    descriptionQuality: descriptionQuality(records),
  };
}

function sourceEntry(store, country, result, error) {
  const defaultUrl = store === 'apple'
    ? `https://rss.marketingtools.apple.com/api/v2/${country.apple}/games/top-free/${TOP_N}/games.json`
    : `https://play.google.com/store/apps/category/GAME?gl=${country.code}&hl=${encodeURIComponent(country.lang)}`;
  return {
    chartType: 'games',
    store,
    country: country.code,
    status: result?.status || 'unavailable',
    url: result?.url || defaultUrl,
    ...(result?.categoryQuality ? { categoryQuality: result.categoryQuality } : {}),
    ...(result?.descriptionQuality ? { descriptionQuality: result.descriptionQuality } : {}),
    note: error
      ? `Official game chart unavailable: ${error.message}`
      : `Official ${store === 'apple' ? 'Apple Games RSS/App Store' : 'Google Play Top Free Games'} TOP ${TOP_N}.`,
  };
}

export function buildGameCategories(rows) {
  const counts = new Map();
  for (const row of rows) {
    const category = cleanTitle(row.category) || (row.store === 'apple' ? '미확인' : '게임');
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'ko'));
}

function buildComposition(records, sources) {
  const composition = {};
  for (const store of ['apple', 'google']) {
    for (const country of GAME_COUNTRIES) {
      const key = `${store}-${country.code}`;
      const rows = records.filter(row => row.store === store && row.country === country.code);
      composition[key] = {
        chartType: 'games',
        store,
        country: country.code,
        status: sources[key]?.status || 'unavailable',
        total: rows.length,
        categories: buildGameCategories(rows),
      };
    }
  }
  return composition;
}

export async function collectGameSnapshot({
  date = todayKst(),
  fetcher = fetchJson,
  gplayModule,
} = {}) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const translationCache = await readJson(TRANSLATIONS_FILE, {});
  const records = [];
  const sources = {};

  for (const country of GAME_COUNTRIES) {
    console.log(`Collecting ${country.code} Apple App Store games…`);
    try {
      const result = await collectAppleGames(country, translationCache, { fetcher });
      records.push(...result.records);
      sources[`apple-${country.code}`] = sourceEntry('apple', country, result);
      console.log(`  Apple games: ${result.records.length}`);
    } catch (error) {
      console.error(`  Apple games failed: ${error.message}`);
      sources[`apple-${country.code}`] = sourceEntry('apple', country, null, error);
    }

    console.log(`Collecting ${country.code} Google Play games…`);
    try {
      const result = await collectGoogleGames(country, translationCache, { gplayModule });
      records.push(...result.records);
      sources[`google-${country.code}`] = sourceEntry('google', country, result);
      console.log(`  Google games: ${result.records.length}`);
    } catch (error) {
      console.error(`  Google games failed: ${error.message}`);
      sources[`google-${country.code}`] = sourceEntry('google', country, null, error);
    }
    await sleep(350);
  }

  const snapshot = {
    date,
    generatedAt: new Date().toISOString(),
    chartType: 'games',
    officialOnly: true,
    topN: TOP_N,
    titleFormat: {
      KR: '원문', US: '원문', JP: '한글 번역(원어)', CN: '한글 번역(원어)',
      FR: '한글 번역(원어)', AU: '한글 번역(원어)', DE: '한글 번역(원어)',
    },
    sources,
    records,
  };
  snapshot.categoryComposition = buildComposition(records, sources);

  const snapshotFile = path.join(DATA_DIR, `${date}.json`);
  await fs.writeFile(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.writeFile(TRANSLATIONS_FILE, `${JSON.stringify(translationCache, null, 2)}\n`, 'utf8');

  const indexFile = path.join(DATA_DIR, 'index.json');
  const index = await readJson(indexFile, { chartType: 'games', snapshots: [] });
  const coverage = {
    apple: GAME_COUNTRIES.filter(country => sources[`apple-${country.code}`]?.status === 'verified').length,
    google: GAME_COUNTRIES.filter(country => sources[`google-${country.code}`]?.status === 'verified').length,
  };
  const meta = {
    date,
    file: `data/games/${date}.json`,
    label: `${date} official free game charts`,
    coverage,
    chartType: 'games',
    officialOnly: true,
  };
  index.chartType = 'games';
  index.snapshots = [...(index.snapshots || []).filter(item => item.date !== date), meta]
    .sort((a, b) => a.date.localeCompare(b.date));
  await fs.writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const verifiedCount = Object.values(sources).filter(source => source.status === 'verified').length;
  console.log(
    `Saved ${snapshotFile}: ${records.length} game records, ` +
      `${verifiedCount}/14 charts verified, ${14 - verifiedCount} unavailable`,
  );
  return { snapshot, index };
}

async function main() {
  await collectGameSnapshot();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
