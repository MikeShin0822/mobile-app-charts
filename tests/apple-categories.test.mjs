import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { resolveAppleCategories, rssCategory, categoryLabel, categoryQuality } from '../scripts/apple-categories.mjs';
import { collectApple } from '../scripts/collect-charts.mjs';
import { enrichAppleSnapshot } from '../scripts/enrich-apple-categories.mjs';
import { validateSnapshot } from '../scripts/validate-snapshot.mjs';
import { buildCategories } from '../tools/category-composition.mjs';
import { fetchJson } from '../scripts/fetch-json.mjs';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/apple-rss-2026-10-19.json', import.meta.url)));
const checkedAt = '2026-10-19T08:31:47.000Z';
const titles = async originalTitle => ({ title: originalTitle, originalTitle, translatedTitle: null });
const detail = (id, genre = 6007) => ({ wrapperType: 'software', trackId: Number(id), primaryGenreId: genre, primaryGenreName: 'Productivity' });
const successfulLookup = async url => ({ results: new URL(url).searchParams.get('id').split(',').reverse().map(id => detail(id)) });

for (const [country, json] of Object.entries(fixture)) {
  test(`${country}: captured RSS empty genres at 1–10 are enriched by ID; 25 ranks unchanged`, async () => {
    const items = json.feed.results;
    assert.equal(items.length, 25);
    assert.deepEqual(items.slice(0, 10).map(x => x.genres), Array.from({ length: 10 }, () => []));
    assert(items.slice(10).every(x => x.genres.length));
    let lookups = 0;
    const result = await collectApple({ apple: country.toLowerCase(), code: country }, {}, {
      titleResolver: titles,
      fetcher: async url => {
        const u = new URL(url);
        if (u.hostname === 'rss.marketingtools.apple.com') return json;
        lookups++;
        assert.equal(u.searchParams.get('country'), country.toLowerCase());
        assert.deepEqual(u.searchParams.get('id').split(','), items.slice(0, 10).map(x => x.id));
        return { results: [...items.slice(0, 10)].reverse().map((x, i) => detail(x.id, i % 2 ? 6007 : 6024)) };
      },
    });
    assert.equal(lookups, 1);
    assert.equal(result.status, 'verified');
    assert.deepEqual(result.categoryQuality, { status: 'complete', verified: 25, unavailable: 0 });
    result.records.forEach((r, i) => {
      assert.equal(r.rank, i + 1);
      assert.equal(r.appId, `ios:${items[i].id}`);
      assert.equal(r.url, items[i].url);
      assert.equal(r.originalTitle, items[i].name);
      assert.equal(r.categoryId, i < 10 ? ((9 - i) % 2 ? '6007' : '6024') : items[i].genres[0].genreId);
      assert.equal(r.categoryStatus, 'verified');
    });
  });
}

test('valid RSS skips lookup; generic Apps and malformed genres are not categories', async () => {
  assert.equal(rssCategory({ genres: [{ genreId: '36', name: 'Apps' }, { genreId: '6007' }] }).category, '생산성');
  for (const genres of [null, {}, [], [null], [{ name: 'Productivity' }], [{ genreId: '36', name: 'Apps' }]]) {
    assert.equal(rssCategory({ genres }), null);
  }
  const [r] = await resolveAppleCategories([{ id: '1', genres: [{ genreId: '6007' }] }], 'kr', {
    fetcher: () => assert.fail('unnecessary lookup'), checkedAt,
  });
  assert.equal(r.category, '생산성');
  assert.equal(r.categoryCheckedAt, checkedAt);
});

test('unknown official genre ID retains official label, no invented taxonomy', async () => {
  const [r] = await resolveAppleCategories([{ id: '1' }], 'us', {
    fetcher: async () => ({ results: [{ ...detail('1'), primaryGenreId: 9999, primaryGenreName: 'New Official Genre' }] }),
  });
  assert.equal(r.categoryId, '9999');
  assert.equal(r.category, 'New Official Genre');
});

test('lookup outage preserves 25 ranked records with 10 explicitly unavailable categories', async () => {
  const result = await collectApple({ apple: 'us', code: 'US' }, {}, {
    titleResolver: titles, fetcher: async url => {
      if (new URL(url).hostname.startsWith('rss.')) return fixture.US;
      throw new Error('503 Service Unavailable');
    },
  });
  assert.equal(result.records.length, 25);
  assert.equal(result.status, 'verified');
  assert.deepEqual(result.categoryQuality, { status: 'incomplete', verified: 15, unavailable: 10 });
  assert(result.records.slice(0, 10).every(r => r.category === '미확인' && r.categoryId === '' && /lookup_failed/.test(r.categoryReason)));
  assert.deepEqual(buildCategories(result.records).find(x => x.category === '미확인'), { category: '미확인', count: 10 });
});

