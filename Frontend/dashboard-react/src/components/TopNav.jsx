import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/scan", label: "Scan" },
  { to: "/logger", label: "Logger" },
  { to: "/about", label: "About" },
];

function TopNav() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      // Only navigate after we are sure the session is gone
      navigate("/", { replace: true, state: { message: "Signed out successfully." } });
    } catch (error) {
      console.error("Logout failed:", error.message);
      alert("Error logging out. Please try again.");
    }
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
