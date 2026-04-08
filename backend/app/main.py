from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from .models import UserInterestRequest
from .scraper import cache_info, load_cache, scrape_met_search_page
from .services import ArtworkStore

app = FastAPI(title="MET Interest Route API", version="0.1.0")
store = ArtworkStore()
STATIC_DIR = Path(__file__).resolve().parent / "static"
INDEX_FILE = STATIC_DIR / "index.html"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    # Prefer fresh local cache to reduce startup/network latency.
    try:
        cached = load_cache(max_age_minutes=720)
        if cached:
            store.refresh(cached)
        else:
            store.refresh(scrape_met_search_page())
    except Exception:
        store.refresh([])


@app.get("/health")
def health() -> dict:
    return {"ok": True, "artworks_loaded": len(store.artworks)}


@app.post("/refresh")
def refresh(
    max_items: int = Query(default=80, ge=20, le=200),
    enrich_limit: int = Query(default=30, ge=0, le=100),
) -> dict:
    try:
        artworks = scrape_met_search_page(max_items=max_items, enrich_limit=enrich_limit)
        store.refresh(artworks)
        return {
            "ok": True,
            "source": "live",
            "artworks_loaded": len(artworks),
            "max_items": max_items,
            "enrich_limit": enrich_limit,
        }
    except Exception as exc:
        cached = load_cache(max_age_minutes=60 * 24 * 30)
        if cached:
            store.refresh(cached)
            return {
                "ok": True,
                "source": "cache",
                "warning": f"Live refresh failed, using cached dataset: {exc}",
                "artworks_loaded": len(cached),
                "max_items": max_items,
                "enrich_limit": enrich_limit,
            }
        if store.artworks:
            return {
                "ok": True,
                "source": "memory",
                "warning": f"Live refresh failed, using loaded dataset: {exc}",
                "artworks_loaded": len(store.artworks),
                "max_items": max_items,
                "enrich_limit": enrich_limit,
            }
        return {
            "ok": False,
            "source": "none",
            "error": f"Live refresh failed and no fallback data available: {exc}",
            "artworks_loaded": 0,
            "max_items": max_items,
            "enrich_limit": enrich_limit,
        }


@app.get("/cache/status")
def get_cache_status() -> dict:
    return cache_info()


@app.get("/")
def frontend() -> FileResponse:
    return FileResponse(str(INDEX_FILE))


@app.get("/artworks/search")
def search_artworks(
    query: str = Query(default=""),
    location: str = Query(default=""),
    limit: int = Query(default=40, ge=1, le=100),
):
    return store.search(query=query, location=location, limit=limit)


@app.post("/route")
def get_route(req: UserInterestRequest):
    return store.build_interest_route(req)
