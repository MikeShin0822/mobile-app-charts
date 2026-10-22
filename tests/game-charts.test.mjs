import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGameCategories,
  collectAppleGames,
  collectGoogleGames,
  GAME_COUNTRIES,
} from '../scripts/collect-game-charts.mjs';
import { validateGameSnapshot } from '../scripts/validate-game-snapshot.mjs';

const checkedAt = '2026-10-22T12:00:00.000Z';
const titles = async originalTitle => ({ title: originalTitle, originalTitle, translatedTitle: null });

function appleItems() {
  return Array.from({ length: 25 }, (_, index) => ({
    id: String(1000 + index),
    name: `Apple Game ${index + 1}`,
    artistName: `Apple Studio ${index + 1}`,
    artworkUrl100: `https://example.com/apple-${index + 1}.png`,
    url: `https://apps.apple.com/kr/app/game-${index + 1}/id${1000 + index}`,
    genres: [{ genreId: '6014', name: 'Games' }],
  }));
}

function appleLookup(items) {
  return {
    results: [...items].reverse().map(item => ({
      wrapperType: 'software',
      trackId: Number(item.id),
      primaryGenreId: 6014,
      primaryGenreName: 'Games',
      description: `${item.name} 공식 설명입니다. 친구와 함께 즐기고 새로운 스테이지를 탐험하세요.`,
    })),
  };
}

