# Apple category metadata investigation — 2026-10-19

## Reproduced cause

The committed 2026-10-12 and 2026-10-19 snapshots each contain 175 Apple records. All seven storefronts have blank `categoryId` and `기타` at ranks 1–10 (70/175 = 40%); ranks 11–25 have categories. Google Play does not show this pattern.

Fresh official RSS requests for KR, US, JP, CN, FR, AU and DE reproduced `genres: []` at ranks 1–10 and populated genre arrays at ranks 11–25. `tests/fixtures/apple-rss-2026-10-19.json` retains each response's `feed.results` and source URL. These are separately observed live charts; their ordering is not substituted into the saved snapshot.

The old collector reads `item.genres?.[0]`. With an empty array this becomes `{}`, so `normalizeCategory()` silently returns `기타` and stores an empty ID. The validator checks category truthiness, not category evidence. Composition then treats that placeholder as a real category. This is an upstream metadata omission combined with an unhandled fallback/validation gap, not a renamed RSS property. Apple's internal reason for returning empty arrays is unknown; we do not attribute it to a specific rollout, policy or ranking rule.

## Resolution and compatibility

- Keep RSS as the only source of chart membership and ordering. Use valid RSS genre metadata when present, skipping the generic `Apps` genre (`36`).
- For missing metadata, batch the missing app IDs in one official `https://itunes.apple.com/lookup?id=…&country=…&entity=software` request per storefront. Match `trackId` exactly; use `primaryGenreId`/`primaryGenreName`. Unrelated IDs, non-software results and duplicates do not become evidence.
- Keep existing Korean genre-ID mappings. An unfamiliar official genre ID can retain its official name. No title-based, cross-country or third-party category guesses.
- Use the existing HTTP retry/timeout behavior (3 attempts, 30 seconds per attempt). An outage, malformed response, removed app or absent genre does not discard valid ranking records.
- Add record fields `categoryStatus` (`verified` / `unavailable`), `categorySource`, `categoryCheckedAt`, `categoryReason` (null on success). Unresolved values are `category: "미확인"`, `categoryId: ""` with a reason.
- Add `sources["apple-XX"].categoryQuality` with `status: complete|incomplete` and `verified` / `unavailable` counts. Existing source `status` continues to describe ranking completeness.
- Keep existing fields, types, top-level structure, app IDs, rank ordering and the Monday 13:00 KST schedule. Google collection is unchanged. The Google dependency is lazy-imported to allow offline Apple tests without installing/scraping Google.
- Composition totals still include all ranked records, with `미확인` as an explicit quality bucket. The dashboard shows its count and excludes it from the strongest-category headline. Old missing Apple metadata is also displayed as `미확인` without rewriting historical files.
- Validation rejects silent `기타`/empty-ID success, missing quality metadata, non-official/wrong-storefront provenance, and composition values that disagree with the records. Explicit unavailable metadata is allowed with a GitHub Actions warning so ranking availability is not lost.

## Latest data repair

Only `data/2026-10-19.json` is repaired in this change. Official per-country lookups recovered all 70 missing categories, leaving 175/175 Apple categories verified. All 350 ranking identities/orderings, titles, icons, URLs and developers are unchanged; all 175 Google records are deeply equal to the original. `generatedAt`, the snapshot date, index and translation cache are preserved. Category descriptions and composition counts are recomputed.

The recovered categories reflect the metadata observed at `categoryCheckedAt`, not a claim that Lookup can retrieve historical category state. Existing RSS categories retain the original snapshot observation time. The 2026-10-12 file is retained as an unchanged incident/regression source. Do not use today's metadata to silently claim a historical category observation.

Explicit repair commands (no collection or publishing):

```sh
node scripts/enrich-apple-categories.mjs YYYY-MM-DD
node tools/category-composition.mjs YYYY-MM-DD
node scripts/validate-snapshot.mjs YYYY-MM-DD
```

## Verification

- `npm test`: 17 offline tests, including all seven captured RSS responses, shuffled lookup responses, ID matching, known/unknown genres, empty/malformed responses, partial results, duplicate/wrong-type results, HTTP failure and abort timeout, preserving all 350 records during backfill, validation rejection/acceptance, and legacy dashboard handling.
- `node scripts/validate-snapshot.mjs 2026-10-19`: 350 records, 14/14 ranked sources verified, zero unavailable Apple categories.
- PR CI runs offline tests with Node 22 and read-only contents permission. The existing publishing job runs the tests before collection; its schedule is unchanged. No publishing workflow is dispatched as part of this repair.

## Official references

- [Apple ID-based lookup documentation](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/LookupExamples.html)
- [Apple Search API country/entity parameters and usage limits](https://performance-partners.apple.com/search-api)
- [US official RSS](https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/25/apps.json) (equivalent storefront codes used for the other six countries)
