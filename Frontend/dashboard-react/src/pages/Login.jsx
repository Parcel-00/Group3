import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState(location.state?.message ?? null);

  useEffect(() => {
    setMessage(location.state?.message ?? null);
  }, [location.state]);

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!email || !password) {
      setMessage("Enter an email and password to continue.");
      return;
    }

    navigate("/dashboard");
  };

  return (
    <main className="shell">
      <section className="card card-pad" aria-live="polite">
        <h3>Login</h3>
        <p className="hint">
          Demo sign-in for the prototype flow. No backend call is made.
        </p>

        <form className="form" autoComplete="off" onSubmit={handleSubmit}>
          <div className="field">
            <label className="label" htmlFor="demo-email">
              Email
            </label>
            <input
              id="demo-email"
              className="input"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="demo-password">
              Password
            </label>
            <input
              id="demo-password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="row">
            <button type="submit" className="button primary btn-wide">
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </div>

          <div className="row row-compact">
            <button
              type="button"
              className="button linkish"
              onClick={() =>
                setMode((value) => (value === "signin" ? "signup" : "signin"))
              }
            >
              {mode === "signin"
                ? "Need an account? Create one"
                : "Have an account? Sign in"}
            </button>
          </div>

          {message && <div className="msg ok">{message}</div>}
        </form>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default Login;
