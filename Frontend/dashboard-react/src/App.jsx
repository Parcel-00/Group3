import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import Logger from "./pages/Logger";
import Login from "./pages/Login";
import Results from "./pages/Results";
import Scan from "./pages/Scan";
import { supabase } from "./supabaseClient";
// import ShipmentStatus from "./pages/ShipmentStatus";
function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setSession(data?.session ?? null);
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const ProtectedRoute = ({ children }) => {
    if (authLoading) return <div className="loading">Checking authentication...</div>;
    if (!session) return <Navigate to="/" replace />;
    return children;
  };

  return (
    <>
      <div className="bg-slideshow" aria-hidden="true">
        <span className="bg-slide bg-slide--1"></span>
        <span className="bg-slide bg-slide--2"></span>
        <span className="bg-slide bg-slide--3"></span>
        <span className="bg-slide bg-slide--4"></span>
        <span className="bg-slide bg-slide--5"></span>
        <span className="bg-slide bg-slide--6"></span>
      </div>

      <Routes>
        <Route
          path="/"
          element={
            session && !authLoading ? <Navigate to="/dashboard" replace /> : <Login />
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute>
              <Scan />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <Results />
            </ProtectedRoute>
          }
        />
        <Route
          path="/logger"
          element={
            <ProtectedRoute>
              <Logger />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
