import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/articles", label: "Articles" },
  { to: "/authors", label: "Authors" },
  { to: "/categories", label: "Categories" },
  { to: "/series", label: "Series" },
  { to: "/tags", label: "Tags" },
  { to: "/media", label: "Media" },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">TNC Dashboard</div>
      <ul className="sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "sidebar__link is-active" : "sidebar__link")}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
