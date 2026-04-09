import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Overview, quick actions, and system status.",
  },
  {
    to: "/receiver",
    label: "Receiver",
    description: "Receive, route, and scan container IDs.",
  },
  {
    to: "/scan",
    label: "Scan",
    description: "Start a shipment scan and process new entries.",
  },
  {
    to: "/logger",
    label: "Logger",
    description: "Review saved scans and logged activity.",
  },
  {
    to: "/about",
    label: "About",
    description: "Project summary, purpose, and team information.",
  },
  {
    to: "/shipment-status",
    label: "Shipment Status",
    description: "Track shipment progress and current updates.",
  },
];

function TopNav() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(null);
  const [menuHovered, setMenuHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const [logoutHovered, setLogoutHovered] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/", {
        replace: true,
        state: { message: "Signed out successfully." },
      });
    } catch (error) {
      console.error("Logout failed:", error.message);
      alert("Error logging out. Please try again.");
    }
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="top-nav">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            onMouseEnter={() => setMenuHovered(true)}
            onMouseLeave={() => setMenuHovered(false)}
            style={{
              border: "1px solid rgba(83, 124, 184, 0.33)",
              background: "rgba(255, 255, 255, 0.9)",
              borderRadius: "12px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: "700",
              cursor: "pointer",
              color: "#536681",
              minHeight: "44px",
              transition: "all 0.25s ease",
              transform: menuHovered ? "translateY(-2px)" : "translateY(0)",
              boxShadow: menuHovered
                ? "0 10px 24px rgba(47, 109, 246, 0.15)"
                : "0 0 0 rgba(0,0,0,0)",
              backgroundColor: menuHovered
                ? "rgba(240, 247, 255, 0.98)"
                : "rgba(255, 255, 255, 0.9)",
            }}
          >
            Menu
          </button>
        </div>
      </div>

      {menuOpen && (
        <>
          <div
            onClick={closeMenu}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(20, 35, 61, 0.14)",
              backdropFilter: "blur(2px)",
              zIndex: 999,
            }}
          />

          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "min(340px, 82vw)",
              height: "100vh",
              background: "rgba(255, 255, 255, 0.97)",
              borderRight: "1px solid rgba(83, 124, 184, 0.18)",
              boxShadow: "0 18px 42px rgba(24, 45, 82, 0.16)",
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              padding: "20px 16px 20px 16px",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
                flexShrink: 0,
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "19px",
                    fontWeight: "800",
                    color: "#14233d",
                  }}
                >
                  Navigation
                </h2>
                <p
                  style={{
                    margin: "6px 0 0 0",
                    fontSize: "13px",
                    color: "#6f7f95",
                  }}
                >
                  Move through the app quickly
                </p>
              </div>

              <button
                type="button"
                onClick={closeMenu}
                onMouseEnter={() => setCloseHovered(true)}
                onMouseLeave={() => setCloseHovered(false)}
                style={{
                  width: "42px",
                  height: "42px",
                  borderRadius: "12px",
                  border: "1px solid rgba(47, 109, 246, 0.35)",
                  background: closeHovered ? "rgba(240, 247, 255, 1)" : "white",
                  fontSize: "24px",
                  fontWeight: "700",
                  lineHeight: 1,
                  cursor: "pointer",
                  color: "#14233d",
                  padding: 0,
                  transition: "all 0.25s ease",
                  transform: closeHovered ? "scale(1.05)" : "scale(1)",
                  boxShadow: closeHovered
                    ? "0 8px 18px rgba(47, 109, 246, 0.12)"
                    : "none",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                height: "1px",
                background: "rgba(83, 124, 184, 0.14)",
                marginBottom: "14px",
                flexShrink: 0,
              }}
            />

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                paddingRight: "6px",
                paddingBottom: "18px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                scrollbarWidth: "thin",
                scrollbarColor:
                  "rgba(120, 140, 170, 0.65) rgba(230, 236, 243, 0.55)",
              }}
            >
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  onMouseEnter={() => setHoveredItem(item.to)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={({ isActive }) => {
                    const isHovered = hoveredItem === item.to;

                    return {
                      display: "block",
                      textDecoration: "none",
                      padding: "14px 14px",
                      borderRadius: "16px",
                      border: isActive
                        ? "1px solid rgba(47, 109, 246, 0.45)"
                        : "1px solid rgba(83, 124, 184, 0.12)",
                      background: isActive
                        ? "linear-gradient(135deg, rgba(232,244,255,0.98), rgba(245,250,255,0.98))"
                        : isHovered
                        ? "rgba(248, 251, 255, 0.98)"
                        : "rgba(255, 255, 255, 0.92)",
                      color: "#14233d",
                      boxShadow: isActive
                        ? "0 10px 22px rgba(47, 109, 246, 0.10)"
                        : isHovered
                        ? "0 10px 20px rgba(24, 45, 82, 0.07)"
                        : "none",
                      transform: isHovered
                        ? "translateX(6px) translateY(-2px)"
                        : "translateX(0) translateY(0)",
                      transition: "all 0.25s ease",
                    };
                  }}
                >
                  {({ isActive }) => (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: "10px",
                          marginBottom: "6px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "800",
                            color: isActive ? "#2f6df6" : "#14233d",
                          }}
                        >
                          {item.label}
                        </span>

                        <span
                          style={{
                            fontSize: "18px",
                            color: isActive ? "#2f6df6" : "#8ea0b7",
                            transition: "all 0.25s ease",
                            transform:
                              hoveredItem === item.to
                                ? "translateX(2px)"
                                : "translateX(0)",
                          }}
                        >
                          ›
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: "12.5px",
                          lineHeight: "1.45",
                          color: isActive ? "#5578b6" : "#6f7f95",
                        }}
                      >
                        {item.description}
                      </div>
                    </div>
                  )}
                </NavLink>
              ))}

              <div
                style={{
                  marginTop: "6px",
                  paddingTop: "12px",
                  borderTop: "1px solid rgba(220, 53, 69, 0.12)",
                }}
              >
                <button
                  type="button"
                  onClick={handleLogout}
                  onMouseEnter={() => setLogoutHovered(true)}
                  onMouseLeave={() => setLogoutHovered(false)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "11px 13px",
                    borderRadius: "12px",
                    border: "1px solid rgba(220, 53, 69, 0.22)",
                    background: logoutHovered
                      ? "rgba(255, 241, 242, 1)"
                      : "rgba(255, 248, 248, 0.96)",
                    color: "#c03945",
                    fontSize: "13px",
                    fontWeight: "700",
                    cursor: "pointer",
                    transition: "all 0.22s ease",
                    transform: logoutHovered
                      ? "translateX(4px)"
                      : "translateX(0)",
                    boxShadow: logoutHovered
                      ? "0 8px 18px rgba(192, 57, 69, 0.10)"
                      : "none",
                    marginBottom: "6px",
                  }}
                >
                  <span>Logout</span>
                  <span style={{ fontSize: "15px" }}>↩</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default TopNav;