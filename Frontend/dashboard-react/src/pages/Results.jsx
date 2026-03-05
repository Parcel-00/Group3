import { useLocation, useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";

function severityClass(severity) {
  if (severity === "Severe") return "pill pill--severe";
  if (severity === "Moderate") return "pill pill--moderate";
  return "pill pill--ok";
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function Results() {
  const navigate = useNavigate();
  const location = useLocation();
  const scan = location.state?.scan;

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Results</h3>
            <p className="hint">Latest simulated scan output from the demo analyzer.</p>
          </div>

          {!scan ? (
            <div className="stack">
              <div className="empty-state">No result. Run a scan first.</div>
              <div className="row">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => navigate("/scan")}
                >
                  Go to Scan
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-label">Container ID</div>
                  <div className="stat-value">{scan.containerId}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Damage %</div>
                  <div className="stat-value">{scan.damagePct}%</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Severity</div>
                  <div className="stat-value">
                    <span className={severityClass(scan.severity)}>{scan.severity}</span>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Image file</div>
                  <div className="stat-value">{scan.imageName}</div>
                </div>
              </div>

              <div className="msg">
                <strong>Timestamp:</strong> {formatTimestamp(scan.timestamp)}
              </div>

              <div className="row">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => navigate("/scan")}
                >
                  Scan another
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => navigate("/logger")}
                >
                  View logger
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default Results;
