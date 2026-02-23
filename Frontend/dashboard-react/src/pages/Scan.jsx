import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { addScan } from "../data/scanStore";

const DAMAGE_OPTIONS = [0, 20, 40, 60, 80, 100];

function getSeverity(damagePct) {
  if (damagePct >= 80) return "Severe";
  if (damagePct >= 40) return "Moderate";
  return "OK";
}

function Scan() {
  const navigate = useNavigate();
  const [containerId, setContainerId] = useState("LEGO-001");
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanError, setScanError] = useState("");

  const handleAnalyze = () => {
    const normalizedId = containerId.trim().toUpperCase();
    if (!normalizedId.startsWith("LEGO")) {
      setScanError("Demo scanner only accepts LEGO container IDs (example: LEGO-001).");
      return;
    }

    setScanError("");
    const damagePct =
      DAMAGE_OPTIONS[Math.floor(Math.random() * DAMAGE_OPTIONS.length)];
    const scan = {
      timestamp: new Date().toISOString(),
      containerId: containerId.trim() || "LEGO-001",
      damagePct,
      severity: getSeverity(damagePct),
      imageName: selectedFile?.name || "No image uploaded",
    };

    addScan(scan);
    navigate("/results", { state: { scan } });
  };

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Scan Container</h3>
            <p className="hint">
              Demo analyzer: uploads are optional and damage percentage is generated
              randomly in 20% increments.
            </p>
          </div>

          <div className="split">
            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="container-id">
                  Container ID
                </label>
                <input
                  id="container-id"
                  className="input"
                  type="text"
                  value={containerId}
                  onChange={(event) => setContainerId(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="scan-image">
                  Optional image upload
                </label>
                <input
                  id="scan-image"
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setSelectedFile(event.target.files?.[0] ?? null)
                  }
                />
              </div>

              <div className="row">
                <button
                  type="button"
                  className="button primary"
                  onClick={handleAnalyze}
                >
                  Analyze
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => navigate("/dashboard")}
                >
                  Back
                </button>
              </div>

              {scanError && <div className="msg bad">{scanError}</div>}
            </div>

            <div className="logger-box" role="status" aria-live="polite">
              <strong>Demo behavior</strong>
              <br />
              Clicking Analyze saves a generated scan result to localStorage, then
              routes to the results page with the scan data in router state.
              <br />
              <br />
              Current image: {selectedFile?.name || "None selected"}
            </div>
          </div>
        </div>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default Scan;
