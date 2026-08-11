import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as gplay from '@mradex77/google-play-scraper';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const TOP_N = 25;
const TRANSLATE_COUNTRIES = new Set(['JP', 'CN', 'FR', 'AU', 'DE']);
const COUNTRIES = [
  { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
  { code: 'US', apple: 'us', google: 'us', lang: 'en' },
  { code: 'JP', apple: 'jp', google: 'jp', lang: 'ja' },
  { code: 'CN', apple: 'cn', google: 'cn', lang: 'zh-CN' },
  { code: 'FR', apple: 'fr', google: 'fr', lang: 'fr' },
  { code: 'AU', apple: 'au', google: 'au', lang: 'en' },
  { code: 'DE', apple: 'de', google: 'de', lang: 'de' },
];

const APPLE_CATEGORIES = {
  '6000': '비즈니스', '6001': '날씨', '6002': '유틸리티', '6003': '여행',
  '6004': '스포츠', '6005': '소셜', '6006': '도서·참고자료', '6007': '생산성',
  '6008': '사진·비디오', '6009': '뉴스', '6010': '내비게이션', '6011': '음악',
  '6012': '라이프스타일', '6013': '건강·피트니스', '6014': '게임', '6015': '금융',
  '6016': '엔터테인먼트', '6017': '교육', '6018': '도서', '6020': '의료',
  '6021': '잡지·신문', '6022': '카탈로그', '6023': '음식·음료', '6024': '쇼핑',
  '6026': '개발자 도구', '6027': '그래픽·디자인',
};

const GOOGLE_CATEGORIES = {
  ART_AND_DESIGN: '예술·디자인', AUTO_AND_VEHICLES: '자동차', BEAUTY: '뷰티',
  BOOKS_AND_REFERENCE: '도서·참고자료', BUSINESS: '비즈니스', COMICS: '만화',
  COMMUNICATION: '커뮤니케이션', DATING: '데이트', EDUCATION: '교육',
  ENTERTAINMENT: '엔터테인먼트', EVENTS: '이벤트', FINANCE: '금융',
  FOOD_AND_DRINK: '음식·음료', HEALTH_AND_FITNESS: '건강·피트니스',
  HOUSE_AND_HOME: '주택·홈', LIBRARIES_AND_DEMO: '라이브러리·데모',
  LIFESTYLE: '라이프스타일', MAPS_AND_NAVIGATION: '지도·내비게이션',
  MEDICAL: '의료', MUSIC_AND_AUDIO: '음악·오디오', NEWS_AND_MAGAZINES: '뉴스·잡지',
  PARENTING: '육아', PERSONALIZATION: '맞춤설정', PHOTOGRAPHY: '사진',
  PRODUCTIVITY: '생산성', SHOPPING: '쇼핑', SOCIAL: '소셜', SPORTS: '스포츠',
  TOOLS: '도구', TRAVEL_AND_LOCAL: '여행·지역', VIDEO_PLAYERS: '동영상',
  VIDEO_PLAYERS_AND_EDITORS: '동영상', WEATHER: '날씨', GAME: '게임',
};

const BRAND_TRANSLATIONS = new Map(Object.entries({
  'ChatGPT': '챗GPT', 'Google Gemini': '구글 제미나이', 'Gemini': '제미나이',
  'Claude': '클로드', 'Claude by Anthropic': '앤트로픽 클로드', 'Threads': '스레드',
  'TikTok': '틱톡', 'TikTok Lite': '틱톡 라이트', 'Instagram': '인스타그램',
  'WhatsApp Messenger': '왓츠앱 메신저', 'WhatsApp': '왓츠앱', 'Netflix': '넷플릭스',
  'Disney+': '디즈니+', 'CapCut': '캡컷', 'Discord': '디스코드', 'Roblox': '로블록스',
  'Temu': '테무', 'Vinted': '빈티드', 'Google Maps': '구글 지도', 'Gmail': '지메일',
  'Facebook': '페이스북', 'Messenger': '메신저', 'Telegram': '텔레그램',
  'Spotify': '스포티파이', 'YouTube': '유튜브', 'Amazon': '아마존', 'X': '엑스',
}));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const todayKst = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function fetchJson(url, { attempts = 3, timeoutMs = 30000, headers = {} } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'user-agent': 'mobile-app-charts/1.0 (+https://github.com/MikeShin0822/mobile-app-charts)', ...headers },
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function normalizeCategory(value, genreId, store) {
  if (store === 'apple') return APPLE_CATEGORIES[String(genreId)] || value || '기타';
  const key = String(genreId || value || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return GOOGLE_CATEGORIES[key] || value || '기타';
}

function cleanTitle(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function translateToKorean(text, cache) {
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
    const result = await fetchJson(endpoint, { attempts: 2, timeoutMs: 15000 });
    const translated = cleanTitle((result?.[0] || []).map(part => part?.[0] || '').join('')) || original;
    cache[original] = translated;
    await sleep(90);
    return translated;
  } catch (error) {
    console.warn(`Translation fallback for “${original}”: ${error.message}`);
    cache[original] = original;
    return original;
  }
}

async function titleFields(originalTitle, country, cache) {
  const original = cleanTitle(originalTitle);
  if (!TRANSLATE_COUNTRIES.has(country)) {
    return { title: original, originalTitle: original, translatedTitle: null };
  }
  const translated = await translateToKorean(original, cache);
  return {
    title: `${translated} (${original})`,
    originalTitle: original,
    translatedTitle: translated,
  };
}

async function collectApple(country, translationCache) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${country.apple}/apps/top-free/${TOP_N}/apps.json`;
  const json = await fetchJson(url);
  const items = json?.feed?.results || [];
  if (!items.length) throw new Error('Apple RSS returned no chart entries');
  const records = [];
  for (const [index, item] of items.slice(0, TOP_N).entries()) {
    const genre = item.genres?.[0] || {};
    const titles = await titleFields(item.name, country.code, translationCache);
    const category = normalizeCategory(genre.name, genre.genreId, 'apple');
    records.push({
      store: 'apple', country: country.code, rank: index + 1,
      appId: `ios:${item.id}`, ...titles,
      description: `${category} · ${item.artistName || '개발사 정보 없음'}`,
      category, categoryId: String(genre.genreId || ''), developer: item.artistName || '',
      icon: item.artworkUrl100 || '', url: item.url || '',
    });
  }
  return { records, url, status: records.length >= TOP_N ? 'verified' : 'partial_official' };
}

async function collectGoogle(country, translationCache) {
  const url = `https://play.google.com/store/apps/collection/topselling_free?gl=${country.code}&hl=${encodeURIComponent(country.lang)}`;
  const items = await gplay.list({
    collection: gplay.collection.TOP_FREE,
    category: gplay.category.APPLICATION,
    country: country.google,
    lang: country.lang,
    num: TOP_N,
    fullDetail: false,
    throttle: 250,
  });
  if (!Array.isArray(items) || !items.length) throw new Error('Google Play returned no chart entries');
  const records = [];
  for (const [index, item] of items.slice(0, TOP_N).entries()) {
    const titles = await titleFields(item.title, country.code, translationCache);
    const category = normalizeCategory(item.genre, item.genreId, 'google');
    records.push({
      store: 'google', country: country.code, rank: index + 1,
      appId: `android:${item.appId}`, ...titles,
      description: `${category} · ${item.developer || '개발사 정보 없음'}`,
      category, categoryId: String(item.genreId || ''), developer: item.developer || '',
      icon: item.icon || '', url: item.url || `https://play.google.com/store/apps/details?id=${item.appId}`,
    });
  }
  return { records, url, status: records.length >= TOP_N ? 'verified' : 'partial_official' };
}

function sourceEntry(store, country, result, error) {
  const defaultUrl = store === 'apple'
    ? `https://apps.apple.com/${country.apple}/iphone/charts`
    : `https://play.google.com/store/apps/collection/topselling_free?gl=${country.code}&hl=${encodeURIComponent(country.lang)}`;
  return {
    store, country: country.code,
    status: result?.status || 'unavailable',
    url: result?.url || defaultUrl,
    note: error ? error.message : `Official ${store === 'apple' ? 'Apple RSS/App Store' : 'Google Play Top Free collection'} TOP ${TOP_N}.`,
  };
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const date = todayKst();
  const translationsFile = path.join(DATA_DIR, 'translations.json');
  const translationCache = await readJson(translationsFile, {});
  const records = [];
  const sources = {};

  for (const country of COUNTRIES) {
    console.log(`Collecting ${country.code} Apple App Store…`);
    try {
      const result = await collectApple(country, translationCache);
      records.push(...result.records);
      sources[`apple-${country.code}`] = sourceEntry('apple', country, result);
      console.log(`  Apple: ${result.records.length}`);
    } catch (error) {
      console.error(`  Apple failed: ${error.message}`);
      sources[`apple-${country.code}`] = sourceEntry('apple', country, null, error);
    }

    console.log(`Collecting ${country.code} Google Play…`);
    try {
      const result = await collectGoogle(country, translationCache);
      records.push(...result.records);
      sources[`google-${country.code}`] = sourceEntry('google', country, result);
      console.log(`  Google: ${result.records.length}`);
    } catch (error) {
      console.error(`  Google failed: ${error.message}`);
      sources[`google-${country.code}`] = sourceEntry('google', country, null, error);
    }
    await sleep(350);
  }

  const snapshot = {
    date,
    generatedAt: new Date().toISOString(),
    officialOnly: true,
    topN: TOP_N,
    titleFormat: {
      KR: '원문', US: '원문', JP: '한글 번역(원어)', CN: '한글 번역(원어)',
      FR: '한글 번역(원어)', AU: '한글 번역(원어)', DE: '한글 번역(원어)',
    },
    sources,
    records,
  };

  const snapshotFile = path.join(DATA_DIR, `${date}.json`);
  await fs.writeFile(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.writeFile(translationsFile, `${JSON.stringify(translationCache, null, 2)}\n`, 'utf8');

  const indexFile = path.join(DATA_DIR, 'index.json');
  const index = await readJson(indexFile, { snapshots: [] });
  const coverage = {
    apple: COUNTRIES.filter(c => sources[`apple-${c.code}`]?.status === 'verified').length,
    google: COUNTRIES.filter(c => sources[`google-${c.code}`]?.status === 'verified').length,
  };
  const meta = { date, file: `data/${date}.json`, label: `${date} official charts`, coverage, officialOnly: true };
  index.snapshots = [...(index.snapshots || []).filter(item => item.date !== date), meta]
    .sort((a, b) => a.date.localeCompare(b.date));
  await fs.writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  const appleCount = records.filter(record => record.store === 'apple').length;
  const googleCount = records.filter(record => record.store === 'google').length;
  console.log(`Saved ${snapshotFile}: Apple ${appleCount}, Google ${googleCount}`);
  if (!googleCount) process.exitCode = 2;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
