import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateGameSnapshot } from './validate-game-snapshot.mjs';
import { GAME_COUNTRIES, todayKst } from './collect-game-charts.mjs';

const DATA_DIR = path.join(process.cwd(), 'data', 'games');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function officialLegacyGamesUrl(url, country) {
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' &&
      parsed.hostname === 'itunes.apple.com' &&
      parsed.pathname === `/${country.toLowerCase()}/rss/topfreeapplications/limit=25/genre=6014/json`;
  } catch {
    return false;
  }
}

export function validateGameSnapshotV2(snapshot, index, date = snapshot.date) {
  // The shared validator predates Apple's category-filtered legacy feed and
  // expects the newer Marketing Tools URL shape. Verify the actual legacy
  // source strictly here, then adapt only a clone to reuse all remaining
  // rank, metadata, provenance, composition and coverage checks.
  const adapted = structuredClone(snapshot);
  for (const country of GAME_COUNTRIES) {
    const key = `apple-${country.code}`;
    const source = snapshot.sources?.[key];
    assert(source, `Missing game source ${key}.`);
    assert(officialLegacyGamesUrl(source.url, country.code),
      `${key}: source must be Apple's official category-filtered free-games RSS feed.`);
    adapted.sources[key].url =
      `https://rss.marketingtools.apple.com/api/v2/${country.apple}/games/top-free/25/games.json`;
  }
  return validateGameSnapshot(adapted, index, date);
}

async function main() {
  const date = process.argv[2] || todayKst();
  const snapshot = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${date}.json`), 'utf8'));
  const index = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'index.json'), 'utf8'));
  const result = validateGameSnapshotV2(snapshot, index, date);
  console.log(
    `Validated ${result.records} official game records across ${result.verifiedCharts}/14 verified charts; ` +
      `${result.unavailableCategories} Apple categories and ${result.unavailableDescriptions} descriptions unavailable.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Game snapshot validation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
