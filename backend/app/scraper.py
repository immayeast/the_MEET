from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests
from bs4 import BeautifulSoup

from .models import Artwork

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
    }
)

CACHE_PATH = Path(__file__).resolve().parents[2] / "data" / "met_cache.json"


def _safe_text(node) -> Optional[str]:
    if not node:
        return None
    txt = node.get_text(" ", strip=True)
    return txt or None


def _derive_style_tags(title: str, artist: Optional[str]) -> List[str]:
    source = f"{title} {artist or ''}".lower()
    mapping = {
        "impression": "Impressionism",
        "renaissance": "Renaissance",
        "baroque": "Baroque",
        "egypt": "Egyptian",
        "greek": "Greek",
        "roman": "Roman",
        "islamic": "Islamic Art",
        "armor": "Arms & Armor",
        "photograph": "Photography",
        "portrait": "Portrait",
        "buddha": "Buddhist",
        "chinese": "Chinese Art",
        "japanese": "Japanese Art",
    }
    tags = [label for k, label in mapping.items() if k in source]
    return sorted(set(tags))


def _derive_story_tags(title: str, artist: Optional[str], location: Optional[str]) -> List[str]:
    source = f"{title} {artist or ''} {location or ''}".lower()
    mapping = {
        "love": "Love",
        "war": "War",
        "relig": "Religion",
        "myth": "Mythology",
        "king": "Royalty",
        "queen": "Royalty",
        "nature": "Nature",
        "death": "Mortality",
        "freedom": "Freedom",
        "saint": "Saints",
        "virgin": "Christian Iconography",
    }
    tags = [label for k, label in mapping.items() if k in source]
    return sorted(set(tags))


def _extract_detail_metadata(detail_url: Optional[str]) -> Dict[str, Optional[str] | Optional[bool]]:
    if not detail_url:
        return {}
    try:
        resp = SESSION.get(detail_url, timeout=20)
        resp.raise_for_status()
    except Exception:
        return {}

    detail_soup = BeautifulSoup(resp.text, "html.parser")
    text_full = detail_soup.get_text(" ", strip=True)
    text = text_full.lower()

    out: Dict[str, Optional[str] | Optional[bool]] = {
        "location": None,
        "gallery": None,
        "department": None,
        "culture": None,
        "period": None,
        "medium": None,
        "object_date": None,
        "is_on_view": None,
    }

    gallery_match = re.search(r"(gallery\s+\d+[a-z]?)", text)
    if gallery_match:
        out["gallery"] = gallery_match.group(1).title()
        out["location"] = out["gallery"]

    on_view = None
    if "not on view" in text:
        on_view = False
    elif "on view at the met" in text or "on view" in text:
        on_view = True
    out["is_on_view"] = on_view

    label_nodes = detail_soup.select("dt, .artwork-tombstone__label, .object-meta__label")
    for label in label_nodes:
        key = _safe_text(label)
        if not key:
            continue
        val_node = label.find_next_sibling(["dd", "div", "span"])
        value = _safe_text(val_node)
        if not value:
            continue

        lk = key.lower()
        if "department" in lk and out["department"] is None:
            out["department"] = value
        elif "culture" in lk and out["culture"] is None:
            out["culture"] = value
        elif "period" in lk and out["period"] is None:
            out["period"] = value
        elif "medium" in lk and out["medium"] is None:
            out["medium"] = value
        elif "date" in lk and out["object_date"] is None:
            out["object_date"] = value
        elif "gallery" in lk and out["gallery"] is None:
            out["gallery"] = value
            out["location"] = value

    if out["period"] is None:
        period_match = re.search(r"\b(period)\s*[:\-]\s*([^.]{3,80})", text_full, re.IGNORECASE)
        if period_match:
            out["period"] = period_match.group(2).strip()

    return out


def _extract_next_data(soup: BeautifulSoup) -> List[Artwork]:
    script = soup.find("script", id="__NEXT_DATA__")
    if not script or not script.string:
        return []

    try:
        data = json.loads(script.string)
    except json.JSONDecodeError:
        return []

    text_blob = json.dumps(data)
    urls = sorted(set(re.findall(r'https://images\.metmuseum\.org/[^"]+', text_blob)))

    artworks: List[Artwork] = []
    for i, image_url in enumerate(urls[:100]):
        artworks.append(
            Artwork(
                id=f"met-image-{i}",
                title=f"MET Open Access Work {i + 1}",
                image_url=image_url,
            )
        )
    return artworks


