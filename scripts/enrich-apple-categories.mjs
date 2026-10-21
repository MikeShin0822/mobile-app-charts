import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveAppleCategories, categoryLabel, categoryQuality, UNKNOWN_CATEGORY } from './apple-categories.mjs';

export async function enrichAppleSnapshot(snapshot, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  for (const country of new Set(snapshot.records.filter(row => row.store === 'apple').map(row => row.country))) {
    const rows = snapshot.records.filter(row => row.store === 'apple' && row.country === country);
    const missing = rows.filter(row => categoryLabel(row) === UNKNOWN_CATEGORY);
    const metadata = await resolveAppleCategories(missing.map(row => ({ id: row.appId.replace(/^ios:/, '') })),
      country, { ...options, checkedAt });
    missing.forEach((row, i) => {
      Object.assign(row, metadata[i]);
      row.description = `${row.category} · ${row.developer || '개발사 정보 없음'}`;
    });
    // Existing official RSS category values retain their original observation time.
    for (const row of rows.filter(row => !row.categoryStatus)) {
      Object.assign(row, { categoryStatus: 'verified',
        categorySource: `https://rss.marketingtools.apple.com/api/v2/${country.toLowerCase()}/apps/top-free/25/apps.json`,
        categoryCheckedAt: snapshot.generatedAt, categoryReason: null });
    }
    snapshot.sources[`apple-${country}`].categoryQuality = categoryQuality(rows);
  }
  return snapshot;
}

async function main() {
  const date = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Usage: node scripts/enrich-apple-categories.mjs YYYY-MM-DD');
  const file = path.join(process.cwd(), 'data', `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
  await enrichAppleSnapshot(snapshot);
  await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Enriched ${date} Apple metadata without changing chart membership or ranking.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
