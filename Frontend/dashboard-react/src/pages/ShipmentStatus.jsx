import { useMemo, useState } from "react";
import TopNav from "../components/TopNav";

// These are three random container manifests details manually taken from ShipmentManifestTextFiles,
// as well as included static damage %, until the database can automatically fetch and display the manifest
// and the actual damage % on this page
const initialContainers = [
  {
    id: "ABCU1234567", // From Cont-Mnfst-1
    origin: "Viet Nam",
    destination: "Hesse, Germany",
    damage: 8,
    shipmentItem: "Coffee grounds",
    status: "Ready to ship",
    statusTone: "ok",
    note: "Waiting for shipment confirmation.",
  },
  {
    id: "MSCU1234567", // From Cont-Mnfst-3
    origin: "China",
    destination: "New York City, NY, USA",
    damage: 24,
    shipmentItem: "Smartphones",
    status: "Damage threshold exceeded",
    statusTone: "danger",
    note:
      "Backend would notify the database to return this container to the port of origin for repair. Shanghai, in this case as logged in Cont-Mnfst-3",
  },
  {
    id: "KKLN9988776", // From Cont-Mnfst-8
    origin: "Japan",
    destination: "Jakarta, Indonesia",
    damage: 13,
    shipmentItem: "Frozen tuna",
    status: "Ready to ship",
    statusTone: "ok",
    note: "Awaiting dispatch crew approval.",
  },
];

const initialLog = [
  {
    label: "System",
    message: "Shipment queue initialized from manifest data.",
  },
  {
    label: "CNT-88031",
    message: "Auto-return recommendation prepared for damage score above threshold (20%).",
  },
];

function getStatusToneClass(statusTone) {
  if (statusTone === "danger") return "pill--severe";
  if (statusTone === "warn") return "pill--moderate";
  return "pill--ok";
}

