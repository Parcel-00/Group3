import React, { useState } from "react";
import TopNav from "../components/TopNav";

function Facilities() {
  // Mock Data for now - easy to connect to backend later
  const [facilities] = useState([
    { id: 1, name: "Hamburg Port - Germany" },
    { id: 2, name: "Shanghai Port - China" },
    { id: 3, name: "Port of Rotterdam - Netherlands" },
    { id: 4, name: "Port of Jebel Ali - UAE" }
  ]);

  return (
    <main className="shell shell-wide" style={{ backgroundColor: "white", minHeight: "100vh" }}>
      <section className="card" style={{ backgroundColor: "white", color: "black" }}>
        <TopNav />

        <div className="hero">
          <h1 style={{ color: "black" }}>Facility Management</h1>
          <p className="subtitle" style={{ color: "#333" }}>Manage and monitor port locations globally.</p>
        </div>

        <div className="panel" style={{ borderTop: "1px solid #eee" }}>
          <div className="left">
            <h2 style={{ color: "black" }}>Current Facilities (Mock Data)</h2>
            <ul style={{ color: "black", listStyle: "none", padding: 0, marginTop: "10px" }}>
              {facilities.map((port) => (
                <li key={port.id} style={{ padding: "12px 0", borderBottom: "1px solid #eee", fontSize: "1.1rem" }}>
                  📍 {port.name}
                </li>
              ))}
            </ul>
          </div>
          <div className="right">
            <button type="button" className="button primary">
              Add New Facility
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Facilities;