# Progress Log

## 2026-04-08
### Completed
- Initialized project and repository.
- Created backend skeleton with FastAPI endpoints:
  - `POST /refresh` to retrieve latest MET website listing data.
  - `GET /artworks/search` for retrieval by text/location.
  - `POST /route` to generate interest-based dynamic routes.
- Implemented website scraping for MET collection search page with fallback parsing.
- Added basic metadata extraction: title, artist, image, detail URL, location text, and on-view hints.
- Added heuristic tag derivation for style/story to support early clustering behavior.
- Created React + Vite frontend for interest input and route visualization.
- Added initial project documentation (`README.md`, `docs/INTENT.md`, this file).
- Implemented v2 data quality pipeline:
  - Added detail-page enrichment fields: `gallery`, `department`, `culture`, `period`, `medium`, `object_date`.
  - Added cache snapshots at `data/met_cache.json` with freshness-aware startup loading.
  - Added configurable refresh controls (`max_items`, `enrich_limit`) and `GET /cache/status`.
  - Upgraded retrieval/routing scoring to include structured metadata and prioritize gallery-based grouping.

### Next priorities
1. Replace heuristic clustering with embedding-based semantic grouping.
2. Add map-like route visualization and distance/transition weighting.
3. Add evaluation notebooks for route quality and user testing metrics.
4. Add incremental refresh mode (only enrich unseen detail URLs).
5. Add stronger metadata parsers for variant MET detail-page layouts.
