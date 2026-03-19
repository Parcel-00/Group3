import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/scan", label: "Scan" },
  { to: "/logger", label: "Logger" },
  { to: "/about", label: "About" },
  { to: "/shipment-status", label: "Shipment Status" },
];

function TopNav() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/", { state: { message: "Signed out." } });
  };

  return (
    <header className="top-nav">
      <nav className="nav-links" aria-label="Primary">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <button
        type="button"
        className="button ghost"
        onClick={handleLogout}
      >
        Logout
      </button>
    </header>
  );
}

export default TopNav;
