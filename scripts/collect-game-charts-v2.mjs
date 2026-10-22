import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { fetchJson } from './fetch-json.mjs';
import { resolveAppleMetadata, categoryQuality } from './apple-categories.mjs';
import { descriptionQuality } from './descriptions.mjs';
import {
  buildGameCategories,
  collectGoogleGames,
  GAME_COUNTRIES,
  todayKst,
} from './collect-game-charts.mjs';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data', 'games');
const TRANSLATIONS_FILE = path.join(ROOT, 'data', 'translations.json');
const TOP_N = 25;
const TRANSLATE_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);

const BRAND_TRANSLATIONS = new Map(Object.entries({
  Roblox: '로블록스', Minecraft: '마인크래프트', Fortnite: '포트나이트',
  'Pokémon GO': '포켓몬 GO', 'Brawl Stars': '브롤스타즈',
  'Clash Royale': '클래시 로얄', 'Clash of Clans': '클래시 오브 클랜',
  'Candy Crush Saga': '캔디크러쉬사가', 'Royal Match': '로얄 매치',
  'MONOPOLY GO!': '모노폴리 GO!', 'PUBG MOBILE': '배틀그라운드 모바일',
}));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

function legacyAppleGamesUrl(country) {
  return `https://itunes.apple.com/${country.toLowerCase()}/rss/topfreeapplications/limit=25/genre=6014/json`;
}

function label(object, key) {
  return object?.[key]?.label ?? '';
}

function alternateLink(entry) {
  const links = Array.isArray(entry?.link) ? entry.link : entry?.link ? [entry.link] : [];
  return links.find(link => link?.attributes?.rel === 'alternate')?.attributes?.href ||
    entry?.id?.label || '';
}

function parseLegacyAppleEntry(entry) {
  const id = String(entry?.id?.attributes?.['im:id'] ||
    String(entry?.id?.label || '').match(/\/id(\d+)/)?.[1] || '');
  const images = Array.isArray(entry?.['im:image']) ? entry['im:image'] : [];
  const genre = entry?.category?.attributes || {};
  return {
    id,
    name: clean(label(entry, 'im:name')),
    artistName: clean(label(entry, 'im:artist')),
    artworkUrl100: images.at(-1)?.label || '',
    url: alternateLink(entry),
    genres: genre['im:id'] ? [{ genreId: String(genre['im:id']), name: genre.label || 'Games' }] : [],
  };
}

async function translateToKorean(text, cache, fetcher = fetchJson) {
  const original = clean(text);
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
    const translated = clean((result?.[0] || []).map(part => part?.[0] || '').join('')) || original;
    cache[original] = translated;
    await sleep(140);
    return translated;
  } catch (error) {
    console.warn(`Game title translation fallback for “${original}”: ${error.message}`);
    return original;
  }
}

async function titleFields(originalTitle, country, cache, fetcher) {
  const original = clean(originalTitle);
  if (!TRANSLATE_COUNTRIES.has(country)) {
    return { title: original, originalTitle: original, translatedTitle: null };
  }
  const translated = await translateToKorean(original, cache, fetcher);
  return {
    title: `${translated} (${original})`,
    originalTitle: original,
    translatedTitle: translated,
  };
}

function assertExactChart(records, labelText) {
  if (records.length !== TOP_N) {
    throw new Error(`${labelText} returned ${records.length}/${TOP_N}; exact mapping is unavailable`);
  }
  const ids = new Set();
  for (const record of records) {
    if (!record.appId || !record.originalTitle || !record.url) {
      throw new Error(`${labelText} contains an entry without a stable ID, title, or official URL`);
    }
    if (ids.has(record.appId)) throw new Error(`${labelText} contains duplicate ${record.appId}`);
    ids.add(record.appId);
  }
}

export async function collectAppleGamesLegacy(country, translationCache, {
  fetcher = fetchJson,
  checkedAt = new Date().toISOString(),
} = {}) {
  const url = legacyAppleGamesUrl(country.apple);
  const json = await fetcher(url);
  const entries = json?.feed?.entry || [];
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('Apple official Games RSS returned no entries');
  }
  const chartItems = entries.slice(0, TOP_N).map(parseLegacyAppleEntry);
  if (chartItems.some(item => !/^\d+$/.test(item.id))) {
    throw new Error('Apple official Games RSS contains an invalid app ID');
  }

  // Use the chart only for membership and ordering. Official Lookup supplies
  // descriptions and trustworthy category metadata, matched strictly by app ID.
  const metadataItems = chartItems.map(item => ({ ...item, genres: [] }));
  const metadata = await resolveAppleMetadata(metadataItems, country.apple, { fetcher, checkedAt });
  const records = [];

  for (const [index, item] of chartItems.entries()) {
    const titles = await titleFields(item.name, country.code, translationCache, fetcher);
    records.push({
      chartType: 'games',
      store: 'apple',
      country: country.code,
      rank: index + 1,
      appId: `ios:${item.id}`,
      ...titles,
      ...metadata[index],
      developer: item.artistName || '',
      icon: item.artworkUrl100 || '',
      url: item.url || '',
    });
  }

  assertExactChart(records, `${country.code} Apple App Store games`);
  return {
    records,
    url,
    status: 'verified',
    categoryQuality: categoryQuality(records),
    descriptionQuality: descriptionQuality(records),
  };
}

function sourceEntry(store, country, result, error) {
  const defaultUrl = store === 'apple'
    ? legacyAppleGamesUrl(country.apple)
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
      : `Official ${store === 'apple' ? 'Apple category-filtered Games RSS' : 'Google Play Top Free Games'} TOP ${TOP_N}.`,
  };
}

function composition(records, sources) {
  const result = {};
  for (const store of ['apple', 'google']) {
    for (const country of GAME_COUNTRIES) {
      const key = `${store}-${country.code}`;
      const rows = records.filter(row => row.store === store && row.country === country.code);
      result[key] = {
        chartType: 'games',
        store,
        country: country.code,
        status: sources[key]?.status || 'unavailable',
        total: rows.length,
        categories: buildGameCategories(rows),
      };
    }
  }
  return result;
}

export async function collectGameSnapshotV2({
  date = todayKst(),
  fetcher = fetchJson,
  gplayModule,
} = {}) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const translationCache = await readJson(TRANSLATIONS_FILE, {});
  const records = [];
  const sources = {};

  for (const country of GAME_COUNTRIES) {
    console.log(`Collecting ${country.code} Apple App Store games from official category feed…`);
    try {
      const result = await collectAppleGamesLegacy(country, translationCache, { fetcher });
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
  snapshot.categoryComposition = composition(records, sources);

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
  console.log(`Saved ${snapshotFile}: ${records.length} game records, ${verifiedCount}/14 verified, ${14 - verifiedCount} unavailable`);
  return { snapshot, index };
}

async function main() {
  await collectGameSnapshotV2();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
