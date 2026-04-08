import { useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";
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

export default function App() {
  const [freeText, setFreeText] = useState("");
  const [selected, setSelected] = useState([]);
  const [maxStops, setMaxStops] = useState(6);
  const [loading, setLoading] = useState(false);
  const [routeData, setRouteData] = useState(null);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => freeText.trim() || selected.length > 0, [freeText, selected]);

  const toggleKeyword = (kw) => {
    setSelected((prev) => (prev.includes(kw) ? prev.filter((x) => x !== kw) : [...prev, kw]));
  };

  const generateRoute = async () => {
    setLoading(true);
    setError("");
    try {
      const refreshRes = await fetch(`${API_BASE}/refresh`, { method: "POST" });
      if (!refreshRes.ok) throw new Error("Could not refresh MET data");

      const res = await fetch(`${API_BASE}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          free_text: freeText,
          keywords: selected,
          max_stops: maxStops
        })
      });
      if (!res.ok) throw new Error("Could not generate route");
      setRouteData(await res.json());
    } catch (e) {
      setError(e.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <h1>MEeT More Art</h1>
      <p className="sub">
        Interest-based MET route planner using artwork metadata from the MET website.
      </p>

      <section className="card">
        <h2>Your interests</h2>
        <label className="label" htmlFor="freeText">What are you curious about?</label>
        <textarea
          id="freeText"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="e.g. women in impressionism, mythology, spiritual works"
          rows={4}
        />

        <p className="label">Or pick keywords:</p>
        <div className="chips">
          {KEYWORDS.map((kw) => (
            <button
              key={kw}
              className={`chip ${selected.includes(kw) ? "active" : ""}`}
              onClick={() => toggleKeyword(kw)}
            >
              {kw}
            </button>
          ))}
        </div>

        <label className="label" htmlFor="maxStops">Maximum stops: {maxStops}</label>
        <input
          id="maxStops"
          type="range"
          min="3"
          max="12"
          value={maxStops}
          onChange={(e) => setMaxStops(Number(e.target.value))}
        />

        <button className="primary" disabled={!canSubmit || loading} onClick={generateRoute}>
          {loading ? "Building your route..." : "Generate route"}
        </button>
        {error && <p className="error">{error}</p>}
      </section>

      {routeData && (
        <section className="card">
          <h2>Suggested dynamic route</h2>
          <p className="sub">Detected interests: {routeData.interests_detected.join(", ")}</p>
          <ol className="routeList">
            {routeData.route.map((stop) => (
              <li key={`${stop.order}-${stop.artwork.id}`}>
                <h3>
                  {stop.order}. {stop.artwork.title}
                </h3>
                <p>
                  <strong>Artist:</strong> {stop.artwork.artist || "Unknown"}
                </p>
                <p>
                  <strong>Location:</strong> {stop.artwork.location || "Unknown wing"}
                </p>
                <p>
                  <strong>Gallery:</strong> {stop.artwork.gallery || "Unknown"}
                </p>
                <p>
                  <strong>Department:</strong> {stop.artwork.department || "Unknown"}
                </p>
                <p>
                  <strong>On Exhibit:</strong>{" "}
                  {stop.artwork.is_on_view === null
                    ? "Unknown"
                    : stop.artwork.is_on_view
                    ? "Yes"
                    : "No"}
                </p>
                <p>{stop.reason}</p>
                {stop.artwork.image_url && <img src={stop.artwork.image_url} alt={stop.artwork.title} />}
                {stop.artwork.detail_url && (
                  <p>
                    <a href={stop.artwork.detail_url} target="_blank" rel="noreferrer">
                      View artwork page
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
