import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import TopNav from "../components/TopNav";
import { supabase } from "../supabaseClient";
import { addScan } from "../data/scanStore";

function normalizeStatus(shipmentData) {
  const status = shipmentData?.metadata?.processingStatus;
  if (status) return status;
  return shipmentData?.processingResult?.success ? "SUCCESS" : "NO_MATCH_FOUND";
}

function Receiver() {
  const navigate = useNavigate();
  const [facilities, setFacilities] = useState([]);
  const [facilityContainers, setFacilityContainers] = useState([]);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [containersLoading, setContainersLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState("");
  const [containerEvents, setContainerEvents] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [scanError, setScanError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

  const facilityNameById = (id) => {
    if (id == null || id === "") return null;
    const s = String(id);
    return facilities.find((f) => String(f.id) === s)?.name ?? s;
  };

  const containerScheduleLabel = (container) => {
    const cur = facilityNameById(container.current_facility_id);
    const next = facilityNameById(container.next_facility_id);
    const bits = [];
    if (cur) bits.push(`Current: ${cur}`);
    if (next) bits.push(`Next: ${next}`);
    if (!bits.length) return container.container_id;
    return `${container.container_id} — ${bits.join(" · ")}`;
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const facilitiesRes = await fetch(`${API_BASE_URL}/api/facilities`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const facilitiesPayload = await facilitiesRes.json();

      if (!facilitiesRes.ok) {
        throw new Error(facilitiesPayload?.error || "Failed loading facilities.");
      }

      setFacilities(facilitiesPayload?.facilities ?? []);
    } catch (err) {
      setError(err.message || "Failed loading facilities page.");
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchFacilityContainers = useCallback(async (facilityId) => {
    setContainersLoading(true);
    setError("");
    try {
      if (!facilityId) {
        setFacilityContainers([]);
        setSelectedContainerId("");
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const response = await fetch(
        `${API_BASE_URL}/api/facilities/${facilityId}/containers`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed loading containers.");
      }

      setFacilityContainers(payload?.containers ?? []);
      setSelectedContainerId("");
    } catch (err) {
      setError(err.message || "Failed loading containers for facility.");
      setFacilityContainers([]);
      setSelectedContainerId("");
    } finally {
      setContainersLoading(false);
    }
  }, [API_BASE_URL]);

  useEffect(() => {
    fetchFacilityContainers(selectedFacilityId);
  }, [selectedFacilityId, fetchFacilityContainers]);

  useEffect(() => {
    if (!showScanner) return;

    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: 250 },
      false,
    );

    scanner.render((decodedText) => {
      const trimmed = String(decodedText || "").trim();
      if (trimmed) {
        setSelectedContainerId(trimmed);
      }
      setShowScanner(false);
      scanner.clear().catch(() => {});
    });

    return () => {
      scanner.clear().catch(() => {});
    };
  }, [showScanner]);

  const fetchContainerEvents = useCallback(async (containerBusinessId) => {
    if (!containerBusinessId) {
      setContainerEvents([]);
      setEventsError("");
      return;
    }

    setEventsLoading(true);
    setEventsError("");
    try {
      let selected = facilityContainers.find(
        (container) => container.container_id === containerBusinessId,
      );

      if (!selected?.id) {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) throw new Error("You must be signed in.");

        const lookupRes = await fetch(
          `${API_BASE_URL}/api/containers?container_id=${encodeURIComponent(
            containerBusinessId,
          )}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const lookupPayload = await lookupRes.json();
        if (lookupRes.ok) {
          selected = (lookupPayload?.containers ?? []).find(
            (row) => row.container_id === containerBusinessId,
          );
        }
      }

      if (!selected?.id) {
        setContainerEvents([]);
        return;
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const response = await fetch(
        `${API_BASE_URL}/api/containers/${selected.id}/events`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed loading container events.");
      }

      setContainerEvents(payload?.events ?? []);
    } catch (err) {
      setEventsError(err.message || "Failed loading container events.");
      setContainerEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, [API_BASE_URL, facilityContainers]);

  useEffect(() => {
    fetchContainerEvents(selectedContainerId);
  }, [selectedContainerId, fetchContainerEvents]);

  const handleAnalyze = async () => {
    if (!selectedFile) {
      setScanError("Select an image before analyzing.");
      return;
    }

    setScanError("");
    setError("");
    setIsSubmitting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const formData = new FormData();
      formData.append("image", selectedFile);
      if (selectedContainerId.trim()) {
        formData.append("containerId", selectedContainerId.trim());
      }

      const response = await fetch(`${API_BASE_URL}/api/shipments/process`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
      const finalContainerId =
        parsedContainerId || selectedContainerId.trim() || "Unknown";
      const scan = {
        timestamp: shipmentData?.timestamp || new Date().toISOString(),
        containerId: finalContainerId,
        confidence: shipmentData?.processingResult?.confidenceScore,
        status: normalizeStatus(shipmentData),
        imageName: shipmentData?.imageProcessed || selectedFile.name,
        matchedManifest: shipmentData?.processingResult?.matchedManifest || "None",
      };

      addScan(scan);
      if (parsedContainerId && parsedContainerId !== selectedContainerId) {
        setSelectedContainerId(parsedContainerId);
      }
      navigate("/results", { state: { scan, shipmentData } });
    } catch (err) {
      setScanError(err.message || "Unable to process this file.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAction = async (action) => {
    setMessage("");
    setError("");
    try {
      if (!selectedContainerId) throw new Error("Select a container.");
      if (action !== "damage" && !selectedFacilityId) {
        throw new Error("Select a facility.");
      }

      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const body = {
        containerId: selectedContainerId,
        notes: notes.trim() || null,
      };
      if (action !== "damage") {
        body.facilityId = selectedFacilityId;
      }

      const response = await fetch(`${API_BASE_URL}/api/containers/${action}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to ${action} container.`);
      }

      setMessage(`Container ${selectedContainerId} updated: ${action.toUpperCase()}`);
      setNotes("");
      await fetchData();
      await fetchContainerEvents(selectedContainerId);
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>Receiver</h3>
            <p className="hint">
              Manage facility actions and persist container lifecycle events in Supabase.
            </p>
          </div>

          {message ? <div className="msg">{message}</div> : null}
          {error ? <div className="msg bad">{error}</div> : null}

          <div className="field">
            <label className="label" htmlFor="facility-select">
              Facility
            </label>
            <select
              id="facility-select"
              className="input"
              value={selectedFacilityId}
              onChange={(event) => setSelectedFacilityId(event.target.value)}
            >
              <option value="">Select facility</option>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                  {facility.code ? ` (${facility.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="facility-container">
              Container ID (select by facility, type manually, or scan QR)
            </label>
            <div className="split">
              <select
                id="facility-container"
                className="input"
                value={
                  facilityContainers.some(
                    (container) => container.container_id === selectedContainerId,
                  )
                    ? selectedContainerId
                    : ""
                }
                onChange={(event) => setSelectedContainerId(event.target.value)}
                disabled={!selectedFacilityId}
              >
                <option value="">
                  {selectedFacilityId ? "Select container" : "Select facility first"}
                </option>
                {facilityContainers.map((container) => (
                  <option key={container.id} value={container.container_id}>
                    {containerScheduleLabel(container)}
                  </option>
                ))}
              </select>
              <input
                className="input"
                type="text"
                placeholder="Or type/scanned ID (ABCU1234567)"
                value={selectedContainerId}
                onChange={(event) => setSelectedContainerId(event.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="label" htmlFor="scan-image">
              QR/Image upload (scan workflow)
            </label>
            <input
              id="scan-image"
              className="input"
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <div className="row" style={{ marginTop: "8px" }}>
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
              <button
                type="button"
                className="button ghost"
                onClick={handleAnalyze}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Analyzing..." : "Analyze File"}
              </button>
            </div>
            <input
              id="camera-input"
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            {showScanner ? (
              <div className="card" style={{ marginTop: "12px" }}>
                <h4>Scan QR Code</h4>
                <div id="qr-reader" style={{ width: "300px" }}></div>
              </div>
            ) : null}
            {scanError ? <div className="msg bad">{scanError}</div> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="facility-notes">
              Notes
            </label>
            <textarea
              id="facility-notes"
              className="input"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional notes"
            />
          </div>

          <div className="row">
            <button type="button" className="button primary" onClick={() => submitAction("receive")}>
              Receive
            </button>
            <button type="button" className="button" onClick={() => submitAction("forward")}>
              Forward
            </button>
            <button type="button" className="button" onClick={() => submitAction("return")}>
              Return
            </button>
            <button type="button" className="button ghost" onClick={() => submitAction("damage")}>
              Report Damage
            </button>
            <button type="button" className="button ghost" onClick={fetchData}>
              Refresh
            </button>
          </div>

          {selectedFacilityId && containersLoading ? (
            <div className="empty-state">Loading containers for facility...</div>
          ) : null}

          {selectedFacilityId && !containersLoading && facilityContainers.length === 0 ? (
            <div className="empty-state">
              No containers currently at or scheduled to this facility.
            </div>
          ) : null}

          {loading ? (
            <div className="empty-state">Loading facilities and containers...</div>
          ) : null}

          <div>
            <h4>Container Event Timeline</h4>
            {selectedContainerId ? (
              <p className="hint">Showing latest events for `{selectedContainerId}`.</p>
            ) : (
              <p className="hint">Select a container to view its event history.</p>
            )}
          </div>

          {eventsLoading ? (
            <div className="empty-state">Loading container events...</div>
          ) : eventsError ? (
            <div className="msg bad">{eventsError}</div>
          ) : selectedContainerId && containerEvents.length === 0 ? (
            <div className="empty-state">No events for this container yet.</div>
          ) : selectedContainerId ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Facility</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {containerEvents.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>{event.event_type}</td>
                      <td>{event.facility_id ?? "N/A"}</td>
                      <td>{event.notes ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default Receiver;