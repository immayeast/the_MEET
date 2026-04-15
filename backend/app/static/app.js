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

const routeMapEl = document.getElementById("routeMapOverlay");
const mapTooltip = document.getElementById("mapTooltip");

function galleryLabel(stop) {
  return stop.artwork.gallery || stop.artwork.location || stop.artwork.department || "Unknown";
}

function renderRouteMap(route) {
  if (!routeMapEl) return;
  routeMapEl.innerHTML = "";
  if (!route || route.length === 0) return;

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    
    if(Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("class", "mapLine");
    routeMapEl.appendChild(line);
  }

  const posGroups = new Map();
  for (let i = 0; i < route.length; i++) {
      const stop = route[i];
      const key = `${Math.round(stop.x)},${Math.round(stop.y)}`;
      if(!posGroups.has(key)) posGroups.set(key, { stops: [], x: stop.x, y: stop.y });
      posGroups.get(key).stops.push({ idx: i + 1, gallery: galleryLabel(stop), artwork: stop.artwork });
  }

  for (const [key, grp] of posGroups.entries()) {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(grp.x));
    circle.setAttribute("cy", String(grp.y));
    circle.setAttribute("r", "20");
    circle.setAttribute("class", "mapNode");
    
    // Add tooltip events
    circle.addEventListener("mouseenter", (e) => {
      mapTooltip.classList.remove("hidden");
      let html = "";
      grp.stops.forEach(s => {
        const a = s.artwork;
        html += `<div><strong>${s.idx}. ${escapeHtml(a.title || "Untitled")}</strong>`;
        if (a.image_url) {
          html += `<img src="${escapeHtml(a.image_url)}" alt=""/>`;
        }
        html += `</div>`;
      });
      mapTooltip.innerHTML = html;
    });
    
    circle.addEventListener("mousemove", (e) => {
      // SVG bounds calculations
      const rect = routeMapEl.getBoundingClientRect();
      const left = e.clientX - rect.left + 15;
      const top = e.clientY - rect.top + 15;
      mapTooltip.style.left = left + "px";
      mapTooltip.style.top = top + "px";
    });
    
    circle.addEventListener("mouseleave", () => {
      mapTooltip.classList.add("hidden");
    });
    
    routeMapEl.appendChild(circle);

    const labels = Array.from(new Set(grp.stops.map(s => s.gallery)));
    
    const textGroup = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textGroup.setAttribute("x", String(grp.x));
    textGroup.setAttribute("y", String(grp.y + 4));
    textGroup.setAttribute("text-anchor", "middle");
    textGroup.setAttribute("class", "mapNodeText");
    textGroup.textContent = grp.stops.map(s => s.idx).join(",");
    routeMapEl.appendChild(textGroup);

    const labelStr = labels.join(" / ");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(grp.x));
    label.setAttribute("y", String(grp.y + 30));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "mapLabel");
    label.textContent = labelStr.length > 25 ? `${labelStr.slice(0, 25)}...` : labelStr;
    routeMapEl.appendChild(label);
  }
}

overlayToggleEl.addEventListener("change", () => {
  routeMapEl.classList.toggle("hidden", !overlayToggleEl.checked);
});

generateBtnEl.addEventListener("click", generateRoute);
renderChips();
