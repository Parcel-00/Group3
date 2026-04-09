import { useCallback, useEffect, useState } from "react";
import TopNav from "../components/TopNav";
import { supabase } from "../supabaseClient";

function Facilities() {
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

  const fetchContainerEvents = useCallback(async (containerBusinessId) => {
    if (!containerBusinessId) {
      setContainerEvents([]);
      setEventsError("");
      return;
    }

    setEventsLoading(true);
    setEventsError("");
    try {
      const selected = facilityContainers.find(
        (container) => container.container_id === containerBusinessId,
      );
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
            <h3>Facilities / Receiver</h3>
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
              Container (at/scheduled to selected facility)
            </label>
            <select
              id="facility-container"
              className="input"
              value={selectedContainerId}
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

export default Facilities;