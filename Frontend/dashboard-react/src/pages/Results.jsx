import { useLocation, useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";

function statusClass(status) {
  if (status === "SUCCESS") return "pill pill--ok";
  if (status === "NO_MATCH_FOUND") return "pill pill--moderate";
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
  const shipmentData = location.state?.shipmentData;
  const totalItems =
    shipmentData?.shipmentDetails?.summary?.totalItems ?? "N/A";

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Results</h3>
            <p className="hint">
              Latest scan output from the shipment processing API.
            </p>
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
                {scan.confidence > 0 && (
                  <div className="stat">
                    <div className="stat-label">Confidence</div>
                    <div className="stat-value">{scan.confidence}%</div>
                  </div>
                )}
                <div className="stat">
                  <div className="stat-label">Status</div>
                  <div className="stat-value">
                    <span className={statusClass(scan.status)}>
                      {scan.status}
                    </span>
                  </div>
                </div>
                <div className="stat">
                  <div className="stat-label">Image file</div>
                  <div className="stat-value">{scan.imageName}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Matched manifest</div>
                  <div className="stat-value">{scan.matchedManifest}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Item count</div>
                  <div className="stat-value">{totalItems}</div>
                </div>
                {shipmentData?.metadata?.damageDetection?.performed && (
                  <div className="stat">
                    <div className="stat-label">Damage Status</div>
                    <div className="stat-value">
                      <span className={shipmentData.metadata.damageDetection.result.isDamaged ? "pill pill--bad" : "pill pill--ok"}>
                        {shipmentData.metadata.damageDetection.result.isDamaged ? "DAMAGED" : "GOOD"}
                      </span>
                    </div>
                  </div>
                )}
                {shipmentData?.metadata?.damageDetection?.performed && (
                  <div className="stat">
                    <div className="stat-label">Damage Confidence</div>
                    <div className="stat-value">
                      {Math.round(shipmentData.metadata.damageDetection.result.confidence * 100)}%
                    </div>
                  </div>
                )}
              </div>

              <div className="msg">
                <strong>Timestamp:</strong> {formatTimestamp(scan.timestamp)}
              </div>

                {shipmentData?.metadata?.damageDetection?.performed && (
                  <div className="msg">
                    <strong>Damage Detection Results:</strong><br />
                    <strong>Status:</strong> {shipmentData.metadata.damageDetection.result.isDamaged ? "Damaged (black marks detected)" : "No damage detected"}<br />
                    <strong>Damage Probability:</strong> {Math.round(shipmentData.metadata.damageDetection.result.damageProbability * 100)}%<br />
                    <strong>Confidence:</strong> {Math.round(shipmentData.metadata.damageDetection.result.confidence * 100)}%<br />
                    <strong>Model:</strong> {shipmentData.metadata.damageDetection.result.modelUsed}
                    {shipmentData.metadata.damageDetection.result.error ? (
                      <>
                        <br />
                        <span className="hint">
                          Note: {shipmentData.metadata.damageDetection.result.error}
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                {shipmentData?.metadata?.damageDetection &&
                !shipmentData.metadata.damageDetection.performed ? (
                  <div className="msg">
                    <strong>Damage scan:</strong>{" "}
                    {shipmentData.metadata.damageDetection.reason ??
                      "Automated damage detection did not run."}
                  </div>
                ) : null}

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

      <footer>
        Scan summaries are persisted in localStorage for the logger view.
      </footer>
    </main>
  );
}

export default Results;
