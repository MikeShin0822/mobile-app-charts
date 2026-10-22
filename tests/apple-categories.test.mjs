import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {
  resolveAppleCategories,
  rssCategory,
  categoryLabel,
  categoryQuality,
} from '../scripts/apple-categories.mjs';
import { collectApple } from '../scripts/collect-charts.mjs';
import { enrichAppleSnapshot } from '../scripts/enrich-apple-categories.mjs';
import { validateSnapshot } from '../scripts/validate-snapshot.mjs';
import { buildCategories } from '../tools/category-composition.mjs';
import { fetchJson } from '../scripts/fetch-json.mjs';
import {
  descriptionQuality,
  officialDescriptionMetadata,
} from '../scripts/descriptions.mjs';

const fixture = JSON.parse(
  await fs.readFile(new URL('./fixtures/apple-rss-2026-10-19.json', import.meta.url)),
);
const checkedAt = '2026-10-19T08:31:47.000Z';
const titles = async originalTitle => ({ title: originalTitle, originalTitle, translatedTitle: null });
const detail = (id, genre = 6007) => ({
  wrapperType: 'software',
  trackId: Number(id),
  primaryGenreId: genre,
  primaryGenreName: genre === 6024 ? 'Shopping' : 'Productivity',
  description: `Official App Store description for ${id}.`,
});
const successfulLookup = async url => ({
  results: new URL(url).searchParams.get('id').split(',').reverse().map(id => detail(id)),
});

for (const [country, json] of Object.entries(fixture)) {
  test(`${country}: captured RSS ranks remain unchanged while official lookup enriches categories and descriptions`, async () => {
    const items = json.feed.results;
    assert.equal(items.length, 25);
    assert.deepEqual(items.slice(0, 10).map(x => x.genres), Array.from({ length: 10 }, () => []));
    assert(items.slice(10).every(x => x.genres.length));

    const lookupGenres = new Map(items.map((item, index) => [
      item.id,
      index < 10 ? (index % 2 ? 6007 : 6024) : Number(item.genres[0].genreId),
    ]));
    let lookups = 0;
    const result = await collectApple({ apple: country.toLowerCase(), code: country }, {}, {
      titleResolver: titles,
      checkedAt,
      fetcher: async url => {
        const parsed = new URL(url);
        if (parsed.hostname === 'rss.marketingtools.apple.com') return json;
        lookups += 1;
        assert.equal(parsed.searchParams.get('country'), country.toLowerCase());
        assert.deepEqual(parsed.searchParams.get('id').split(','), items.map(x => x.id));
        return {
          results: [...items].reverse().map(item => detail(item.id, lookupGenres.get(item.id))),
        };
      },
    });

    assert.equal(lookups, 1);
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.categoryQuality, { status: 'complete', verified: 25, unavailable: 0 });
    assert.deepEqual(result.descriptionQuality, { status: 'complete', verified: 25, unavailable: 0 });
    result.records.forEach((record, index) => {
      assert.equal(record.rank, index + 1);
      assert.equal(record.appId, `ios:${items[index].id}`);
      assert.equal(record.url, items[index].url);
      assert.equal(record.originalTitle, items[index].name);
      assert.equal(record.categoryId, String(lookupGenres.get(items[index].id)));
      assert.equal(record.categoryStatus, 'verified');
      assert.equal(record.descriptionStatus, 'verified');
      assert.equal(record.description, `Official App Store description for ${items[index].id}.`);
    });
  });
}

test('valid RSS category skips category-only lookup; generic Apps and malformed genres are ignored', async () => {
  assert.equal(rssCategory({ genres: [{ genreId: '36', name: 'Apps' }, { genreId: '6007' }] }).category, '생산성');
  for (const genres of [null, {}, [], [null], [{ name: 'Productivity' }], [{ genreId: '36', name: 'Apps' }]]) {
    assert.equal(rssCategory({ genres }), null);
  }
  const [row] = await resolveAppleCategories([{ id: '1', genres: [{ genreId: '6007' }] }], 'kr', {
    fetcher: () => assert.fail('unnecessary lookup'),
    checkedAt,
  });
  assert.equal(row.category, '생산성');
  assert.equal(row.categoryCheckedAt, checkedAt);
});

