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
              What is Parcel? Parcel is an AI-powered, real object detection, and simulated shipping container manifest scanner, logging software and web application. The software’s backend scans the 1D barcode and unique identifier of incoming shipping containers, records their content (pre-written, because this is simulated) as well as any anomalies (simulated via marked dots on the bricks), damages, and displays them to the frontend - an accessible app interface, specifically in a dedicated tab, where users can view the manifests of past shipments, while administrative users, in addition, can access the system’s backend, which is the software and various software components, to update, eliminate potential errors, and maintain them.
            </p>
          </div>

          <div className="msg">
            Integration points: <strong>camera input</strong>,
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

      <footer>Parcel by Group3.</footer>
    </main>
  );
}

export default About;