function ShipmentStatus() {
  const [containers, setContainers] = useState(initialContainers);
  const [activityLog, setActivityLog] = useState(initialLog);

  const metrics = useMemo(() => {
    const readyToShip = containers.filter((container) => container.damage < 20).length;
    const flaggedForRepair = containers.filter((container) => container.damage >= 20).length;

    return {
      queued: containers.length,
      threshold: 20,
      readyToShip,
      flaggedForRepair,
    };
  }, [containers]);

  const addLogEntry = (label, message) => {
    setActivityLog((current) => [{ label, message }, ...current]);
  };

  const updateContainer = (containerId, updates) => {
    setContainers((current) =>
      current.map((container) =>
        container.id === containerId ? { ...container, ...updates } : container,
      ),
    );
  };

  const handleAction = (container, action) => {
    if (action === "ship") {
      updateContainer(container.id, {
        status: "Shipped",
        statusTone: "ok",
        note: `Container shipped successfully. ${container.id} is now marked as dispatched to ${container.destination}.`,
      });
      addLogEntry(
        container.id,
        `Container shipped successfully to ${container.destination}.`,
      );
      return;
    }

    if (action === "return") {
      updateContainer(container.id, {
        status: "Returned for repair",
        statusTone: "danger",
        note: `Container returned successfully. ${container.id} has been routed back to ${container.origin} for repair review.`,
      });
      addLogEntry(
        container.id,
        `Container returned successfully to ${container.origin} after ${container.damage}% damage was detected.`,
      );
      return;
    }

    if (action === "queue") {
      updateContainer(container.id, {
        status: "Queued",
        statusTone: "warn",
        note: `Dispatch staged. ${container.id} has been placed in the simulated shipment queue for ${container.destination}.`,
      });
      addLogEntry(
        container.id,
        `Container queued for shipment toward ${container.destination}.`,
      );
      return;
    }

    updateContainer(container.id, {
      status: "Inspection logged",
      statusTone: "danger",
      note: `Inspection logged. ${container.id} remains above threshold and is recommended for return to ${container.origin}.`,
    });
    addLogEntry(
      container.id,
      `Manual inspection logged. Return recommendation remains active for ${container.origin}.`,
    );
  };

  return (
    <main className="shell shell-wide">
      <section className="card shipment-status-shell">
        <TopNav />

        <div className="card-pad shipment-status-page-grid">
          <section className="shipment-status-hero shipment-status-panel">
            <div>
              <div className="shipment-status-eyebrow">Shipment Status Prototype</div>
              <h1>Container dispatch &amp; return console</h1>
              <p className="subtitle shipment-status-subtitle">
                This basically just simulates how manifest-driven shipment records,
                damage thresholds, and returning containers, since it's unintegrated
                backend is connected.
              </p>
            </div>

            <div className="shipment-metric-grid" aria-label="Shipment metrics">
              <article className="shipment-metric">
                <div className="shipment-metric-label">Containers in queue</div>
                <div className="shipment-metric-value">{metrics.queued}</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Auto-return threshold</div>
                <div className="shipment-metric-value">{metrics.threshold}%</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Ready to ship</div>
                <div className="shipment-metric-value">{metrics.readyToShip}</div>
              </article>
              <article className="shipment-metric">
                <div className="shipment-metric-label">Flagged for repair</div>
                <div className="shipment-metric-value">{metrics.flaggedForRepair}</div>
              </article>
            </div>
          </section>

          <div className="shipment-status-layout">
            <section className="shipment-status-panel">
              <div className="shipment-section-head">
                <div>
                  <h2>Manifest-driven shipment simulation</h2>
                  <p className="hint shipment-status-copy">
                    Each action updates only this front-end prototype for now.
                  </p>
                </div>
                <span className="pill pill--moderate">Hard-coded prototype Mode</span>
              </div>

              <div className="shipment-container-list">
                {containers.map((container) => {
                  const severeDamage = container.damage >= 20;
                  const noteClassName = severeDamage
                    ? "shipment-status-note shipment-status-note--danger"
                    : "shipment-status-note";

                  return (
                    <article key={container.id} className="shipment-container-card">
                      <div className="shipment-container-top">
                        <div>
                          <div className="shipment-container-id">{container.id}</div>
                          <div className="shipment-container-route">
                            Origin: {container.origin} → Destination: {container.destination}
                          </div>
                        </div>
                        <span className={`pill ${getStatusToneClass(container.statusTone)}`}>
                          {container.status}
                        </span>
                      </div>

                      <div className="shipment-container-meta">
                        <span>Manifest source: {container.manifestSource}</span>
                        <span>Damage score: {container.damage}%</span>
                        <span>Return target: {container.origin}</span>
                      </div>

                      <div
                        className="shipment-severity-bar"
                        aria-label={`${container.damage}% damage severity`}
                      >
                        <div
                          className="shipment-severity-fill"
                          style={{ width: `${container.damage}%` }}
                        ></div>
                      </div>

                      <div className="shipment-action-row">
                        {severeDamage ? (
                          <>
                            <button
                              type="button"
                              className="button shipment-action-danger"
                              onClick={() => handleAction(container, "return")}
                            >
                              Return container
                            </button>
                            <button
                              type="button"
                              className="button"
                              onClick={() => handleAction(container, "inspect")}
                            >
                              Log manual inspection
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="button primary"
                              onClick={() => handleAction(container, "ship")}
                            >
                              Ship container
                            </button>
                            <button
                              type="button"
                              className="button"
                              onClick={() => handleAction(container, "queue")}
                            >
                              Queue for dispatch
                            </button>
                          </>
                        )}
                      </div>

                      <div className={noteClassName}>
                        <strong>Simulation:</strong> {container.note}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="shipment-status-panel shipment-status-sidebar">
              <div className="shipment-section-head shipment-section-head--stacked">
              </div>

              <div className="shipment-legend">
                <div className="shipment-legend-row">
                  <span className="pill pill--ok">0% - 19%</span>
                  <div className="shipment-status-copy">
                    Container remains eligible for normal shipment dispatch.
                  </div>
                </div>
                <div className="shipment-legend-row">
                  <span className="pill pill--severe">20%+</span>
                  <div className="shipment-status-copy">
                    Container is flagged for return to its original destination.
                  </div>
                </div>
              </div>

              <div className="shipment-log-section">
                <div className="shipment-section-head shipment-section-head--stacked">
                  <div>
                    <h3>Shipment activity log</h3>
                    <p className="hint shipment-status-copy">
                      Latest simulated update will appear here.
                    </p>
                  </div>
                </div>

                <div className="shipment-log-list">
                  {activityLog.map((entry, index) => (
                    <div key={`${entry.label}-${index}`} className="shipment-log-item">
                      <span>{entry.label}</span>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

export default ShipmentStatus;