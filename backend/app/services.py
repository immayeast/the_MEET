from __future__ import annotations

from collections import defaultdict
from typing import Dict, List

from .models import Artwork, RouteResponse, RouteStop, UserInterestRequest


class ArtworkStore:
    def __init__(self) -> None:
        self.artworks: List[Artwork] = []

    def refresh(self, artworks: List[Artwork]) -> None:
        self.artworks = artworks

    def search(self, query: str = "", location: str = "", limit: int = 40) -> List[Artwork]:
        q = query.lower().strip()
        l = location.lower().strip()

        scored = []
        for art in self.artworks:
            score = 0
            searchable = " ".join(
                [
                    art.title or "",
                    art.artist or "",
                    art.location or "",
                    art.gallery or "",
                    art.department or "",
                    art.culture or "",
                    art.period or "",
                    art.medium or "",
                    " ".join(art.style_tags),
                    " ".join(art.story_tags),
                ]
            ).lower()
            if q and q in searchable:
                score += 3
            if l and art.location and l in art.location.lower():
                score += 2
            if not q and not l:
                score += 1
            if score > 0:
                scored.append((score, art))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [art for _, art in scored[:limit]]

    def build_interest_route(self, req: UserInterestRequest) -> RouteResponse:
        max_stops = max(1, min(req.max_stops, 30))
        interests = [kw.strip().lower() for kw in req.keywords if kw.strip()]
        if req.free_text.strip():
            interests.extend(req.free_text.lower().split())

        if not interests:
            interests = ["popular", "on view"]

        candidates = []
        for art in self.artworks:
            hay = " ".join(
                [
                    art.title or "",
                    art.artist or "",
                    art.location or "",
                    art.gallery or "",
                    art.department or "",
                    art.culture or "",
                    art.period or "",
                    art.medium or "",
                    " ".join(art.style_tags),
                    " ".join(art.story_tags),
                    "on view" if art.is_on_view else "",
                ]
            ).lower()
            match_count = sum(1 for it in interests if it in hay)
            if match_count > 0 or len(interests) == 0:
                candidates.append((match_count, art))

        if not candidates:
            # Fallback to first items if nothing matched.
            for art in self.artworks[:max_stops]:
                candidates.append((1, art))

        # Geographical logic v2: group by gallery first, then location, then department.
        location_buckets: Dict[str, List[tuple[int, Artwork]]] = defaultdict(list)
        for score, art in candidates:
            key = art.gallery or art.location or art.department or "Unknown Wing"
            location_buckets[key].append((score, art))

        for loc in location_buckets:
            location_buckets[loc].sort(key=lambda x: x[0], reverse=True)

        ordered_locations = sorted(
            location_buckets.keys(), key=lambda k: len(location_buckets[k]), reverse=True
        )
        if req.walk_preference == "further":
            # Encourage exploration by alternating larger/smaller buckets.
            ordered_locations = sorted(
                location_buckets.keys(),
                key=lambda k: (len(location_buckets[k]), k),
            )

        route: List[RouteStop] = []
        stop_idx = 1
        if req.walk_preference == "closer":
            for loc in ordered_locations:
                for score, art in location_buckets[loc]:
                    if len(route) >= max_stops:
                        break
                    reason = f"Matches {score} terms; kept in {loc} to minimize walking."
                    route.append(RouteStop(order=stop_idx, artwork=art, reason=reason))
                    stop_idx += 1
                if len(route) >= max_stops:
                    break
        else:
            # Spread stops across galleries first, then fill extras.
            by_loc_idx: Dict[str, int] = {loc: 0 for loc in ordered_locations}
            while len(route) < max_stops:
                added = False
                for loc in ordered_locations:
                    idx = by_loc_idx[loc]
                    bucket = location_buckets[loc]
                    if idx >= len(bucket):
                        continue
                    score, art = bucket[idx]
                    reason = f"Matches {score} terms; spread route to explore more galleries ({loc})."
                    route.append(RouteStop(order=stop_idx, artwork=art, reason=reason))
                    stop_idx += 1
                    by_loc_idx[loc] += 1
                    added = True
                    if len(route) >= max_stops:
                        break
                if not added:
                    break

        if len(route) < max_stops:
            selected_ids = {stop.artwork.id for stop in route}
            for art in self.artworks:
                if len(route) >= max_stops:
                    break
                if art.id in selected_ids:
                    continue
                route.append(
                    RouteStop(
                        order=stop_idx,
                        artwork=art,
                        reason="Added as a nearby/high-visibility fallback to complete your route.",
                    )
                )
                stop_idx += 1

        return RouteResponse(interests_detected=sorted(set(interests)), route=route)
