import { Navigate, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import Logger from "./pages/Logger";
import Login from "./pages/Login";
import Results from "./pages/Results";
import ShipmentStatus from "./pages/ShipmentStatus";
import Receiver from "./pages/Receiver";
import supabase from "./supabaseClient"; // 2. CRITICAL: Added this import to fix white screen

function ProtectedRoute({ children, authLoading, session }) {
  if (authLoading) {
    return <div className="loading">Checking authentication...</div>;
  }
  if (!session) return <Navigate to="/" replace />;
  return children;
}

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // This was crashing because 'supabase' wasn't imported!
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
      if (data?.subscription) data.subscription.unsubscribe();
    };
  }, []);

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
            session && !authLoading ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/receiver"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <Receiver />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <Receiver />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <Results />
            </ProtectedRoute>
          }
        />
        <Route
          path="/logger"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <Logger />
            </ProtectedRoute>
          }
        />
        <Route
          path="/about"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <About />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipment-status"
          element={
            <ProtectedRoute authLoading={authLoading} session={session}>
              <ShipmentStatus />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
