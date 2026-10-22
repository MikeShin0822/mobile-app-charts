import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESCRIPTION_UNAVAILABLE,
  descriptionQuality,
  officialDescriptionExcerpt,
  officialDescriptionMetadata,
} from '../scripts/descriptions.mjs';
import { resolveAppleMetadata } from '../scripts/apple-categories.mjs';
import { enrichGoogleSnapshot } from '../scripts/enrich-google-categories.mjs';

const checkedAt = '2026-10-22T00:00:00.000Z';

test('official description excerpt cleans markup and prefers a complete sentence', () => {
  const source = '<p>First official sentence explains the app clearly.</p><br>Second sentence contains more detail that is intentionally much longer than needed for a compact chart row.';
  assert.equal(
    officialDescriptionExcerpt(source, { maxLength: 80, minSentenceLength: 20 }),
    'First official sentence explains the app clearly.',
  );
});

test('official description excerpt truncates long CJK text without inventing a summary', () => {
  const source = '공식스토어에등록된설명문이매우길어서차트에서는일부만표시해야하지만원문순서를바꾸거나새로운문장을만들어서는안됩니다';
  const excerpt = officialDescriptionExcerpt(source, { maxLength: 30 });
  assert.equal(excerpt.length, 30);
  assert(excerpt.endsWith('…'));
  assert(source.startsWith(excerpt.slice(0, -1)));
});

test('empty official description is explicitly unavailable', () => {
  const metadata = officialDescriptionMetadata('', 'https://apps.apple.com/us/app/x/id1', checkedAt);
  assert.equal(metadata.description, DESCRIPTION_UNAVAILABLE);
  assert.equal(metadata.descriptionStatus, 'unavailable');
  assert(metadata.descriptionReason);
  assert.deepEqual(descriptionQuality([metadata]), { status: 'incomplete', verified: 0, unavailable: 1 });
});

test('Apple metadata uses one official lookup, matches by trackId, and enriches all descriptions', async () => {
  const items = [
    { id: '1', genres: [], name: 'One' },
    { id: '2', genres: [{ genreId: '6007', name: 'Productivity' }], name: 'Two' },
  ];
  let calls = 0;
  const metadata = await resolveAppleMetadata(items, 'us', {
    checkedAt,
    fetcher: async url => {
      calls += 1;
      const parsed = new URL(url);
      assert.equal(parsed.hostname, 'itunes.apple.com');
      assert.equal(parsed.searchParams.get('id'), '1,2');
      return {
        results: [
          {
            wrapperType: 'software',
            trackId: 2,
            primaryGenreId: 6007,
            primaryGenreName: 'Productivity',
            description: 'Official description for app two.',
          },
          {
            wrapperType: 'software',
            trackId: 1,
            primaryGenreId: 6024,
            primaryGenreName: 'Shopping',
            description: 'Official description for app one.',
          },
        ],
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(metadata[0].category, '쇼핑');
  assert.equal(metadata[1].category, '생산성');
  assert.equal(metadata[0].description, 'Official description for app one.');
  assert.equal(metadata[1].description, 'Official description for app two.');
  assert(metadata.every(row => row.descriptionStatus === 'verified'));
});

test('Apple lookup outage preserves RSS categories and marks descriptions unavailable', async () => {
  const metadata = await resolveAppleMetadata([
    { id: '1', genres: [{ genreId: '6007', name: 'Productivity' }] },
    { id: '2', genres: [] },
  ], 'kr', {
    checkedAt,
    fetcher: async () => { throw new Error('503 Service Unavailable'); },
  });
  assert.equal(metadata[0].category, '생산성');
  assert.equal(metadata[0].categoryStatus, 'verified');
  assert.equal(metadata[1].categoryStatus, 'unavailable');
  assert(metadata.every(row => row.descriptionStatus === 'unavailable'));
});

test('Google detail enrichment uses summary, falls back to long description, and records failures', async () => {
  const makeRow = (id, rank) => ({
    store: 'google', country: 'US', rank, appId: `android:${id}`,
    title: id, originalTitle: id, translatedTitle: null,
    description: DESCRIPTION_UNAVAILABLE,
    descriptionStatus: 'unavailable',
    descriptionSource: `https://play.google.com/store/apps/details?id=${id}`,
    descriptionCheckedAt: checkedAt,
    descriptionReason: 'detail_enrichment_pending',
    category: '기타', categoryId: '', developer: '', icon: 'https://example.com/icon.png',
    url: `https://play.google.com/store/apps/details?id=${id}`,
  });
  const snapshot = {
    sources: { 'google-US': { store: 'google', country: 'US', status: 'verified' } },
    records: [makeRow('one', 1), makeRow('two', 2), makeRow('three', 3)],
  };
  const clientFactory = () => ({
    app: async ({ appId }) => {
      if (appId === 'one') return {
        genre: 'Productivity', genreId: 'PRODUCTIVITY', developer: 'Dev One',
        summary: 'Official short summary.',
        description: 'Long description should not replace the official summary.',
        icon: 'https://example.com/one.png',
        url: 'https://play.google.com/store/apps/details?id=one',
      };
      if (appId === 'two') return {
        genre: 'Shopping', genreId: 'SHOPPING', developer: 'Dev Two',
        description: 'Official long description first sentence. Additional detail follows.',
        icon: 'https://example.com/two.png',
        url: 'https://play.google.com/store/apps/details?id=two',
      };
      throw new Error('429 Too Many Requests');
    },
  });

  await enrichGoogleSnapshot(snapshot, {
    clientFactory,
    checkedAt,
    concurrency: 2,
    attempts: 1,
  });

  assert.equal(snapshot.records[0].description, 'Official short summary.');
  assert.equal(snapshot.records[0].category, '생산성');
  assert.equal(snapshot.records[1].description, 'Official long description first sentence. Additional detail follows.');
  assert.equal(snapshot.records[1].category, '쇼핑');
  assert.equal(snapshot.records[2].descriptionStatus, 'unavailable');
  assert.match(snapshot.records[2].descriptionReason, /429/);
  assert.deepEqual(snapshot.sources['google-US'].descriptionQuality,
    { status: 'incomplete', verified: 2, unavailable: 1 });
});
