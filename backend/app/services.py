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

    def _get_coords(self, art: Artwork) -> tuple[float, float]:
        import re
        import hashlib
        key = art.gallery or art.location or art.department or ""
        match = re.search(r'(\d+)', key)
        if match:
            num = int(match.group(1))
            floor = num // 100
            tens = (num % 100) // 10
            ones = num % 10
            x = 200 + (tens * 60.0) + (ones * 12.0)
            y = 100 + (floor * 150.0) + (ones * 24.0)
            return min(850, max(50, x)), min(400, max(50, y))
        h = int(hashlib.md5(key.encode()).hexdigest(), 16)
        x = 100 + (h % 700)
        y = 100 + ((h // 700) % 250)
        return x, y

    def _optimize_route_sgd(self, stops: List[Artwork], walk_preference: str) -> List[tuple[Artwork, float, float]]:
        if not stops:
            return []
        import math
        import random
        
        n = len(stops)
        coords = [self._get_coords(art) for art in stops]
        if n <= 2:
            return [(stops[i], coords[i][0], coords[i][1]) for i in range(n)]
        
        dist = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                dx = coords[i][0] - coords[j][0]
                dy = coords[i][1] - coords[j][1]
                euclidean = math.sqrt(dx * dx + dy * dy)
                if walk_preference == "further":
                    euclidean = -euclidean + 800.0
                dist[i][j] = euclidean
        
        W = [[0.0] * n for _ in range(n)]
        epochs = 300
        lr = 0.02
        baseline = sum(dist[i][(i+1)%n] for i in range(n - 1))
        
        best_route = list(range(n))
        best_d = float('inf')
        
        for ep in range(epochs):
            curr = 0
            unvisited = set(range(1, n))
            route = [0]
            gradients = [[0.0] * n for _ in range(n)]
            route_dist = 0.0
            
            while unvisited:
                logits = [W[curr][nxt] for nxt in unvisited]
                max_l = max(logits)
                exps = [math.exp(l - max_l) for l in logits]
                sum_exps = sum(exps)
                probs = [e / sum_exps for e in exps]
                
                r = random.random()
                cum = 0.0
                nxt_node = None
                for idx, p in enumerate(probs):
                    cum += p
                    if r <= cum:
                        nxt_node = list(unvisited)[idx]
                        break
                if nxt_node is None:
                    nxt_node = list(unvisited)[-1]
                
                for idx, k in enumerate(unvisited):
                    if k == nxt_node:
                        gradients[curr][k] += 1.0 - probs[idx]
                    else:
                        gradients[curr][k] -= probs[idx]
                
                route_dist += dist[curr][nxt_node]
                route.append(nxt_node)
                unvisited.remove(nxt_node)
                curr = nxt_node
                
            if route_dist < best_d:
                best_d = route_dist
                best_route = list(route)
                
            reward = baseline - route_dist
            for i in range(n):
                for j in range(n):
                    W[i][j] += lr * reward * gradients[i][j]
            baseline = 0.9 * baseline + 0.1 * route_dist
            
        return [(stops[i], coords[i][0], coords[i][1]) for i in best_route]

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
            for art in self.artworks[:max_stops]:
                candidates.append((1, art))

        candidates.sort(key=lambda x: x[0], reverse=True)
        top_arts = []
        seen_ids = set()
        
        for score, art in candidates:
            if art.id not in seen_ids:
                top_arts.append(art)
                seen_ids.add(art.id)
            if len(top_arts) >= max_stops:
                break
                
        while len(top_arts) < max_stops and len(top_arts) < len(self.artworks):
            for art in self.artworks:
                if art.id not in seen_ids:
                    top_arts.append(art)
                    seen_ids.add(art.id)
                    break

        optimized_stops = self._optimize_route_sgd(top_arts, req.walk_preference)
        
        route = []
        for i, (art, x, y) in enumerate(optimized_stops):
            reason = "Matches your requested interests closely." if i < len(candidates) else "Added to bridge your tour."
            route.append(RouteStop(order=i + 1, artwork=art, reason=reason, x=x, y=y))

        return RouteResponse(interests_detected=sorted(set(interests)), route=route)
