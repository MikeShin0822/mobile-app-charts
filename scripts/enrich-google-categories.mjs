import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@mradex77/google-play-scraper';

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

const normalizeCategory = (genre, genreId) => {
  const key = String(genreId || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return CATEGORY_NAMES[key] || genre || '기타';
};

async function parallelMap(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = await mapper(items[index], index); }
      catch (error) { results[index] = { error }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const date = todayKst();
  const snapshotPath = path.join(DATA_DIR, `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

  for (const [countryCode, options] of Object.entries(COUNTRY_OPTIONS)) {
    const rows = snapshot.records.filter(record => record.store === 'google' && record.country === countryCode);
    if (!rows.length) continue;

    console.log(`Enriching Google Play categories for ${countryCode} (${rows.length})…`);
    const client = createClient({ ...options, throttle: 5 });
    const details = await parallelMap(rows, 5, record => client.app({ appId: record.appId.replace(/^android:/, '') }));

    details.forEach((detail, index) => {
      if (!detail || detail.error) {
        console.warn(`  ${rows[index].appId}: ${detail?.error?.message || 'detail lookup failed'}`);
        return;
      }
      const category = normalizeCategory(detail.genre, detail.genreId);
      rows[index].category = category;
      rows[index].categoryId = String(detail.genreId || '');
      rows[index].developer = detail.developer || rows[index].developer || '';
      rows[index].description = `${category} · ${rows[index].developer || '개발사 정보 없음'}`;
      rows[index].icon = detail.icon || rows[index].icon || '';
      rows[index].url = detail.url || rows[index].url || '';
    });
  }

  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const enriched = snapshot.records.filter(record => record.store === 'google' && record.category !== '기타').length;
  console.log(`Google category enrichment complete: ${enriched}/${snapshot.records.filter(record => record.store === 'google').length}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
