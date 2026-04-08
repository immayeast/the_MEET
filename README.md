# MEeT-more-art

Interest-driven MET museum guidance platform inspired by [the-met-retrieval](https://github.com/kyunghyuncho/the-met-retrieval). This project builds personalized visit routes based on visitor preferences and museum geography.

## What this prototype does now
- Scrapes open-access collection listing data from the MET website search page.
- Enriches listing data with detail-page metadata (gallery/department/culture/period/medium/date when available).
- Stores local cache snapshots in `data/met_cache.json` with timestamped refreshes.
- Retrieves and searches artworks by keyword, location, and structured metadata fields.
- Heuristically tags works by style and story signals.
- Generates a dynamic route grouped by gallery/location/department to reduce backtracking.
- Supports `walk_preference` (`closer` vs `further`) to control compact vs exploratory route flow.
- Supports up to 30 recommendations per route.
- Displays route stops in a simple frontend with artwork images/links.
- Shows a directional cartoony gallery-map visualization connecting route stops.

## Architecture
- `backend/`: FastAPI app for scraping, retrieval, and routing
- `frontend/`: React + Vite interface for interest input and route display
- `docs/`: intent and progress documentation

## Quick start

### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Open:
- UI (no npm): `http://127.0.0.1:8000/`
- API docs: `http://127.0.0.1:8000/docs`

### 2) Optional React frontend (requires npm)
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## API endpoints
- `GET /health` - service status and loaded count
- `POST /refresh?max_items=80&enrich_limit=30` - scrape/reload MET search + detail metadata
- `GET /cache/status` - cache file metadata and freshness info
- `GET /artworks/search?query=&location=&limit=` - search endpoint
- `POST /route` - interest-based dynamic route generation

Example `POST /route` payload:
```json
{
  "free_text": "impressionist women portrait",
  "keywords": ["Impressionism", "Portrait"],
  "max_stops": 12,
  "walk_preference": "further"
}
```

## Current caveats
- MET page structure can change; scraper selectors are intentionally flexible but still brittle.
- Some detail pages still omit fields (or vary labels), so gallery/period completeness is not guaranteed.
- Route geography now uses gallery/location/department heuristics, not true floor-plan graph optimization yet.

## Documentation discipline
- Intent is tracked in `docs/INTENT.md`.
- Progress and next actions are tracked in `docs/PROGRESS.md`.

## Next iteration ideas
- Robust detail-page crawler with caching and retry/backoff.
- Story/style embeddings + clustering pipeline.
- Learning-to-rank route ordering with user feedback.
- Optional natural-language tour narratives per stop.