def _write_cache(artworks: List[Artwork]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(artworks),
        "artworks": [a.model_dump() for a in artworks],
    }
    CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_cache(max_age_minutes: int = 720) -> List[Artwork]:
    if not CACHE_PATH.exists():
        return []
    try:
        payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        ts = payload.get("generated_at")
        if not ts:
            return []
        generated = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - generated > timedelta(minutes=max_age_minutes):
            return []
        return [Artwork(**row) for row in payload.get("artworks", [])]
    except Exception:
        return []


def cache_info() -> dict:
    if not CACHE_PATH.exists():
        return {"exists": False, "path": str(CACHE_PATH)}
    try:
        payload = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        return {
            "exists": True,
            "path": str(CACHE_PATH),
            "generated_at": payload.get("generated_at"),
            "count": payload.get("count", 0),
        }
    except Exception:
        return {"exists": True, "path": str(CACHE_PATH), "error": "unreadable cache file"}


def scrape_met_search_page(max_items: int = 80, enrich_limit: int = 30) -> List[Artwork]:
    search_url = (
        "https://www.metmuseum.org/art/collection/search"
        f"?searchField=All&showOnly=openAccess&sortBy=relevance&offset=0&pageSize={max_items}"
    )
    response = SESSION.get(search_url, timeout=30)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")
    cards = soup.select(
        ".collection-object, figure[data-accession-number], "
        ".card, .met-collection-card, [data-testid='artwork-card']"
    )

    artworks: List[Artwork] = []
    detail_cache: Dict[str, Dict[str, Optional[str] | Optional[bool]]] = {}

    for idx, card in enumerate(cards):
        title_node = card.select_one("h2, h3, .card__title, .met-collection-card__title")
        if not title_node:
            title_node = card.select_one("figcaption a[title], figcaption a[href]")
        title = _safe_text(title_node) or f"Untitled {idx + 1}"

        artist_node = card.select_one(
            ".card__artist, .met-collection-card__artist, .artist, [data-testid='artist'], "
            ".collection-object-module-scss-module__Nwu2FW__artist"
        )
        artist = _safe_text(artist_node)

        img = card.select_one("img")
        image_url = None
        medium = None
        culture = None
        if img:
            image_url = img.get("src") or img.get("data-src")
            alt_text = img.get("alt") or ""
            alt_parts = [p.strip() for p in alt_text.split(",") if p.strip()]
            if artist is None and len(alt_parts) >= 2:
                artist = alt_parts[1]
            if len(alt_parts) >= 3:
                medium = alt_parts[2]
            if len(alt_parts) >= 4:
                culture = alt_parts[3]

        link = card.select_one("a[href]")
        detail_url = None
        if link:
            href = link.get("href")
            if href and href.startswith("/"):
                detail_url = f"https://www.metmuseum.org{href}"
            else:
                detail_url = href

        location_node = card.select_one(
            ".location, .card__location, [data-testid='location'], .met-collection-card__location, "
            ".collection-object-module-scss-module__Nwu2FW__location"
        )
        location = _safe_text(location_node)

        on_view_text = _safe_text(
            card.select_one(
                ".on-view, .is-on-view, [data-testid='on-view'], .status, "
                ".holding-type-badges-module-scss-module___SyclW__badges"
            )
        )
        is_on_view = None
        if on_view_text:
            lowered = on_view_text.lower()
            if "not on view" in lowered:
                is_on_view = False
            elif "on view" in lowered or "on exhibit" in lowered:
                is_on_view = True

        gallery = None
        department = None
        period = None
        object_date = None

        if detail_url and idx < enrich_limit:
            if detail_url not in detail_cache:
                detail_cache[detail_url] = _extract_detail_metadata(detail_url)
            meta = detail_cache[detail_url]
            location = location or meta.get("location")
            gallery = meta.get("gallery")
            department = meta.get("department")
            culture = culture or meta.get("culture")
            period = meta.get("period")
            medium = medium or meta.get("medium")
            object_date = meta.get("object_date")
            if is_on_view is None:
                is_on_view = meta.get("is_on_view")  # type: ignore[assignment]

        artworks.append(
            Artwork(
                id=f"met-{idx}",
                title=title,
                artist=artist,
                image_url=image_url,
                detail_url=detail_url,
                location=location,
                gallery=gallery,
                department=department,
                culture=culture,
                period=period,
                medium=medium,
                object_date=object_date,
                style_tags=_derive_style_tags(title, artist),
                story_tags=_derive_story_tags(title, artist, location),
                is_on_view=is_on_view,
            )
        )

    if not artworks:
        artworks = _extract_next_data(soup)

    _write_cache(artworks)
    return artworks
