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

          <h1>Parcel Dashboard</h1>
          <p className="subtitle">
            Standalone interface prototype. Use the scan flow to generate sample
            damage results and review them in the logger.
          </p>
        </div>

        <div className="actions" role="navigation" aria-label="Primary actions">
          <button
            type="button"
            className="button primary"
            onClick={() => navigate("/scan")}
          >
            Start Scan
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
              <strong>Front-end demo</strong>. Scan results are generated locally and
              stored in browser localStorage for the logger view.
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

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default Dashboard;
