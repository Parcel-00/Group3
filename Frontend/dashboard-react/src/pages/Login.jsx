import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [message, setMessage] = useState(location.state?.message ?? null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setMessage(location.state?.message ?? null);
  }, [location.state]);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data?.session) navigate("/dashboard");
    });
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!email || !password) {
      setMessage("Please enter an email and password to continue.");
      return;
    }

    setWorking(true);
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else if (data?.session) {
        navigate("/dashboard");
      } else {
        setMessage("Check your email to confirm your account.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(error.message);
      } else {
        navigate("/dashboard");
      }
    }
    setWorking(false);
  };

  return (
    <main className="shell">
      <section className="card card-pad" aria-live="polite">
        <h3>Login</h3>
        <p className="hint">Sign in with your Supabase account.</p>

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
            <button
              type="submit"
              className="button primary btn-wide"
              disabled={working}
            >
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
              disabled={working}
            >
              {mode === "signin"
                ? "Need an account? Create one"
                : "Have an account? Sign in"}
            </button>
          </div>

          {message && <div className="msg ok">{message}</div>}
        </form>
      </section>
    </main>
  );
}

export default Login;
