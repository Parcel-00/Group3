import { useCallback, useEffect, useState } from "react";
import TopNav from "../components/TopNav";
import { supabase } from "../supabaseClient";
import { apiUrl, parseJsonResponse } from "../utils/http";

function pillClass(status) {
  if (status === "SUCCESS") return "pill pill--ok";
  if (status === "NO_MATCH_FOUND") return "pill pill--moderate";
  if (status === "ERROR") return "pill pill--severe";
  return "pill pill--ok";
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Logger() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const response = await fetch(apiUrl(API_BASE_URL, "shipments/history"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load shipment history.");
      }

      const history = (payload?.history ?? []).map((entry) => ({
        timestamp: entry.timestamp,
        containerId: entry.containerId ?? "Unknown",
        confidence: entry.confidence ?? 0,
        status: "SUCCESS",
        matchedManifest: "DB Event",
        imageName: entry.imageName ?? "N/A",
      }));

      setScans(history);
    } catch (err) {
      setError(err.message || "Failed to load logger history.");
      setScans([]);
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Logger</h3>
            <p className="hint">
              The shipment scan history is loaded from Supabase via backend API.
            </p>
          </div>

          <div className="row">
            <button type="button" className="button" onClick={refresh}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="empty-state">Loading shipment history...</div>
          ) : error ? (
            <div className="msg bad">{error}</div>
          ) : scans.length === 0 ? (
            <div className="empty-state">No manifest data available.</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Container</th>
                    <th>Confidence</th>
                    <th>Status</th>
                    <th>Manifest</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan, index) => (
                    <tr key={`${scan.timestamp}-${scan.containerId}-${index}`}>
                      <td>{formatTime(scan.timestamp)}</td>
                      <td>{scan.containerId}</td>
                      <td>{scan.confidence > 0 ? `${scan.confidence}%` : "N/A"}</td>
                      <td>
                        <span className={pillClass(scan.status)}>
                          {scan.status}
                        </span>
                      </td>
                      <td>{scan.matchedManifest || "None"}</td>
                      <td>{scan.imageName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

    </main>
  );
}

export default Logger;
