import { NavLink, useNavigate } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/scan", label: "Scan" },
  { to: "/logger", label: "Logger" },
  { to: "/about", label: "About" },
];

function TopNav() {
  const navigate = useNavigate();

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
        onClick={() => navigate("/", { state: { message: "Signed out." } })}
      >
        Logout
      </button>
    </header>
  );
}

export default TopNav;
