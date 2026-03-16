import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { addScan } from "../data/scanStore";
import { supabase } from "../supabaseClient";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001";

function normalizeStatus(shipmentData) {
  const status = shipmentData?.metadata?.processingStatus;
  if (status) return status;
  return shipmentData?.processingResult?.success ? "SUCCESS" : "NO_MATCH_FOUND";
}

function Scan() {
  const navigate = useNavigate();
  const [containerId, setContainerId] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanError, setScanError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setScanError("Select an image or PDF file before analyzing.");
      return;
    }

    setScanError("");
    setIsSubmitting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        setScanError("You must be signed in before running a scan.");
        setIsSubmitting(false);
        return;
      }

      const formData = new FormData();
      formData.append("image", selectedFile);
      if (containerId.trim()) {
        formData.append("containerId", containerId.trim());
      }

      const response = await fetch(`${API_BASE_URL}/api/shipments/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || "Scan request failed.",
        );
      }

      const shipmentData = payload?.shipmentData;
      const parsedContainerId =
        shipmentData?.shipmentDetails?.container?.containerId || null;
      const scan = {
        timestamp: shipmentData?.timestamp || new Date().toISOString(),
        containerId: parsedContainerId || containerId.trim() || "Unknown",
        confidence: shipmentData?.processingResult?.confidenceScore ?? 0,
        status: normalizeStatus(shipmentData),
        imageName: shipmentData?.imageProcessed || selectedFile.name,
        matchedManifest:
          shipmentData?.processingResult?.matchedManifest || "None",
      };

      addScan(scan);
      navigate("/results", { state: { scan, shipmentData } });
    } catch (error) {
      setScanError(error.message || "Unable to process this file.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Scan Container</h3>
            <p className="hint">
              Upload a shipment image/PDF to run OCR and match it to the closest
              manifest.
            </p>
          </div>

          <div className="split">
            <div className="stack">
              <div className="field">
                <label className="label" htmlFor="container-id">
                  Container ID (optional hint)
                </label>
                <input
                  id="container-id"
                  className="input"
                  type="text"
                  placeholder="ABCU1234567"
                  value={containerId}
                  onChange={(event) => setContainerId(event.target.value)}
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="scan-image">
                  Image or PDF upload
                </label>
                <input
                  id="scan-image"
                  className="input"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
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
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Analyzing..." : "Analyze"}
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
              <strong>Live API behavior</strong>
              <br />
              Clicking Analyze uploads the selected file to the backend, stores
              a summary in localStorage, and routes to Results with full
              response details.
              <br />
              <br />
              Current image: {selectedFile?.name || "None selected"}
            </div>
          </div>
        </div>
      </section>

      <footer>
        Scan summaries are persisted in localStorage for the logger view.
      </footer>
    </main>
  );
}

export default Scan;
