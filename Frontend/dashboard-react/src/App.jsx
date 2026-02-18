import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("login");
  const [loginMsg, setLoginMsg] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginMode, setLoginMode] = useState("signin");
  const [authWorking, setAuthWorking] = useState(false);
  const [profileRole, setProfileRole] = useState(null);

  const clearMessages = () => {
    setLoginMsg(null);
  };

  const showFront = () => {
    if (!authUser) {
      setActivePage("login");
      clearMessages();
      return;
    }
    setActivePage("front");
    clearMessages();
  };

  const showPage = (key) => {
    if (!authUser && key !== "login" && key !== "front") {
      setActivePage("front");
      clearMessages();
      return;
    }
    if (key === "adminPanel" && profileRole !== "admin") {
      setActivePage("front");
      clearMessages();
      return;
    }
    setActivePage(key);
    clearMessages();
  };

  const loadProfileRole = async (userId) => {
    if (!userId) {
      setProfileRole(null);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (error) {
      setLoginMsg({ type: "bad", text: error.message });
      setProfileRole(null);
      return;
    }

    setProfileRole(data?.role ?? null);
  };

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) return;
        if (error) {
          setLoginMsg({ type: "bad", text: error.message });
        }
        const session = data?.session ?? null;
        setAuthUser(session?.user ?? null);
        if (session?.user?.id) {
          loadProfileRole(session.user.id);
        } else {
          setProfileRole(null);
          setActivePage("login");
        }
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      setAuthUser(session?.user ?? null);
      if (session?.user?.id) {
        loadProfileRole(session.user.id);
      } else {
        setProfileRole(null);
        setActivePage("login");
      }
      if (event === "SIGNED_IN") {
        setActivePage("front");
      }
      if (event === "SIGNED_OUT") {
        setActivePage("login");
      }
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!email || !password) {
      setLoginMsg({ type: "bad", text: "Email and password are required." });
      return;
    }

    setAuthWorking(true);

    if (loginMode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setLoginMsg({ type: "bad", text: error.message });
      } else if (data?.session) {
        setLoginMsg({ type: "ok", text: "Account created and signed in." });
      } else {
        setLoginMsg({
          type: "ok",
          text: "Check your email to confirm your account.",
        });
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoginMsg({ type: "bad", text: error.message });
      } else {
        setLoginMsg({ type: "ok", text: "Signed in successfully." });
      }
    }

    setAuthWorking(false);
  };

  const handleSignOut = async () => {
    clearMessages();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setLoginMsg({ type: "bad", text: error.message });
    } else {
      setEmail("");
      setPassword("");
      setLoginMode("signin");
      setLoginMsg({ type: "ok", text: "Signed out." });
    }
  };

  return (
    <main className="shell">
      {authUser && activePage === "front" && (
        <section className="card" id="front">
          <div className="hero">
            <div className="badge" aria-label="Prototype status">
              <span className="dot" aria-hidden="true"></span>
              Prototype front-end (unintegrated)
            </div>

            <h1>Parcel Dashboard</h1>
            <p className="subtitle">
              Standalone interface prototype. Buttons respond, but logging and
              scanner integration are intentionally not yet enabled.
            </p>
          </div>

          <div className="actions" role="navigation" aria-label="Primary actions">
            <button type="button" onClick={() => showPage("logger")}>
              View Logger
            </button>
            <button type="button" onClick={() => showPage("about")}>
              About
            </button>
            {profileRole === "admin" && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => showPage("adminPanel")}
              >
                Admin Panel
              </button>
            )}
          </div>

          <div className="panel">
            <div className="left">
              <h2>Status</h2>
              <p>
                <strong>Front-end only</strong>. No live camera feed, no barcode
                decoding, and no manifest data source at this stage.
              </p>
            </div>
            <div className="right">
              <button type="button" className="ghost" onClick={handleSignOut}>
                Sign out
              </button>
            </div>
          </div>
        </section>
      )}

      <section
        className={`card page ${activePage === "about" ? "active" : ""}`}
        id="page-about"
        aria-live="polite"
        hidden={!authUser}
      >
        <h3>About</h3>
        <p className="hint">
          This is a prototype interface for a shipping container manifest scanner
          and logger. In the full system, camera-based detection would identify
          the container (LEGO/wooden-block proxy), barcode reading would capture
          IDs, and damage/anomaly detection would record defects and compute an
          anomaly percentage in 20% increments.
        </p>
        <div className="msg">
          Integration points (future): <strong>camera input</strong>,{" "}
          <strong>barcode decoding</strong>, <strong>manifest store</strong>, and{" "}
          <strong>analytics</strong>.
        </div>

        <div className="panel panel-flat">
          <div className="right">
            <button type="button" className="ghost" onClick={showFront}>
              Back
            </button>
          </div>
        </div>
      </section>

      <section
        className={`card page ${activePage === "logger" ? "active" : ""}`}
        id="page-logger"
        aria-live="polite"
        hidden={!authUser}
      >
        <h3>View Logger</h3>
        <p className="hint">
          This view will eventually display the logged manifests after containers
          are detected and scanned. For now, it is a placeholder to verify
          navigation and layout.
        </p>

        <div className="logger-box" role="region" aria-label="Logger output placeholder">
          <strong>No manifest data available.</strong>
          <br />
          When integrated, this panel will show container IDs, header fields,
          inventory lines, and recorded anomaly scans.
        </div>

        <div className="panel panel-flat">
          <div className="right">
            <button type="button" className="ghost" onClick={showFront}>
              Back
            </button>
          </div>
        </div>
      </section>

      <section
        className={`card page ${activePage === "login" ? "active" : ""}`}
        id="page-login"
        aria-live="polite"
      >
        <h3>Login</h3>
        <p className="hint">
          Sign in with your Supabase email and password.
        </p>
        {authUser && (
          <div className="msg ok">
            Signed in as <strong>{authUser.email}</strong>.
          </div>
        )}

        <form className="form" id="loginForm" autoComplete="off" onSubmit={handleLoginSubmit}>
          <div>
            <label htmlFor="userEmail">Email</label>
            <input
              id="userEmail"
              name="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="userPassword">Password</label>
            <input
              id="userPassword"
              name="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          <div className="row">
            <button
              type="submit"
              className="btn-accent btn-wide"
              disabled={authWorking || authLoading}
            >
              {loginMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <button type="button" className="ghost" onClick={showFront}>
              Back
            </button>
          </div>
          <div className="row row-compact">
            <button
              type="button"
              className="link-button"
              onClick={() =>
                setLoginMode((mode) => (mode === "signin" ? "signup" : "signin"))
              }
              disabled={authWorking || authLoading}
            >
              {loginMode === "signin"
                ? "Need an account? Create one"
                : "Have an account? Sign in"}
            </button>
            {profileRole === "admin" && (
              <button
                type="button"
                className="link-button"
                onClick={() => showPage("adminPanel")}
              >
                Go to admin panel
              </button>
            )}
          </div>

          {loginMsg && (
            <div className={`msg ${loginMsg.type}`} id="loginMsg">
              {loginMsg.text}
            </div>
          )}
        </form>
      </section>

      <section
        className={`card page ${activePage === "adminPanel" ? "active" : ""}`}
        id="page-admin-panel"
        aria-live="polite"
        hidden={!authUser || profileRole !== "admin"}
      >
        <h3>Admin Panel (placeholder)</h3>
        <p className="hint">
          This screen represents where administrative functions would appear once
          integrated (for example: configuration, audit exports, user management,
          and direct access to inspection results).
        </p>

        <div className="logger-box" role="region" aria-label="Admin panel placeholder">
          <strong>Admin features are not integrated.</strong>
          <br />
          Expected behaviour (future): authenticated access to backend-only
          functions and restricted operational controls.
        </div>

        <div className="panel panel-flat">
          <div className="right">
            <button type="button" className="ghost" onClick={showFront}>
              Back
            </button>
          </div>
        </div>
      </section>

      <footer>Prototype UI only. No data is persisted by this front-end.</footer>
    </main>
  );
}

export default App;
