# PR #2 merge resolution — 2026-10-21

The merge was blocked by a content conflict in `data/2026-10-19.json` (`mergeable_state=dirty`). Main's automated collection commit `b3a62d8a9f73cffd4def8977e1e58b94f2adedce` replaced the same snapshot that PR head `dc74532e8bff0b51bea9aa2db395622ffddf4b32` had enriched. Both were one commit beyond `cdf2262`.

## Resolution

Use the entire latest main snapshot as the baseline. Main contains 40 storefront/app identities absent from the older PR snapshot; copying the PR file wholesale would roll back newer charts. No collector logic was rewritten.

- Preserve all 350 ordered `(store, country, rank, appId)` tuples from main.
- Preserve all 175 Google records and their source/composition objects exactly.
- Preserve all 105 existing Apple categories, app titles, translated titles, developer names, URLs, icons and the original collection timestamp `2026-10-19T09:46:36.721Z`.
- Reuse 66 verified category results by matching storefront AND app ID, retaining their original provenance and check times.
- Resolve only the four newly encountered missing categories using official iTunes Lookup: KR `6553966660`, JP `388497605`, AU `983156458` and `1397699449`. Responses are matched by trackId through the existing resolver.
- Update category-derived descriptions for the 70 repaired rows; rebuild Apple category composition and quality metadata.
- Keep `data/translations.json` and `data/index.json` byte-identical to main. Keep all earlier snapshots unchanged.

## Verification before merge

- Existing regression suite: 17/17 passed locally (Node 24.19.0); the PR workflow runs Node 22.
- Snapshot validator: 350 records, 14/14 verified sources, 0 unknown Apple categories.
- Field-by-field assertions verified the preservation claims above.
- SHA-256 of ordered rank/ID tuples (JSON compact array): `1c02b0790a73a90d291b62686f9f56505021b531b424d63d5108a5394978638b`.
- SHA-256 of unchanged translations file bytes: `0d12278647d6194c27a71db9f2b4f80de3d46264ac9b6607591f5360282d2763`.

The existing main-push workflow will run regression tests, collect current charts into a new dated snapshot, validate them, and publish the dashboard/data to gh-pages. The weekly Monday 13:00 KST schedule is unchanged. Current live ranks may naturally differ from the preserved October 19 snapshot.