test('partial, shuffled, wrong-ID, wrong-type, duplicate and missing-genre results never guess', async () => {
  const rows = await resolveAppleCategories(['1', '2', '3', '4', '5', '6'].map(id => ({ id })), 'cn', {
    fetcher: async () => ({ results: [detail('999'), detail('2'), detail('4'), detail('4'),
      { ...detail('3'), primaryGenreId: null }, { ...detail('5'), wrapperType: 'artist' },
      { ...detail('6'), primaryGenreId: 9999, primaryGenreName: '   ' }] }),
  });
  assert.deepEqual(rows.map(x => x.categoryStatus), ['unavailable', 'verified', 'unavailable', 'unavailable', 'unavailable', 'unavailable']);
  assert(rows.filter(x => x.categoryStatus === 'unavailable').every(x => x.categoryId === '' && x.categoryReason));
});

test('empty/malformed lookup responses explicitly record missing metadata', async () => {
  for (const json of [{ results: [] }, {}, { results: null }]) {
    const [row] = await resolveAppleCategories([{ id: '1' }], 'fr', { fetcher: async () => json });
    assert.equal(row.categoryStatus, 'unavailable');
    assert.equal(row.category, '미확인');
  }
});

test('HTTP failure and timeout abort are surfaced to category fallback', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await assert.rejects(fetchJson('https://itunes.apple.com/lookup', { attempts: 1 }), /429/);
    globalThis.fetch = (_, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    await assert.rejects(fetchJson('https://itunes.apple.com/lookup', { attempts: 1, timeoutMs: 5 }), /aborted/);
  } finally { globalThis.fetch = original; }
});

async function snapshotWithMetadata(fetcher = successfulLookup) {
  // Unmodified historical incident provides real 350-row validation coverage.
  const snapshot = JSON.parse(await fs.readFile(new URL('../data/2026-10-12.json', import.meta.url)));
  await enrichAppleSnapshot(snapshot, { fetcher, checkedAt });
  for (const [key, source] of Object.entries(snapshot.sources)) {
    const rows = snapshot.records.filter(r => r.store === source.store && r.country === source.country);
    snapshot.categoryComposition[key].categories = buildCategories(rows);
  }
  const index = JSON.parse(await fs.readFile(new URL('../data/index.json', import.meta.url)));
  return { snapshot, index };
}

test('backfill preserves ranking, IDs, titles, timestamps, Google records and existing Apple categories', async () => {
  const original = JSON.parse(await fs.readFile(new URL('../data/2026-10-12.json', import.meta.url)));
  const { snapshot, index } = await snapshotWithMetadata();
  assert.equal(snapshot.generatedAt, original.generatedAt);
  assert.equal(snapshot.date, original.date);
  assert.deepEqual(snapshot.records.filter(x => x.store === 'google'), original.records.filter(x => x.store === 'google'));
  snapshot.records.forEach((r, i) => {
    for (const field of ['rank', 'appId', 'title', 'originalTitle', 'translatedTitle', 'developer', 'url', 'icon']) assert.equal(r[field], original.records[i][field]);
    if (r.store === 'apple' && original.records[i].categoryId) assert.equal(r.categoryId, original.records[i].categoryId);
  });
  assert.equal(validateSnapshot(snapshot, index).records, 350);
});

test('validator rejects silent 기타/empty ID, false verification, bad provenance and stale composition', async () => {
  const { snapshot, index } = await snapshotWithMetadata();
  for (const mutate of [
    s => { s.records[0].category = '기타'; s.records[0].categoryId = ''; },
    s => { delete s.records[0].categoryStatus; },
    s => { s.records[0].categoryId = ''; },
    s => { s.records[0].categorySource = 'https://itunes.apple.com/lookup?id=999&country=us'; },
    s => { delete s.sources['apple-KR'].categoryQuality; },
    s => { s.categoryComposition['apple-KR'].categories[0].category = 'wrong'; },
  ]) {
    const copy = structuredClone(snapshot); mutate(copy);
    assert.throws(() => validateSnapshot(copy, index));
  }
});

test('validator accepts explicit incomplete metadata without dropping ranked records', async () => {
  const { snapshot, index } = await snapshotWithMetadata(async () => { throw new Error('timeout'); });
  assert.equal(validateSnapshot(snapshot, index).unavailableCategories, 70);
  assert.equal(snapshot.records.length, 350);
  assert.deepEqual(snapshot.sources['apple-KR'].categoryQuality, { status: 'incomplete', verified: 15, unavailable: 10 });
});

test('old snapshots and dashboard separate unknown categories from 기타', async () => {
  assert.equal(categoryLabel({ store: 'apple', category: '기타', categoryId: '' }), '미확인');
  const source = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  const ctx = vm.createContext({ document: { getElementById: () => ({}) } });
  vm.runInContext(source.replace(/load\(\);\s*$/, ''), ctx);
  const result = vm.runInContext(`normalize({records:[{title:'App',store:'apple',country:'KR',rank:1,category:'기타',categoryId:''}]}).records[0].category`, ctx);
  assert.equal(result, '미확인');
  assert.match(vm.runInContext(`bars([{category:'미확인'},{category:'생산성'}])`, ctx), /카테고리 미확인 1개/);
});
