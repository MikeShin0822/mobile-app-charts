import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAppleGamesLegacy,
} from '../scripts/collect-game-charts-v2.mjs';
import { buildGameCategories, GAME_COUNTRIES } from '../scripts/collect-game-charts.mjs';
import { validateGameSnapshotV2 } from '../scripts/validate-game-snapshot-v2.mjs';

const checkedAt = '2026-10-22T15:00:00.000Z';

function legacyEntries(count = 25) {
  return Array.from({ length: count }, (_, index) => {
    const id = String(2000 + index);
    return {
      'im:name': { label: `Legacy Game ${index + 1}` },
      'im:artist': { label: `Legacy Studio ${index + 1}` },
      'im:image': [
        { label: `https://example.com/${id}-60.png` },
        { label: `https://example.com/${id}-100.png` },
      ],
      id: {
        label: `https://apps.apple.com/kr/app/legacy-game-${index + 1}/id${id}`,
        attributes: { 'im:id': id },
      },
      link: [{
        attributes: {
          rel: 'alternate',
          href: `https://apps.apple.com/kr/app/legacy-game-${index + 1}/id${id}`,
        },
      }],
      category: { attributes: { 'im:id': '6014', label: 'Games' } },
    };
  });
}

function lookupResults(entries) {
  return {
    results: [...entries].reverse().map(entry => {
      const id = entry.id.attributes['im:id'];
      return {
        wrapperType: 'software',
        trackId: Number(id),
        primaryGenreId: 6014,
        primaryGenreName: 'Games',
        description: `${entry['im:name'].label}의 공식 App Store 설명입니다. 새로운 도전과 다양한 스테이지를 즐겨보세요.`,
      };
    }),
  };
}

async function collectFixture(count = 25) {
  const entries = legacyEntries(count);
  let feedCalls = 0;
  let lookupCalls = 0;
  const result = await collectAppleGamesLegacy(
    { code: 'KR', apple: 'kr', google: 'kr', lang: 'ko' },
    {},
    {
      checkedAt,
      fetcher: async url => {
        const parsed = new URL(url);
        if (parsed.pathname.includes('/rss/topfreeapplications/')) {
          feedCalls += 1;
          assert.equal(
            parsed.href,
            'https://itunes.apple.com/kr/rss/topfreeapplications/limit=25/genre=6014/json',
          );
          return { feed: { entry: entries } };
        }
        lookupCalls += 1;
        assert.equal(parsed.hostname, 'itunes.apple.com');
        assert.equal(parsed.pathname, '/lookup');
        assert.equal(parsed.searchParams.get('country'), 'kr');
        assert.deepEqual(parsed.searchParams.get('id').split(','),
          entries.map(entry => entry.id.attributes['im:id']));
        return lookupResults(entries);
      },
    },
  );
  return { result, feedCalls, lookupCalls };
}

test('Apple legacy official Games RSS returns exact country-level free-game ranks', async () => {
  const { result, feedCalls, lookupCalls } = await collectFixture();
  assert.equal(feedCalls, 1);
  assert.equal(lookupCalls, 1);
  assert.equal(result.url,
    'https://itunes.apple.com/kr/rss/topfreeapplications/limit=25/genre=6014/json');
  assert.equal(result.records.length, 25);
  assert.deepEqual(result.records.map(record => record.rank),
    Array.from({ length: 25 }, (_, index) => index + 1));
  assert.deepEqual(result.records.map(record => record.appId),
    Array.from({ length: 25 }, (_, index) => `ios:${2000 + index}`));
  assert(result.records.every(record => record.descriptionStatus === 'verified'));
  assert(result.records.every(record => record.categoryStatus === 'verified'));
  assert.deepEqual(result.descriptionQuality, { status: 'complete', verified: 25, unavailable: 0 });
});

test('Apple legacy Games RSS refuses partial charts rather than guessing missing ranks', async () => {
  await assert.rejects(collectFixture(24), /24\/25/);
});

function unavailableSource(store, country) {
  return {
    chartType: 'games',
    store,
    country,
    status: 'unavailable',
    url: store === 'apple'
      ? `https://itunes.apple.com/${country.toLowerCase()}/rss/topfreeapplications/limit=25/genre=6014/json`
      : `https://play.google.com/store/apps/category/GAME?gl=${country}&hl=en`,
    note: 'Official game chart unavailable: fixture',
  };
}

test('v2 validator accepts the strict official Apple category-filtered feed provenance', async () => {
  const { result } = await collectFixture();
  const sources = {};
  const categoryComposition = {};
  for (const store of ['apple', 'google']) {
    for (const country of GAME_COUNTRIES) {
      const key = `${store}-${country.code}`;
      sources[key] = unavailableSource(store, country.code);
      categoryComposition[key] = {
        chartType: 'games', store, country: country.code,
        status: 'unavailable', total: 0, categories: [],
      };
    }
  }
  sources['apple-KR'] = {
    chartType: 'games', store: 'apple', country: 'KR', status: 'verified',
    url: result.url, categoryQuality: result.categoryQuality,
    descriptionQuality: result.descriptionQuality,
    note: 'Official Apple category-filtered Games RSS TOP 25.',
  };
  categoryComposition['apple-KR'] = {
    chartType: 'games', store: 'apple', country: 'KR', status: 'verified',
    total: 25, categories: buildGameCategories(result.records),
  };
  const snapshot = {
    date: '2026-10-22', generatedAt: checkedAt, chartType: 'games',
    officialOnly: true, topN: 25, sources,
    records: result.records, categoryComposition,
  };
  const index = {
    chartType: 'games',
    snapshots: [{
      date: '2026-10-22', file: 'data/games/2026-10-22.json',
      label: '2026-10-22 official free game charts', coverage: { apple: 1, google: 0 },
      chartType: 'games', officialOnly: true,
    }],
  };
  assert.equal(validateGameSnapshotV2(snapshot, index, '2026-10-22').records, 25);

  snapshot.sources['apple-KR'].url =
    'https://itunes.apple.com/us/rss/topfreeapplications/limit=25/genre=6014/json';
  assert.throws(() => validateGameSnapshotV2(snapshot, index, '2026-10-22'), /official category-filtered/);
});
