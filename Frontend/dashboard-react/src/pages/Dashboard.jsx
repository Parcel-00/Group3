import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";

function Dashboard() {
  const navigate = useNavigate();

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="hero">
          <div className="badge" aria-label="Prototype status">
            <span className="dot" aria-hidden="true"></span>
            Prototype front-end (local demo)
          </div>

          <h1>Parcelᵀᴹ</h1>
          <p className="subtitle">We cut out the middle men.</p>
        </div>

        <div className="actions" role="navigation" aria-label="Primary actions">
          <button
            type="button"
            className="button primary"
            onClick={() => navigate("/scan")}
          >
            Begin Shipment Scan
          </button>
          <button
            type="button"
            className="button"
            onClick={() => navigate("/logger")}
          >
            View Logger
          </button>
          <button
            type="button"
            className="button"
            onClick={() => navigate("/about")}
          >
            About
          </button>
        </div>

        <div className="panel">
          <div className="left">
            <h2>Status</h2>
            <p>
              Scan results are generated locally and stored in for the logger view.
            </p>
          </div>
          <div className="right">
            <button
              type="button"
              className="button ghost"
              onClick={() => navigate("/scan")}
            >
              Go to Scan
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Dashboard;
