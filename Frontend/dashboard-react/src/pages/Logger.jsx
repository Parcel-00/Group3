import { useState } from "react";
import TopNav from "../components/TopNav";
import { clearScans, getScans } from "../data/scanStore";

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
  const [scans, setScans] = useState(() => getScans());

  const refresh = () => setScans(getScans());
  const clear = () => {
    clearScans();
    setScans([]);
  };

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Logger</h3>
            <p className="hint">
              Shipment scan history stored locally in this browser.
            </p>
          </div>

          <div className="row">
            <button type="button" className="button" onClick={refresh}>
              Refresh
            </button>
            <button type="button" className="button ghost" onClick={clear}>
              Clear
            </button>
          </div>

          {scans.length === 0 ? (
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
                      <td>{scan.confidence ?? 0}%</td>
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
