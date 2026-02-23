import { Navigate, Route, Routes } from "react-router-dom";
import "./App.css";
import About from "./pages/About";
import Dashboard from "./pages/Dashboard";
import Logger from "./pages/Logger";
import Login from "./pages/Login";
import Results from "./pages/Results";
import Scan from "./pages/Scan";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/results" element={<Results />} />
      <Route path="/logger" element={<Logger />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
