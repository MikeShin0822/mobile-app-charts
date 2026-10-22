import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  descriptionQuality,
  officialDescriptionMetadata,
  unavailableDescription,
} from './descriptions.mjs';

const DATA_DIR = path.join(process.cwd(), 'data');
const COUNTRY_OPTIONS = {
  KR: { country: 'kr', lang: 'ko' },
  US: { country: 'us', lang: 'en' },
  JP: { country: 'jp', lang: 'ja' },
  CN: { country: 'cn', lang: 'zh-CN' },
  FR: { country: 'fr', lang: 'fr' },
  AU: { country: 'au', lang: 'en' },
  DE: { country: 'de', lang: 'de' },
};

const CATEGORY_NAMES = {
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

const todayKst = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const normalizeCategory = (genre, genreId) => {
  const key = String(genreId || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return CATEGORY_NAMES[key] || genre || '기타';
};

async function defaultClientFactory(options) {
  const { createClient } = await import('@mradex77/google-play-scraper');
  return createClient(options);
}

async function retry(label, operation, { attempts = 3, baseDelayMs = 700 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(baseDelayMs * attempt);
    }
  }
  throw new Error(`${label}: ${lastError?.message || 'detail lookup failed'}`);
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

export async function enrichGoogleSnapshot(snapshot, {
  clientFactory = defaultClientFactory,
  checkedAt = new Date().toISOString(),
  concurrency = 3,
  attempts = 3,
} = {}) {
  for (const [countryCode, options] of Object.entries(COUNTRY_OPTIONS)) {
    const rows = snapshot.records.filter(
      record => record.store === 'google' && record.country === countryCode,
    );
    if (!rows.length) continue;

    console.log(`Enriching Google Play details for ${countryCode} (${rows.length})…`);
    const client = await clientFactory({ ...options, throttle: 4 });
    const details = await parallelMap(rows, concurrency, record => retry(
      record.appId,
      () => client.app({ appId: record.appId.replace(/^android:/, '') }),
      { attempts },
    ));

    details.forEach((detail, index) => {
      const row = rows[index];
      if (!detail || detail.error) {
        console.warn(`  ${row.appId}: ${detail?.error?.message || 'detail lookup failed'}`);
        if (row.descriptionStatus !== 'verified') {
          Object.assign(row, unavailableDescription(
            row.url,
            checkedAt,
            `detail_lookup_failed: ${detail?.error?.message || 'unknown error'}`,
          ));
        }
        return;
      }

      const category = normalizeCategory(detail.genre, detail.genreId);
      row.category = category;
      row.categoryId = String(detail.genreId || '');
      row.developer = detail.developer || row.developer || '';
      row.icon = detail.icon || row.icon || '';
      row.url = detail.url || row.url || '';
      Object.assign(
        row,
        officialDescriptionMetadata(
          detail.summary || detail.description,
          row.url,
          checkedAt,
        ),
      );
    });

    const source = snapshot.sources?.[`google-${countryCode}`];
    if (source) source.descriptionQuality = descriptionQuality(rows);
  }

  return snapshot;
}

async function main() {
  const date = process.argv[2] || todayKst();
  const snapshotPath = path.join(DATA_DIR, `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  await enrichGoogleSnapshot(snapshot);
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const googleRows = snapshot.records.filter(record => record.store === 'google');
  const categories = googleRows.filter(record => record.category !== '기타').length;
  const descriptions = googleRows.filter(record => record.descriptionStatus === 'verified').length;
  console.log(
    `Google detail enrichment complete: categories ${categories}/${googleRows.length}, ` +
      `descriptions ${descriptions}/${googleRows.length}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