test('unknown official genre ID retains the official label without inventing a taxonomy', async () => {
  const [row] = await resolveAppleCategories([{ id: '1' }], 'us', {
    fetcher: async () => ({
      results: [{ ...detail('1'), primaryGenreId: 9999, primaryGenreName: 'New Official Genre' }],
    }),
  });
  assert.equal(row.categoryId, '9999');
  assert.equal(row.category, 'New Official Genre');
});

test('lookup outage preserves 25 ranked records and explicitly marks missing metadata', async () => {
  const result = await collectApple({ apple: 'us', code: 'US' }, {}, {
    titleResolver: titles,
    checkedAt,
    fetcher: async url => {
      if (new URL(url).hostname.startsWith('rss.')) return fixture.US;
      throw new Error('503 Service Unavailable');
    },
  });
  assert.equal(result.records.length, 25);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.categoryQuality, { status: 'incomplete', verified: 15, unavailable: 10 });
  assert.deepEqual(result.descriptionQuality, { status: 'incomplete', verified: 0, unavailable: 25 });
  assert(result.records.slice(0, 10).every(row =>
    row.category === '미확인' && row.categoryId === '' && /lookup_failed/.test(row.categoryReason)));
  assert(result.records.every(row =>
    row.descriptionStatus === 'unavailable' && /lookup_failed/.test(row.descriptionReason)));
  assert.deepEqual(buildCategories(result.records).find(x => x.category === '미확인'),
    { category: '미확인', count: 10 });
});

