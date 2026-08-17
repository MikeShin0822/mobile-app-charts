import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const COUNTRIES = ['KR', 'US', 'JP', 'CN', 'FR', 'AU', 'DE'];
const STORES = ['apple', 'google'];

const kstDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

function buildCategories(rows) {
  const counts = new Map();
  for (const row of rows) {
    const category = String(row.category || '기타').trim() || '기타';
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'ko'));
}

async function main() {
  const date = kstDate();
  const snapshotPath = path.join(DATA_DIR, `${date}.json`);
  const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));
  const composition = {};

  for (const store of STORES) {
    for (const country of COUNTRIES) {
      const key = `${store}-${country}`;
      const rows = snapshot.records.filter(
        record => record.store === store && record.country === country,
      );
      const categories = buildCategories(rows);
      const total = categories.reduce((sum, item) => sum + item.count, 0);
      const status = snapshot.sources?.[key]?.status || 'unavailable';

      if (total !== rows.length) {
        throw new Error(`${key}: category total ${total} does not match ${rows.length} records.`);
      }
      if (String(status).startsWith('verified') && rows.length !== snapshot.topN) {
        throw new Error(`${key}: verified source must contain exactly ${snapshot.topN} records.`);
      }

      composition[key] = { store, country, status, total, categories };
    }
  }

  snapshot.categoryComposition = composition;
  await fs.writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Stored category composition for ${Object.keys(composition).length} country/store charts.`);
}

main().catch(error => {
  console.error(`Category composition failed: ${error.message}`);
  process.exitCode = 1;
});
