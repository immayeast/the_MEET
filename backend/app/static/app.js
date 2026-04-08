const KEYWORDS = [
  "Impressionism",
  "Renaissance",
  "Egyptian",
  "Mythology",
  "Religion",
  "Portrait",
  "Nature",
  "On View"
];

const chipsEl = document.getElementById("chips");
const freeTextEl = document.getElementById("freeText");
const maxStopsEl = document.getElementById("maxStops");
const maxStopsValueEl = document.getElementById("maxStopsValue");
const walkPreferenceEl = document.getElementById("walkPreference");
const generateBtnEl = document.getElementById("generateBtn");
const statusEl = document.getElementById("status");
const errorEl = document.getElementById("error");
const routeListEl = document.getElementById("routeList");
const routeMapEl = document.getElementById("routeMap");

const selected = new Set();

function renderChips() {
  chipsEl.innerHTML = "";
  for (const kw of KEYWORDS) {
    const btn = document.createElement("button");
    btn.className = "chip" + (selected.has(kw) ? " active" : "");
    btn.textContent = kw;
    btn.addEventListener("click", () => {
      if (selected.has(kw)) selected.delete(kw);
      else selected.add(kw);
      renderChips();
    });
    chipsEl.appendChild(btn);
  }
}

maxStopsEl.addEventListener("input", () => {
  maxStopsValueEl.textContent = maxStopsEl.value;
});

function escapeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function generateRoute() {
  errorEl.textContent = "";
  statusEl.textContent = "Refreshing MET data...";
  generateBtnEl.disabled = true;

  try {
    const refreshRes = await fetch("/refresh?max_items=80&enrich_limit=30", { method: "POST" });
    if (!refreshRes.ok) throw new Error("Failed to refresh data");

    statusEl.textContent = "Building your route...";

    const payload = {
      free_text: freeTextEl.value || "",
      keywords: Array.from(selected),
      max_stops: Number(maxStopsEl.value),
      walk_preference: walkPreferenceEl.value
    };

    const routeRes = await fetch("/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!routeRes.ok) throw new Error("Failed to generate route");

    const data = await routeRes.json();
    statusEl.textContent = `Detected interests: ${data.interests_detected.join(", ")}`;

    routeListEl.innerHTML = "";
    for (const stop of data.route) {
      const a = stop.artwork;
      const li = document.createElement("li");
      li.innerHTML = `
        <h3>${stop.order}. ${escapeHtml(a.title || "Untitled")}</h3>
        <p><strong>Artist:</strong> ${escapeHtml(a.artist || "Unknown")}</p>
        <p><strong>Location:</strong> ${escapeHtml(a.location || "Unknown wing")}</p>
        <p><strong>Gallery:</strong> ${escapeHtml(a.gallery || "Unknown")}</p>
        <p><strong>Department:</strong> ${escapeHtml(a.department || "Unknown")}</p>
        <p><strong>On Exhibit:</strong> ${a.is_on_view === null ? "Unknown" : (a.is_on_view ? "Yes" : "No")}</p>
        <p>${escapeHtml(stop.reason || "")}</p>
        ${a.image_url ? `<img src="${escapeHtml(a.image_url)}" alt="${escapeHtml(a.title || "Artwork")}" />` : ""}
        ${a.detail_url ? `<p><a href="${escapeHtml(a.detail_url)}" target="_blank" rel="noreferrer">View artwork page</a></p>` : ""}
      `;
      routeListEl.appendChild(li);
    }
    renderRouteMap(data.route);
  } catch (err) {
    errorEl.textContent = err.message || "Unexpected error";
    statusEl.textContent = "";
  } finally {
    generateBtnEl.disabled = false;
  }
}

function galleryLabel(artwork) {
  return artwork.gallery || artwork.location || artwork.department || "Unknown";
}

function seededPos(seed, i, total) {
  const t = (2 * Math.PI * i) / Math.max(1, total);
  const r = 150 + (seed % 70);
  const x = 450 + Math.cos(t) * r;
  const y = 225 + Math.sin(t) * (r * 0.6);
  return { x, y };
}

function renderRouteMap(route) {
  routeMapEl.innerHTML = "";
  if (!route || route.length === 0) return;

  const groups = [];
  const seen = new Set();
  for (const stop of route) {
    const g = galleryLabel(stop.artwork);
    if (!seen.has(g)) {
      seen.add(g);
      groups.push(g);
    }
  }

  const posByGallery = new Map();
  for (let i = 0; i < groups.length; i++) {
    const seed = Array.from(groups[i]).reduce((a, c) => a + c.charCodeAt(0), 0);
    posByGallery.set(groups[i], seededPos(seed, i, groups.length));
  }

  for (let i = 0; i < route.length - 1; i++) {
    const a = posByGallery.get(galleryLabel(route[i].artwork));
    const b = posByGallery.get(galleryLabel(route[i + 1].artwork));
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "mapLine");
    routeMapEl.appendChild(line);
  }

  groups.forEach((g, idx) => {
    const p = posByGallery.get(g);
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(p.x));
    circle.setAttribute("cy", String(p.y));
    circle.setAttribute("r", "28");
    circle.setAttribute("class", "mapNode");
    routeMapEl.appendChild(circle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(p.x));
    text.setAttribute("y", String(p.y + 4));
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("class", "mapNodeText");
    text.textContent = String(idx + 1);
    routeMapEl.appendChild(text);

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(p.x));
    label.setAttribute("y", String(p.y + 48));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "mapLabel");
    label.textContent = g.length > 22 ? `${g.slice(0, 22)}...` : g;
    routeMapEl.appendChild(label);
  });
}

generateBtnEl.addEventListener("click", generateRoute);
renderChips();
