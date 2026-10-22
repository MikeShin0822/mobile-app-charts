import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  resolveAppleMetadata,
  categoryQuality,
} from './apple-categories.mjs';
import { descriptionQuality } from './descriptions.mjs';

export async function enrichAppleSnapshot(snapshot, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  for (const country of new Set(
    snapshot.records.filter(row => row.store === 'apple').map(row => row.country),
  )) {
    const rows = snapshot.records.filter(
      row => row.store === 'apple' && row.country === country,
    );
    const items = rows.map(row => ({
      id: row.appId.replace(/^ios:/, ''),
      genres: row.categoryId
        ? [{ genreId: row.categoryId, name: row.category }]
        : [],
    }));
    const metadata = await resolveAppleMetadata(items, country, {
      ...options,
      checkedAt,
    });

    rows.forEach((row, i) => Object.assign(row, metadata[i]));
    const source = snapshot.sources[`apple-${country}`];
    source.categoryQuality = categoryQuality(rows);
    source.descriptionQuality = descriptionQuality(rows);
  }
  return snapshot;
}

async function main() {
  const date = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new Error('Usage: node scripts/enrich-apple-categories.mjs YYYY-MM-DD');
  }
  const file = path.join(process.cwd(), 'data', `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
  await enrichAppleSnapshot(snapshot);
  await fs.writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Enriched ${date} Apple categories and official descriptions without changing chart membership or ranking.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
