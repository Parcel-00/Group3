import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";
import { addScan } from "../data/scanStore";
{/*used to scan a qr code from phone'''*/}
import { Html5QrcodeScanner } from "html5-qrcode";
import { useEffect } from "react";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

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

  const [showScanner, setShowScanner] = useState(false);

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setScanError("Select an image or PDF file before analyzing.");
      return;
    }

    setScanError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("image", selectedFile);
      if (containerId.trim()) {
        formData.append("containerId", containerId.trim());
      }

      const response = await fetch(`${API_BASE_URL}/api/shipments/process`, {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "Scan request failed.");
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
        matchedManifest: shipmentData?.processingResult?.matchedManifest || "None",
      };

      addScan(scan);
      navigate("/results", { state: { scan, shipmentData } });
    } catch (error) {
      setScanError(error.message || "Unable to process this file.");
    } finally {
      setIsSubmitting(false);
    }

    {/*QR code scanner logic - currently unused but can be enabled for testing with QR codes*/}
    useEffect(() => {
      if (!showScanner) return;

      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: 250 },
        false
      );

      scanner.render(
        (decodedText) => {
          setContainerId(decodedText);
          setShowScanner(false);
          scanner.clear();
        },
        (error) => {}
      );

      return () => {
        scanner.clear().catch(() => {});
      };
    }, [showScanner]);
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
            
            {/*added button to scan qr code*/}
            <div className="row">
              <button
                type="button"
                className="button"
                onClick={() => document.getElementById("camera-input").click()}
              >
                Take Photo
              </button>

              <button
                type="button"
                className="button"
                onClick={() => setShowScanner(true)}
              >
                Scan QR Code
              </button>
            </div>

            <input
              id="camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) =>
                setSelectedFile(event.target.files?.[0] ?? null)
              }
            />
            
            {showScanner && (
              <div className="card" style={{ marginTop: "20px" }}>
                <h4>Scan QR Code</h4>
                <div id="qr-reader" style={{ width: "300px" }}></div>
              </div>
            )}
          {/*ALL OF THE ABOVE IS FOR THE QR CODE*/}


            <div className="logger-box" role="status" aria-live="polite">
              <strong>Live API behavior</strong>
              <br />
              Clicking Analyze uploads the selected file to the backend, stores a
              summary in localStorage, and routes to Results with full response
              details.
              <br />
              <br />
              Current image: {selectedFile?.name || "None selected"}
            </div>
          </div>
        </div>
      </section>

      <footer>Scan summaries are persisted in localStorage for the logger view.</footer>
    </main>
  );
}

export default Scan;
