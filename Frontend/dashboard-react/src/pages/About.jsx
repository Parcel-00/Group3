import { useNavigate } from "react-router-dom";
import TopNav from "../components/TopNav";

function About() {
  const navigate = useNavigate();

  return (
    <main className="shell shell-wide">
      <section className="card">
        <TopNav />

        <div className="card-pad page-grid">
          <div>
            <h3>About</h3>
            <p className="hint">
              This is a prototype interface for a shipping container manifest scanner
              and logger. In the full system, camera-based detection would identify
              the container (LEGO/wooden-block proxy), barcode reading would capture
              IDs, and damage/anomaly detection would record defects and compute an
              anomaly percentage in 20% increments.
            </p>
          </div>

          <div className="msg">
            Integration points (future): <strong>camera input</strong>,
            <strong> barcode decoding</strong>, <strong>manifest store</strong>, and
            <strong> analytics</strong>.
          </div>

          <div className="row">
            <button
              type="button"
              className="button ghost"
              onClick={() => navigate("/dashboard")}
            >
              Back
            </button>
          </div>
        </div>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default About;