test('Apple official games RSS preserves exact 1–25 mapping and enriches official details by ID', async () => {
  const items = appleItems();
  let rssCalls = 0;
  let lookupCalls = 0;
  const result = await collectAppleGames(
    { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
    {},
    {
      checkedAt,
      titleResolver: titles,
      fetcher: async url => {
        const parsed = new URL(url);
        if (parsed.hostname === 'rss.marketingtools.apple.com') {
          rssCalls += 1;
          assert.equal(parsed.pathname, '/api/v2/kr/games/top-free/25/games.json');
          return { feed: { results: items } };
        }
        lookupCalls += 1;
        assert.equal(parsed.hostname, 'itunes.apple.com');
        assert.equal(parsed.searchParams.get('country'), 'kr');
        assert.deepEqual(parsed.searchParams.get('id').split(','), items.map(item => item.id));
        return appleLookup(items);
      },
    },
  );
  assert.equal(rssCalls, 1);
  assert.equal(lookupCalls, 1);
  assert.equal(result.records.length, 25);
  assert.deepEqual(result.records.map(row => row.rank), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual(result.records.map(row => row.appId), items.map(item => `ios:${item.id}`));
  assert(result.records.every(row => row.chartType === 'games'));
  assert(result.records.every(row => row.category === '게임' && row.categoryStatus === 'verified'));
  assert(result.records.every(row => row.descriptionStatus === 'verified'));
  assert.deepEqual(result.categoryQuality, { status: 'complete', verified: 25, unavailable: 0 });
  assert.deepEqual(result.descriptionQuality, { status: 'complete', verified: 25, unavailable: 0 });
});

function googleItems() {
  return Array.from({ length: 25 }, (_, index) => ({
    appId: `com.example.game${index + 1}`,
    title: `Google Game ${index + 1}`,
    developer: `Google Studio ${index + 1}`,
    icon: `https://example.com/google-${index + 1}.png`,
    url: `https://play.google.com/store/apps/details?id=com.example.game${index + 1}&gl=KR&hl=ko`,
    genre: 'Games',
    genreId: 'GAME',
  }));
}

function fakeGoogleModule(items) {
  return {
    collection: { TOP_FREE: 'TOP_FREE' },
    category: { GAME: 'GAME' },
    list: async options => {
      assert.equal(options.collection, 'TOP_FREE');
      assert.equal(options.category, 'GAME');
      assert.equal(options.country, 'kr');
      assert.equal(options.num, 25);
      return items;
    },
    createClient: options => {
      assert.equal(options.country, 'kr');
      return {
        app: async ({ appId }) => ({
          appId,
          genre: Number(appId.replace(/\D/g, '')) % 2 ? 'Action' : 'Puzzle',
          genreId: Number(appId.replace(/\D/g, '')) % 2 ? 'GAME_ACTION' : 'GAME_PUZZLE',
          developer: `Detail ${appId}`,
          icon: `https://example.com/${appId}.png`,
          url: `https://play.google.com/store/apps/details?id=${appId}&gl=KR&hl=ko`,
          summary: `${appId}의 공식 Google Play 게임 소개입니다.`,
        }),
      };
    },
  };
}

test('Google Play TOP_FREE GAME collection preserves order and uses official detail metadata', async () => {
  const items = googleItems();
  const result = await collectGoogleGames(
    { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
    {},
    { gplayModule: fakeGoogleModule(items), checkedAt },
  );
  assert.equal(result.records.length, 25);
  assert.deepEqual(result.records.map(row => row.appId), items.map(item => `android:${item.appId}`));
  assert(result.records.every(row => row.chartType === 'games'));
  assert(result.records.some(row => row.category === '액션'));
  assert(result.records.some(row => row.category === '퍼즐'));
  assert(result.records.every(row => row.descriptionStatus === 'verified'));
  assert.deepEqual(result.descriptionQuality, { status: 'complete', verified: 25, unavailable: 0 });
});

function unavailableSource(store, country) {
  return {
    chartType: 'games',
    store,
    country,
    status: 'unavailable',
    url: store === 'apple'
      ? `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/games/top-free/25/games.json`
      : `https://play.google.com/store/apps/category/GAME?gl=${country}&hl=en`,
    note: 'Official game chart unavailable: test fixture',
  };
}

async function validPartialSnapshot() {
  const apple = await collectAppleGames(
    { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
    {},
    {
      checkedAt,
      titleResolver: titles,
      fetcher: async url => new URL(url).hostname === 'rss.marketingtools.apple.com'
        ? { feed: { results: appleItems() } }
        : appleLookup(appleItems()),
    },
  );
  const google = await collectGoogleGames(
    { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
    {},
    { gplayModule: fakeGoogleModule(googleItems()), checkedAt },
  );

  const sources = {};
  const composition = {};
  for (const store of ['apple', 'google']) {
    for (const country of GAME_COUNTRIES) {
      const key = `${store}-${country.code}`;
      sources[key] = unavailableSource(store, country.code);
      composition[key] = {
        chartType: 'games', store, country: country.code,
        status: 'unavailable', total: 0, categories: [],
      };
    }
  }
  sources['apple-KR'] = {
    chartType: 'games', store: 'apple', country: 'KR', status: 'verified',
    url: apple.url, categoryQuality: apple.categoryQuality,
    descriptionQuality: apple.descriptionQuality, note: 'Official Apple Games TOP 25.',
  };
  sources['google-KR'] = {
    chartType: 'games', store: 'google', country: 'KR', status: 'verified',
    url: google.url, descriptionQuality: google.descriptionQuality,
    note: 'Official Google Play Games TOP 25.',
  };
  composition['apple-KR'] = {
    chartType: 'games', store: 'apple', country: 'KR', status: 'verified',
    total: 25, categories: buildGameCategories(apple.records),
  };
  composition['google-KR'] = {
    chartType: 'games', store: 'google', country: 'KR', status: 'verified',
    total: 25, categories: buildGameCategories(google.records),
  };
  const snapshot = {
    date: '2026-10-22', generatedAt: checkedAt, chartType: 'games', officialOnly: true,
    topN: 25, sources, records: [...apple.records, ...google.records],
    categoryComposition: composition,
  };
  const index = {
    chartType: 'games',
    snapshots: [{
      date: '2026-10-22', file: 'data/games/2026-10-22.json',
      label: '2026-10-22 official free game charts', chartType: 'games',
      officialOnly: true, coverage: { apple: 1, google: 1 },
    }],
  };
  return { snapshot, index };
}

test('game validator accepts verified and explicitly unavailable country/store charts', async () => {
  const { snapshot, index } = await validPartialSnapshot();
  const result = validateGameSnapshot(snapshot, index, '2026-10-22');
  assert.deepEqual(result, {
    verifiedCharts: 2, records: 50, unavailableDescriptions: 0, unavailableCategories: 0,
  });
});

test('game validator rejects partial verified charts and mismatched detail URLs', async () => {
  const { snapshot, index } = await validPartialSnapshot();
  const partial = structuredClone(snapshot);
  partial.records = partial.records.filter(row => !(row.store === 'google' && row.country === 'KR' && row.rank === 25));
  partial.categoryComposition['google-KR'].total = 24;
  partial.categoryComposition['google-KR'].categories = buildGameCategories(
    partial.records.filter(row => row.store === 'google' && row.country === 'KR'),
  );
  assert.throws(() => validateGameSnapshot(partial, index, '2026-10-22'), /exactly 25/);

  const badUrl = structuredClone(snapshot);
  badUrl.records.find(row => row.store === 'google').descriptionSource =
    'https://play.google.com/store/apps/details?id=com.other.game';
  assert.throws(() => validateGameSnapshot(badUrl, index, '2026-10-22'), /description source/);
});
