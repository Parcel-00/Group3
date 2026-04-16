import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import TopNav from "../components/TopNav";
import { supabase } from "../supabaseClient";
import { addScan } from "../data/scanStore";
import { apiUrl, parseJsonResponse } from "../utils/http";

function normalizeStatus(shipmentData) {
  const status = shipmentData?.metadata?.processingStatus;
  if (status) return status;
  return shipmentData?.processingResult?.success ? "SUCCESS" : "NO_MATCH_FOUND";
}

/** Supabase may return bad or missing timestamps; treat epoch / invalid as missing. */
function formatEventTime(raw) {
  if (raw == null || raw === "") return "—";
  let ms;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    ms = raw < 1e12 ? raw * 1000 : raw;
  } else {
    ms = Date.parse(raw);
  }
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toLocaleString();
}

function Receiver() {
  const navigate = useNavigate();
  const cameraInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const [facilities, setFacilities] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [facilityContainers, setFacilityContainers] = useState([]);
  const [selectedContainerId, setSelectedContainerId] = useState("");
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [forwardToAddressId, setForwardToAddressId] = useState("");
  const [forwardToFacilityId, setForwardToFacilityId] = useState("");
  const [forwardPickOpen, setForwardPickOpen] = useState(false);
  const [forwardAddressOpen, setForwardAddressOpen] = useState(false);
  const [returnToFacilityId, setReturnToFacilityId] = useState("");
  const [damageReturnPromptOpen, setDamageReturnPromptOpen] = useState(false);
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
  const [activityLog, setActivityLog] = useState([]);
  /** facilityId -> staged forward ops (not posted until Review & send) */
  const [pendingOutgoing, setPendingOutgoing] = useState({});
  const [outgoingReviewOpen, setOutgoingReviewOpen] = useState(false);
  const [batchSending, setBatchSending] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

  const stopCameraStream = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    const video = cameraVideoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!showCameraModal) return;
    const video = cameraVideoRef.current;
    const stream = cameraStreamRef.current;
    if (video && stream) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }
    return () => {
      if (video) video.srcObject = null;
    };
  }, [showCameraModal]);

  const closeCameraModal = useCallback(() => {
    stopCameraStream();
    setShowCameraModal(false);
  }, [stopCameraStream]);

  const openTakePhoto = useCallback(async () => {
    setScanError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setShowCameraModal(true);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        cameraStreamRef.current = stream;
        setShowCameraModal(true);
      } catch {
        setScanError("Could not open the camera. Try again or use Image upload.");
        cameraInputRef.current?.click();
      }
    }
  }, []);

  const capturePhotoFromCamera = useCallback(() => {
    const video = cameraVideoRef.current;
    if (!video || video.readyState < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = `container-photo-${Date.now()}.jpg`;
        const file = new File([blob], name, { type: "image/jpeg" });
        setSelectedFile(file);
        setScanError("");
        closeCameraModal();
      },
      "image/jpeg",
      0.92,
    );
  }, [closeCameraModal]);

  useEffect(() => {
    return () => {
      cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    };
  }, []);

  const metrics = useMemo(
    () => ({
      facilities: facilities.length,
      addresses: addresses.length,
      inView: facilityContainers.length,
    }),
    [facilities.length, addresses.length, facilityContainers.length],
  );

  const facilityNameById = (id) => {
    if (id == null || id === "") return null;
    const s = String(id);
    return facilities.find((f) => String(f.id) === s)?.name ?? s;
  };

  const selectedContainerRow = useMemo(
    () => facilityContainers.find((c) => c.container_id === selectedContainerId),
    [facilityContainers, selectedContainerId],
  );

  const currentOutgoingQueue = useMemo(
    () =>
      selectedFacilityId ? pendingOutgoing[String(selectedFacilityId)] ?? [] : [],
    [pendingOutgoing, selectedFacilityId],
  );

  const forwardDestinationFacilities = useMemo(() => {
    const cur = selectedContainerRow?.current_facility_id;
    return facilities.filter((f) => {
      const id = String(f.id);
      if (selectedFacilityId && id === String(selectedFacilityId)) return false;
      if (cur != null && cur !== "" && id === String(cur)) return false;
      return true;
    });
  }, [facilities, selectedFacilityId, selectedContainerRow]);

  const addressDisplayById = (addressId) => {
    if (addressId == null || addressId === "") return null;
    const s = String(addressId);
    const row = addresses.find((a) => String(a.id) === s);
    if (!row) return s;
    const t = row.display_text?.trim();
    return t || s;
  };

  const getQueuedForward = (businessId) => {
    if (!businessId || !selectedFacilityId) return null;
    return (pendingOutgoing[String(selectedFacilityId)] ?? []).find(
      (o) => o.containerId === businessId,
    );
  };

  const isIncomingAtSelectedFacility = (container) => {
    if (!selectedFacilityId || !container) return false;
    if (String(container.next_facility_id ?? "") !== String(selectedFacilityId)) {
      return false;
    }
    if (String(container.current_facility_id ?? "") === String(selectedFacilityId)) {
      return false;
    }
    return true;
  };

  const containerStatusLabel = (container) => {
    const q = getQueuedForward(container?.container_id);
    if (q) return `Queued → ${q.destinationLabel}`;
    if (isIncomingAtSelectedFacility(container)) {
      const fromName = facilityNameById(container.incoming_from_facility_id);
      return fromName ? `Incoming from ${fromName}` : "Incoming";
    }
    if (!container?.status) return "—";
    if (container.status === "RECEIVED" && container.current_facility_id) {
      const name = facilityNameById(container.current_facility_id);
      return name ? `At ${name}` : "RECEIVED";
    }
    return container.status;
  };

  const containerScheduleLabel = (container) => {
    const q = getQueuedForward(container?.container_id);
    if (q) {
      return `Forwarding to ${q.destinationLabel} — not sent yet (use Review & send below)`;
    }
    if (isIncomingAtSelectedFacility(container)) {
      const fromName = facilityNameById(container.incoming_from_facility_id);
      return fromName
        ? `On the way here · not received yet · from ${fromName}`
        : "On the way here · not received yet";
    }
    const cur = facilityNameById(container.current_facility_id);
    const next = facilityNameById(container.next_facility_id);
    const bits = [];
    if (cur) bits.push(`Current: ${cur}`);
    if (next) bits.push(`Next: ${next}`);
    if (!bits.length) return container.container_id;
    return `${container.container_id} — ${bits.join(" · ")}`;
  };

  const pushLog = useCallback((label, text) => {
    setActivityLog((prev) => [{ label, message: text }, ...prev].slice(0, 40));
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");

      const [facilitiesRes, addressesRes] = await Promise.all([
        fetch(apiUrl(API_BASE_URL, "facilities"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(API_BASE_URL, "addresses"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const facilitiesPayload = await parseJsonResponse(facilitiesRes);
      const addressesPayload = await parseJsonResponse(addressesRes);

      if (!facilitiesRes.ok) {
        throw new Error(facilitiesPayload?.error || "Failed loading facilities.");
      }
      setFacilities(facilitiesPayload?.facilities ?? []);
      if (addressesRes.ok) {
        setAddresses(addressesPayload?.addresses ?? []);
      } else {
        console.warn("Addresses catalog unavailable:", addressesPayload?.error);
        setAddresses([]);
      }
    } catch (err) {
      setError(err.message || "Failed loading receiver data.");
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
        apiUrl(API_BASE_URL, `facilities/${facilityId}/containers`),
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const payload = await parseJsonResponse(response);
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

  const fetchContainerEvents = useCallback(
    async (containerBusinessId) => {
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
            apiUrl(
              API_BASE_URL,
              `containers?container_id=${encodeURIComponent(containerBusinessId)}`,
            ),
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          const lookupPayload = await parseJsonResponse(lookupRes);
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
          apiUrl(API_BASE_URL, `containers/${selected.id}/events`),
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const payload = await parseJsonResponse(response);
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
    },
    [API_BASE_URL, facilityContainers],
  );

  useEffect(() => {
    fetchContainerEvents(selectedContainerId);
  }, [selectedContainerId, fetchContainerEvents]);

  useEffect(() => {
    setForwardPickOpen(false);
    setForwardAddressOpen(false);
    setForwardToAddressId("");
    setForwardToFacilityId("");
    setReturnToFacilityId("");
  }, [selectedContainerId, selectedFacilityId]);

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

      const response = await fetch(apiUrl(API_BASE_URL, "shipments/process"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const payload = await parseJsonResponse(response);
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

  const refreshContextLists = useCallback(async () => {
    await fetchFacilityContainers(selectedFacilityId);
  }, [fetchFacilityContainers, selectedFacilityId]);

  const performContainerAction = useCallback(
    async (action, body) => {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) throw new Error("You must be signed in.");
      const response = await fetch(apiUrl(API_BASE_URL, `containers/${action}`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload?.error || `Failed to ${action} container.`);
      }
      return payload;
    },
    [API_BASE_URL],
  );

  const submitAction = async (action) => {
    setMessage("");
    setError("");
    try {
      if (action === "forward") {
        throw new Error("Forwards are staged in Outgoing — use Add to outgoing, then Review & send.");
      }

      const cid = selectedContainerId.trim();
      if (!cid) throw new Error("Select a container from the list or scan a QR code.");

      if (action !== "damage" && !selectedFacilityId) {
        throw new Error("Select a facility.");
      }

      const body = {
        containerId: cid,
        notes: notes.trim() || null,
      };

      if (action !== "damage") {
        body.facilityId = selectedFacilityId;
      }

      if (
        action === "return" &&
        returnToFacilityId &&
        String(returnToFacilityId) !== String(selectedFacilityId)
      ) {
        body.toFacilityId = returnToFacilityId;
      }

      await performContainerAction(action, body);

      setMessage(`Container ${cid} updated: ${action.toUpperCase()}`);
      setNotes("");
      setForwardPickOpen(false);
      setForwardAddressOpen(false);
      setForwardToAddressId("");
      setForwardToFacilityId("");
      setReturnToFacilityId("");
      if (action === "damage") {
        setDamageReturnPromptOpen(true);
      }
      pushLog(cid, `${action.toUpperCase()} recorded successfully.`);
      await fetchData();
      await refreshContextLists();
      await fetchContainerEvents(cid);
    } catch (err) {
      setError(err.message || "Action failed.");
    }
  };

  const removePendingOutgoing = (opId) => {
    if (!selectedFacilityId) return;
    const fid = String(selectedFacilityId);
    setPendingOutgoing((prev) => ({
      ...prev,
      [fid]: (prev[fid] ?? []).filter((o) => o.id !== opId),
    }));
  };

  const sendOutgoingBatch = async () => {
    if (!selectedFacilityId || currentOutgoingQueue.length === 0) return;
    const fid = String(selectedFacilityId);
    const queue = [...currentOutgoingQueue];
    setBatchSending(true);
    setError("");
    setMessage("");
    let completed = 0;
    try {
      for (let i = 0; i < queue.length; i++) {
        const op = queue[i];
        const body = {
          containerId: op.containerId,
          notes: op.notes,
          facilityId: fid,
        };
        if (op.toAddressId) body.toAddressId = op.toAddressId;
        if (op.toFacilityId) body.toFacilityId = op.toFacilityId;
        try {
          await performContainerAction("forward", body);
          pushLog(op.containerId, "FORWARD recorded successfully.");
          completed++;
        } catch (err) {
          setPendingOutgoing((prev) => ({
            ...prev,
            [fid]: queue.slice(i),
          }));
          setError(
            completed > 0
              ? `Sent ${completed} of ${queue.length}, then failed: ${err.message}. Remaining rows are still queued.`
              : err.message,
          );
          await fetchData();
          await refreshContextLists();
          if (selectedContainerId.trim()) {
            await fetchContainerEvents(selectedContainerId.trim());
          }
          return;
        }
      }
      setPendingOutgoing((prev) => ({ ...prev, [fid]: [] }));
      setOutgoingReviewOpen(false);
      setMessage(`Sent ${queue.length} forward${queue.length === 1 ? "" : "s"}.`);
      await fetchData();
      await refreshContextLists();
      if (selectedContainerId.trim()) {
        await fetchContainerEvents(selectedContainerId.trim());
      }
    } finally {
      setBatchSending(false);
    }
  };

  const locationHint =
    "Tap a container below to select it, or use Scan QR. Forwards are staged first (Queued / Forwarding to…) and only post when you use Review & send. Receive, return, and damage still save immediately.";

  const openForwardPicker = () => {
    setError("");
    if (!selectedContainerId.trim()) {
      setError("Select a container from the list or scan a QR code.");
      return;
    }
    setForwardPickOpen(true);
    setForwardAddressOpen(false);
    setForwardToAddressId("");
    setForwardToFacilityId("");
  };

  const cancelForwardPicker = () => {
    setForwardPickOpen(false);
    setForwardAddressOpen(false);
    setForwardToAddressId("");
    setForwardToFacilityId("");
  };

  const addToOutgoingQueue = () => {
    setError("");
    setMessage("");
    const cid = selectedContainerId.trim();
    if (!cid) {
      setError("Select a container from the list or scan a QR code.");
      return;
    }
    if (!forwardToAddressId && !forwardToFacilityId) {
      setError("Choose a destination facility or add an address.");
      return;
    }
    if (forwardToFacilityId && String(forwardToFacilityId) === String(selectedFacilityId)) {
      setError("Cannot forward to the facility you are working from.");
      return;
    }
    const cur = selectedContainerRow?.current_facility_id;
    if (
      forwardToFacilityId &&
      cur != null &&
      cur !== "" &&
      String(forwardToFacilityId) === String(cur)
    ) {
      setError("Container is already at that facility.");
      return;
    }
    if (!selectedFacilityId) {
      setError("Select a facility.");
      return;
    }
    const destParts = [];
    if (forwardToFacilityId) {
      destParts.push(facilityNameById(forwardToFacilityId) ?? String(forwardToFacilityId));
    }
    if (forwardToAddressId) {
      destParts.push(addressDisplayById(forwardToAddressId) ?? String(forwardToAddressId));
    }
    const destinationLabel = destParts.join(" · ") || "—";
    const fid = String(selectedFacilityId);
    const op = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      containerId: cid,
      toFacilityId: forwardToFacilityId || "",
      toAddressId: forwardToAddressId || "",
      destinationLabel,
      notes: notes.trim() || null,
    };
    setPendingOutgoing((prev) => {
      const prevList = prev[fid] ?? [];
      const filtered = prevList.filter((o) => o.containerId !== cid);
      return { ...prev, [fid]: [...filtered, op] };
    });
    setMessage(`Queued forward for ${cid}. Open Review & send when you are ready to post it.`);
    setNotes("");
    setForwardPickOpen(false);
    setForwardAddressOpen(false);
    setForwardToAddressId("");
    setForwardToFacilityId("");
  };

  const selectionReady = Boolean(selectedFacilityId);

  return (
    <main className="shell shell-wide">
      <section className="card shipment-status-shell">
        <TopNav />

        <div className="card-pad shipment-status-page-grid">
          <section className="shipment-status-hero shipment-status-panel">
            <div>
              <div className="shipment-status-eyebrow">Receiver &amp; shipment status</div>
              <h1>Container receive, forward, and scan</h1>
              <p className="subtitle shipment-status-subtitle">
                Choose your facility, tap a container to select it, then receive, return, or stage
                forwards (confirm via Outgoing). Addresses from manifests are only used when you
                send to an address. Events and notes are stored in Supabase.
              </p>
            </div>

            <div className="shipment-metric-grid" aria-label="Overview metrics">
              <article className="shipment-metric">
                <div className="shipment-metric-label">Facilities</div>
                <div className="shipment-metric-value">{metrics.facilities}</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Address options</div>
                <div className="shipment-metric-value">{metrics.addresses}</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Containers in view</div>
                <div className="shipment-metric-value">{metrics.inView}</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Working facility</div>
                <div className="shipment-metric-value" style={{ fontSize: "18px" }}>
                  {selectedFacilityId
                    ? facilityNameById(selectedFacilityId) ?? "—"
                    : "—"}
                </div>
              </article>
            </div>
          </section>

          {message ? <div className="msg">{message}</div> : null}
          {error ? <div className="msg bad">{error}</div> : null}

          <div className="shipment-status-layout">
            <section className="shipment-status-panel">
              <div className="shipment-section-head">
                <div>
                  <h2>Operations</h2>
                  <p className="hint shipment-status-copy">{locationHint}</p>
                </div>
                <span className="pill pill--moderate">Live data</span>
              </div>

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

              {selectionReady && facilityContainers.length > 0 ? (
                <div className="field">
                  <span className="label">Containers</span>
                  <div className="shipment-container-list">
                    {facilityContainers.map((c) => {
                      const active = selectedContainerId === c.container_id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          className={`shipment-container-card${active ? " shipment-container-card--selected" : ""}`}
                          onClick={() => setSelectedContainerId(c.container_id)}
                        >
                          <div className="shipment-container-top">
                            <div className="shipment-container-card__main">
                              <div className="shipment-container-id">{c.container_id}</div>
                              <div className="shipment-container-route">
                                {containerScheduleLabel(c)}
                              </div>
                            </div>
                            <span
                              className={`pill shipment-container-card__status${
                                getQueuedForward(c.container_id)
                                  ? " pill--pending shipment-container-card__status--queued"
                                  : isIncomingAtSelectedFacility(c)
                                    ? " pill--incoming shipment-container-card__status--queued"
                                    : " pill--moderate"
                              }`}
                            >
                              {containerStatusLabel(c)}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="field">
                <label className="label" htmlFor="scan-image">
                  Container image or PDF
                </label>
                <input
                  id="scan-image"
                  className="input"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <input
                  ref={cameraInputRef}
                  className="receiver-camera-input"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  aria-label="Take a photo with the device camera"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setScanError("");
                    event.target.value = "";
                  }}
                />
                <div className="row" style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setShowScanner(true)}
                  >
                    Scan QR code
                  </button>
                  <button type="button" className="button" onClick={openTakePhoto}>
                    Take photo
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={handleAnalyze}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Analyzing…" : "Analyze file"}
                  </button>
                </div>
                <p className="hint shipment-status-copy" style={{ marginTop: "10px" }}>
                  <strong>Take photo</strong> opens your device camera (or falls back to a file
                  picker). <strong>Analyze file</strong> sends the image to the server (OCR,
                  manifest match, optional damage model), then opens <strong>Results</strong> (
                  <strong>GOOD</strong> / <strong>DAMAGED</strong> when the model runs).{" "}
                  <strong>Report damage</strong> is separate and logs in Supabase for the selected
                  container.
                </p>
                {selectedFile ? (
                  <p className="hint shipment-status-copy" style={{ marginTop: "6px" }}>
                    Selected: <strong>{selectedFile.name}</strong>
                    {selectedFile.type === "application/pdf" ? " (PDF)" : null}
                  </p>
                ) : null}
                {showScanner ? (
                  <div className="card" style={{ marginTop: "12px" }}>
                    <h4>Scan QR code</h4>
                    <div id="qr-reader" style={{ width: "100%", maxWidth: "320px" }}></div>                  </div>
                ) : null}
                {scanError ? <div className="msg bad">{scanError}</div> : null}
              </div>

              <div className="field">
                <label className="label" htmlFor="notes">
                  Notes
                </label>
                <textarea
                  id="notes"
                  className="input"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional notes (appended after system location lines)"
                />
              </div>

              <div className="field">
                <label className="label" htmlFor="return-to-facility">
                  Return empty to another depot (optional)
                </label>
                <select
                  id="return-to-facility"
                  className="input"
                  value={returnToFacilityId}
                  onChange={(event) => setReturnToFacilityId(event.target.value)}
                >
                  <option value="">— At this facility (default) —</option>
                  {facilities
                    .filter((f) => String(f.id) !== String(selectedFacilityId))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                        {f.code ? ` (${f.code})` : ""}
                      </option>
                    ))}
                </select>
                <p className="hint shipment-status-copy" style={{ marginTop: "8px" }}>
                  If you choose another depot, the unit leaves this facility’s list and shows as{" "}
                  <strong>Incoming from …</strong> there until someone <strong>Receive</strong>s it.
                  Leave default if the empty stays physically at the facility you have selected above.
                </p>
              </div>

              <div className="shipment-action-row">
                <button type="button" className="button primary" onClick={() => submitAction("receive")}>
                  Receive
                </button>
                {!forwardPickOpen ? (
                  <button type="button" className="button" onClick={openForwardPicker}>
                    Forward
                  </button>
                ) : null}
                <button type="button" className="button" onClick={() => submitAction("return")}>
                  Return
                </button>
                <button type="button" className="button ghost" onClick={() => submitAction("damage")}>
                  Report damage
                </button>
                <button type="button" className="button ghost" onClick={fetchData}>
                  Refresh
                </button>
              </div>

              {forwardPickOpen ? (
                <div className="field" style={{ marginTop: "4px" }}>
                  <span className="label">Forward destination</span>
                  <p className="hint shipment-status-copy" style={{ marginBottom: "10px" }}>
                    Choose where it should go, then <strong>Add to outgoing</strong>. Nothing is
                    posted until you use <strong>Review & send</strong> below. Facility sends the
                    unit to that location in the system; address-only keeps it in transit until a
                    facility match is found.
                  </p>
                  <div className="field" style={{ marginBottom: "10px" }}>
                    <label className="label" htmlFor="forward-inline-facility">
                      Destination facility
                    </label>
                    <select
                      id="forward-inline-facility"
                      className="input"
                      value={forwardToFacilityId}
                      onChange={(event) => setForwardToFacilityId(event.target.value)}
                    >
                      <option value="">—</option>
                      {forwardDestinationFacilities.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                          {f.code ? ` (${f.code})` : ""}
                        </option>
                      ))}
                    </select>
                    {forwardDestinationFacilities.length === 0 ? (
                      <p className="hint shipment-status-copy" style={{ marginTop: "8px" }}>
                        No other facilities to choose from. Use Send to address or add facilities in
                        the directory.
                      </p>
                    ) : null}
                  </div>
                  <div className="shipment-action-row" style={{ marginBottom: "10px" }}>
                    <button
                      type="button"
                      className="button ghost"
                      onClick={() => {
                        setForwardAddressOpen((open) => {
                          if (open) setForwardToAddressId("");
                          return !open;
                        });
                      }}
                    >
                      {forwardAddressOpen ? "Hide address" : "Send to address"}
                    </button>
                  </div>
                  {forwardAddressOpen ? (
                    <div className="field" style={{ marginBottom: "10px" }}>
                      <label className="label" htmlFor="forward-inline-address">
                        Address
                      </label>
                      <select
                        id="forward-inline-address"
                        className="input"
                        value={forwardToAddressId}
                        onChange={(event) => setForwardToAddressId(event.target.value)}
                      >
                        <option value="">—</option>
                        {addresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            {addr.display_text}
                            {addr.address_type ? ` (${addr.address_type})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div className="shipment-action-row">
                    <button type="button" className="button primary" onClick={addToOutgoingQueue}>
                      Add to outgoing
                    </button>
                    <button type="button" className="button ghost" onClick={cancelForwardPicker}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {selectionReady && containersLoading ? (
                <div className="empty-state">Loading containers…</div>
              ) : null}

              {selectionReady && !containersLoading && facilityContainers.length === 0 ? (
                <div className="empty-state">
                  No containers for this facility. Use Scan QR code below if the unit is not in this
                  list.
                </div>
              ) : null}

              {loading ? <div className="empty-state">Loading directories…</div> : null}

              {selectionReady && currentOutgoingQueue.length > 0 ? (
                <div className="receiver-pending-panel field">
                  <div className="shipment-section-head shipment-section-head--stacked">
                    <h3>Outgoing for {facilityNameById(selectedFacilityId) ?? "this facility"}</h3>
                    <p className="hint shipment-status-copy">
                      Staged forwards for this facility only. They are not saved until you review and
                      confirm.
                    </p>
                  </div>
                  <div className="receiver-pending-list">
                    {currentOutgoingQueue.map((op) => (
                      <div key={op.id} className="receiver-pending-row">
                        <div className="receiver-pending-row__main">
                          <div className="receiver-pending-row__id">{op.containerId}</div>
                          <div className="receiver-pending-row__dest">→ {op.destinationLabel}</div>
                          {op.notes ? (
                            <div className="receiver-pending-row__notes">Notes: {op.notes}</div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="button ghost receiver-pending-row__remove"
                          onClick={() => removePendingOutgoing(op.id)}
                          disabled={batchSending}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="shipment-action-row" style={{ marginTop: "12px" }}>
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => setOutgoingReviewOpen(true)}
                      disabled={batchSending || currentOutgoingQueue.length === 0}
                    >
                      Review &amp; send ({currentOutgoingQueue.length})
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: "18px" }}>
                <h3>Event timeline</h3>
                {selectedContainerId ? (
                  <p className="hint shipment-status-copy">
                    {selectedContainerId}
                    {selectedFacilityId
                      ? ` · ${facilityNameById(selectedFacilityId) ?? ""}`
                      : ""}
                  </p>
                ) : (
                  <p className="hint shipment-status-copy">Select a container to load events.</p>
                )}
              </div>

              {eventsLoading ? (
                <div className="empty-state">Loading events…</div>
              ) : eventsError ? (
                <div className="msg bad">{eventsError}</div>
              ) : selectedContainerId && containerEvents.length === 0 ? (
                <div className="empty-state">No events yet.</div>
              ) : selectedContainerId ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Event</th>
                        <th>Facility id</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {containerEvents.map((event) => (
                        <tr key={event.id}>
                          <td>{formatEventTime(event.created_at)}</td>
                          <td>{event.event_type}</td>
                          <td>{event.facility_id ?? "—"}</td>
                          <td>{event.notes ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            <aside className="shipment-status-panel shipment-status-sidebar">
              <div className="shipment-log-section">
                <div className="shipment-section-head shipment-section-head--stacked">
                  <h3>Session activity</h3>
                  <p className="hint shipment-status-copy">Successful actions in this browser session.</p>
                </div>
                <div className="shipment-log-list">
                  {activityLog.length === 0 ? (
                    <div className="shipment-status-copy">No actions yet.</div>
                  ) : (
                    activityLog.map((entry, index) => (
                      <div key={`${entry.label}-${index}`} className="shipment-log-item">
                        <span>{entry.label}</span>
                        <span>{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {showCameraModal ? (
        <div
          className="receiver-modal-backdrop"
          role="presentation"
          onClick={closeCameraModal}
        >
          <div
            className="receiver-modal-dialog receiver-modal-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="camera-modal-title" className="receiver-modal-dialog__title">
              Photograph container
            </h3>
            <p className="receiver-modal-dialog__body">
              Point the camera at the container (numbers, placard, or side), then capture. The
              photo is used for <strong>Analyze file</strong> the same as an upload.
            </p>
            <video
              ref={cameraVideoRef}
              className="receiver-camera-preview"
              playsInline
              muted
              autoPlay
            />
            <div className="receiver-modal-dialog__actions">
              <button type="button" className="button ghost" onClick={closeCameraModal}>
                Cancel
              </button>
              <button type="button" className="button primary" onClick={capturePhotoFromCamera}>
                Use this photo
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {outgoingReviewOpen ? (
        <div
          className="receiver-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!batchSending) setOutgoingReviewOpen(false);
          }}
        >
          <div
            className="receiver-modal-dialog receiver-modal-dialog--wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outgoing-review-title"
            aria-describedby="outgoing-review-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="outgoing-review-title" className="receiver-modal-dialog__title">
              Confirm outgoing forwards
            </h3>
            <p id="outgoing-review-desc" className="receiver-modal-dialog__body">
              You are about to post <strong>{currentOutgoingQueue.length}</strong> forward
              {currentOutgoingQueue.length === 1 ? "" : "s"} from{" "}
              <strong>{facilityNameById(selectedFacilityId) ?? "this facility"}</strong>. This
              updates Supabase for each container.
            </p>
            <ul className="receiver-modal-dialog__summary">
              {currentOutgoingQueue.map((op) => (
                <li key={op.id}>
                  <strong>{op.containerId}</strong>
                  {" → "}
                  {op.destinationLabel}
                  {op.notes ? (
                    <>
                      <br />
                      <span style={{ fontSize: "12px" }}>Notes: {op.notes}</span>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="receiver-modal-dialog__actions">
              <button
                type="button"
                className="button ghost"
                disabled={batchSending}
                onClick={() => setOutgoingReviewOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="button primary"
                disabled={batchSending || currentOutgoingQueue.length === 0}
                onClick={() => sendOutgoingBatch()}
              >
                {batchSending ? "Sending…" : `Send ${currentOutgoingQueue.length} forward${currentOutgoingQueue.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {damageReturnPromptOpen ? (
        <div
          className="receiver-modal-backdrop"
          role="presentation"
          onClick={() => setDamageReturnPromptOpen(false)}
        >
          <div
            className="receiver-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="damage-return-title"
            aria-describedby="damage-return-desc"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="damage-return-title" className="receiver-modal-dialog__title">
              Log a return?
            </h3>
            <p id="damage-return-desc" className="receiver-modal-dialog__body">
              Damage is on file for <strong>{selectedContainerId || "this container"}</strong>.
              {selectionReady ? (
                <>
                  {" "}
                  If the empty unit is physically back at{" "}
                  <strong>{facilityNameById(selectedFacilityId) ?? "your selected facility"}</strong>
                  , use <strong>Log return</strong> to record that. If it is not back yet, use{" "}
                  <strong>Cancel</strong>—you can log the return later from this page.
                </>
              ) : (
                <>
                  {" "}
                  Select which facility you are working at in the list above, then you can record
                  where the return happened.
                </>
              )}
            </p>
            {!selectionReady ? (
              <p className="receiver-modal-dialog__note">
                <strong>Facility required.</strong> Returns are always tied to the facility you
                have selected.
              </p>
            ) : null}
            <div className="receiver-modal-dialog__actions">
              <button
                type="button"
                className="button ghost"
                onClick={() => setDamageReturnPromptOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={!selectionReady}
                onClick={async () => {
                  setDamageReturnPromptOpen(false);
                  await submitAction("return");
                }}
              >
                Log return
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default Receiver;
