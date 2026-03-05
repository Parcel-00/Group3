import { useState } from "react";
import TopNav from "../components/TopNav";
import { clearScans, getScans } from "../data/scanStore";

function pillClass(severity) {
  if (severity === "Severe") return "pill pill--severe";
  if (severity === "Moderate") return "pill pill--moderate";
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
            <p className="hint">Demo manifest scan history stored locally in this browser.</p>
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
                    <th>Damage</th>
                    <th>Severity</th>
                    <th>Image</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan, index) => (
                    <tr key={`${scan.timestamp}-${scan.containerId}-${index}`}>
                      <td>{formatTime(scan.timestamp)}</td>
                      <td>{scan.containerId}</td>
                      <td>{scan.damagePct}%</td>
                      <td>
                        <span className={pillClass(scan.severity)}>{scan.severity}</span>
                      </td>
                      <td>{scan.imageName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default Logger;
