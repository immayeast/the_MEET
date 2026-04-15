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
const routeMapEl = document.getElementById("routeMapOverlay");
const overlayToggleEl = document.getElementById("overlayToggle");

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
    let refreshData = null;
    try {
      refreshData = await refreshRes.json();
    } catch (_) {
      refreshData = null;
    }
    if (!refreshRes.ok || (refreshData && refreshData.ok === false)) {
      statusEl.textContent = "Live refresh unavailable. Trying existing/cached data...";
    } else if (refreshData && refreshData.source && refreshData.source !== "live") {
      statusEl.textContent = `Using ${refreshData.source} data (${refreshData.artworks_loaded} works).`;
    }

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

    if (!routeRes.ok) {
      const body = await routeRes.text();
      throw new Error(`Failed to generate route (${routeRes.status}): ${body.slice(0, 120)}`);
    }

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

let mapScale = 1;
let mapTranslate = { x: 0, y: 0 };
let isDraggingMap = false;
let dragStart = { x: 0, y: 0 };
const metMapWrap = document.querySelector(".metMapWrap");
const mapContainer = document.getElementById("mapContainer");

metMapWrap.addEventListener("pointerdown", (e) => {
  isDraggingMap = true;
  dragStart = { x: e.clientX, y: e.clientY };
  metMapWrap.setPointerCapture(e.pointerId);
});

metMapWrap.addEventListener("pointermove", (e) => {
  if (!isDraggingMap) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  mapTranslate.x += dx;
  mapTranslate.y += dy;
  dragStart = { x: e.clientX, y: e.clientY };
  updateMapTransform();
});

metMapWrap.addEventListener("pointerup", (e) => {
  isDraggingMap = false;
  metMapWrap.releasePointerCapture(e.pointerId);
});

metMapWrap.addEventListener("wheel", (e) => {
  e.preventDefault();
  const zoomFactor = -e.deltaY * 0.002;
  const oldScale = mapScale;
  mapScale = Math.max(0.2, Math.min(mapScale + zoomFactor, 5));
  
  const rect = metMapWrap.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Keep mouse position pinned during zoom
  mapTranslate.x = mouseX - (mouseX - mapTranslate.x) * (mapScale / oldScale);
  mapTranslate.y = mouseY - (mouseY - mapTranslate.y) * (mapScale / oldScale);
  
  updateMapTransform();
}, { passive: false });

function updateMapTransform() {
  if(mapContainer) {
    mapContainer.setAttribute("transform", `translate(${mapTranslate.x}, ${mapTranslate.y}) scale(${mapScale})`);
  }
}

function galleryLabel(stop) {
  return stop.artwork.gallery || stop.artwork.location || stop.artwork.department || "Unknown";
}

function renderRouteMap(route) {
  if (!mapContainer) return;
  mapContainer.innerHTML = "";
  if (!route || route.length === 0) return;

  const width = metMapWrap.clientWidth;
  const height = metMapWrap.clientHeight;
  
  // Auto-fit to center: find bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const stop of route) {
    if(stop.x < minX) minX = stop.x;
    if(stop.y < minY) minY = stop.y;
    if(stop.x > maxX) maxX = stop.x;
    if(stop.y > maxY) maxY = stop.y;
  }
  
  const bWidth = Math.max(maxX - minX, 100);
  const bHeight = Math.max(maxY - minY, 100);
  
  mapScale = Math.min((width - 80) / bWidth, (height - 80) / bHeight);
  mapScale = Math.min(Math.max(mapScale, 0.4), 2);
  
  mapTranslate.x = width/2 - (minX + bWidth/2) * mapScale;
  mapTranslate.y = height/2 - (minY + bHeight/2) * mapScale;
  updateMapTransform();

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    
    // Check if points are identical or roughly identical to skip overlapping lines
    if(Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "mapLine");
    mapContainer.appendChild(line);
  }

  // Draw grouped nodes by position to avoid overlap issues
  const posGroups = new Map();
  for (let i=0; i < route.length; i++) {
      const stop = route[i];
      const key = `${Math.round(stop.x)},${Math.round(stop.y)}`;
      if(!posGroups.has(key)) posGroups.set(key, { stops: [], x: stop.x, y: stop.y });
      posGroups.get(key).stops.push({ idx: i + 1, gallery: galleryLabel(stop) });
  }

  for (const [key, grp] of posGroups.entries()) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(grp.x));
    circle.setAttribute("cy", String(grp.y));
    circle.setAttribute("r", "16");
    circle.setAttribute("class", "mapNode");
    mapContainer.appendChild(circle);

    const labels = Array.from(new Set(grp.stops.map(s => s.gallery)));
    
    const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textGroup.setAttribute("x", String(grp.x));
    textGroup.setAttribute("y", String(grp.y + 4));
    textGroup.setAttribute("text-anchor", "middle");
    textGroup.setAttribute("class", "mapNodeText");
    textGroup.textContent = grp.stops.map(s => s.idx).join(",");
    mapContainer.appendChild(textGroup);

    const labelStr = labels.join(" / ");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(grp.x));
    label.setAttribute("y", String(grp.y + 30));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "mapLabel");
    label.textContent = labelStr.length > 25 ? `${labelStr.slice(0, 25)}...` : labelStr;
    mapContainer.appendChild(label);
  }
}

overlayToggleEl.addEventListener("change", () => {
  routeMapEl.classList.toggle("hidden", !overlayToggleEl.checked);
});

generateBtnEl.addEventListener("click", generateRoute);
renderChips();