test('partial, shuffled, wrong-ID, wrong-type, duplicate and missing-genre category results never guess', async () => {
  const rows = await resolveAppleCategories(['1', '2', '3', '4', '5', '6'].map(id => ({ id })), 'cn', {
    fetcher: async () => ({
      results: [
        detail('999'), detail('2'), detail('4'), detail('4'),
        { ...detail('3'), primaryGenreId: null },
        { ...detail('5'), wrapperType: 'artist' },
        { ...detail('6'), primaryGenreId: 9999, primaryGenreName: '   ' },
      ],
    }),
  });
  assert.deepEqual(rows.map(x => x.categoryStatus),
    ['unavailable', 'verified', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert(rows.filter(x => x.categoryStatus === 'unavailable')
    .every(x => x.categoryId === '' && x.categoryReason));
});

test('empty or malformed category lookup responses explicitly record missing metadata', async () => {
  for (const json of [{ results: [] }, {}, { results: null }]) {
    const [row] = await resolveAppleCategories([{ id: '1' }], 'fr', {
      fetcher: async () => json,
    });
    assert.equal(row.categoryStatus, 'unavailable');
    assert.equal(row.category, '미확인');
  }
});

test('HTTP failure and timeout abort are surfaced to official metadata fallback', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await assert.rejects(fetchJson('https://itunes.apple.com/lookup', { attempts: 1 }), /429/);
    globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) =>
      signal.addEventListener('abort', () => reject(new Error('aborted'))));
    await assert.rejects(
      fetchJson('https://itunes.apple.com/lookup', { attempts: 1, timeoutMs: 5 }),
      /aborted/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

async function snapshotWithMetadata(fetcher = successfulLookup) {
  const snapshot = JSON.parse(
    await fs.readFile(new URL('../data/2026-10-12.json', import.meta.url)),
  );
  await enrichAppleSnapshot(snapshot, { fetcher, checkedAt });

  for (const row of snapshot.records.filter(row => row.store === 'google')) {
    Object.assign(row, officialDescriptionMetadata(
      `Official Google Play description for ${row.appId}.`,
      row.url,
      checkedAt,
    ));
  }
  for (const country of ['KR', 'US', 'JP', 'CN', 'FR', 'AU', 'DE']) {
    const rows = snapshot.records.filter(row => row.store === 'google' && row.country === country);
    snapshot.sources[`google-${country}`].descriptionQuality = descriptionQuality(rows);
  }

  for (const [key, source] of Object.entries(snapshot.sources)) {
    const rows = snapshot.records.filter(
      row => row.store === source.store && row.country === source.country,
    );
    snapshot.categoryComposition[key].categories = buildCategories(rows);
  }
  const index = JSON.parse(await fs.readFile(new URL('../data/index.json', import.meta.url)));
  return { snapshot, index };
}

test('backfill preserves ranking, IDs, titles, timestamps and official store links', async () => {
  const original = JSON.parse(
    await fs.readFile(new URL('../data/2026-10-12.json', import.meta.url)),
  );
  const { snapshot, index } = await snapshotWithMetadata();
  assert.equal(snapshot.generatedAt, original.generatedAt);
  assert.equal(snapshot.date, original.date);
  snapshot.records.forEach((record, indexInSnapshot) => {
    for (const field of [
      'rank', 'appId', 'title', 'originalTitle', 'translatedTitle', 'developer', 'url', 'icon',
    ]) {
      assert.equal(record[field], original.records[indexInSnapshot][field]);
    }
    assert(['verified', 'unavailable'].includes(record.descriptionStatus));
  });
  assert.equal(validateSnapshot(snapshot, index).records, 350);
});

test('validator rejects silent category or description placeholders, false verification and bad provenance', async () => {
  const { snapshot, index } = await snapshotWithMetadata();
  for (const mutate of [
    value => { value.records[0].category = '기타'; value.records[0].categoryId = ''; },
    value => { delete value.records[0].categoryStatus; },
    value => { value.records[0].categoryId = ''; },
    value => { value.records[0].categorySource = 'https://itunes.apple.com/lookup?id=999&country=us'; },
    value => { delete value.sources['apple-KR'].categoryQuality; },
    value => { value.categoryComposition['apple-KR'].categories[0].category = 'wrong'; },
    value => { value.records[0].description = '금융 · 개발사'; },
    value => { delete value.records[0].descriptionStatus; },
    value => { value.records[0].descriptionSource = 'https://apps.apple.com/us/app/wrong/id999'; },
    value => { delete value.sources['apple-KR'].descriptionQuality; },
  ]) {
    const copy = structuredClone(snapshot);
    mutate(copy);
    assert.throws(() => validateSnapshot(copy, index));
  }
});

test('validator accepts explicit incomplete Apple metadata without dropping ranked records', async () => {
  const { snapshot, index } = await snapshotWithMetadata(async () => {
    throw new Error('timeout');
  });
  const result = validateSnapshot(snapshot, index);
  assert.equal(result.unavailableCategories, 70);
  assert.equal(result.unavailableDescriptions, 175);
  assert.equal(snapshot.records.length, 350);
  assert.deepEqual(snapshot.sources['apple-KR'].categoryQuality,
    { status: 'incomplete', verified: 15, unavailable: 10 });
  assert.deepEqual(snapshot.sources['apple-KR'].descriptionQuality,
    { status: 'incomplete', verified: 0, unavailable: 25 });
});

test('old snapshots and dashboard separate unknown categories from 기타', async () => {
  assert.equal(categoryLabel({ store: 'apple', category: '기타', categoryId: '' }), '미확인');
  const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ document: { getElementById: () => ({}) } });
  vm.runInContext(source.replace(/load\(\);\s*$/, ''), ctx);
  const result = vm.runInContext(
    `normalize({records:[{title:'App',store:'apple',country:'KR',rank:1,category:'기타',categoryId:''}]}).records[0].category`,
    ctx,
  );
  assert.equal(result, '미확인');
  assert.match(vm.runInContext(`bars([{category:'미확인'},{category:'생산성'}])`, ctx),
    /카테고리 미확인 1개/);
});
