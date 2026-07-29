import { NavLink } from "react-router-dom";

const NAV_GROUPS = [
  {
    label: "Nội dung",
    items: [
      { to: "/", label: "Dashboard", end: true },
      { to: "/articles", label: "Articles" },
      { to: "/authors", label: "Authors" },
      { to: "/categories", label: "Categories" },
      { to: "/series", label: "Series" },
      { to: "/tags", label: "Tags" },
    ],
  },
  {
    label: "Thư viện",
    items: [{ to: "/media", label: "Media" }],
  },
  {
    label: "Bố cục trang",
    items: [
      { to: "/menus", label: "Menu Builder" },
      { to: "/footer", label: "Footer Builder" },
    ],
  },
  {
    label: "Hệ thống",
    items: [{ to: "/settings", label: "Site Settings" }],
  },
];

export default function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">TNC Dashboard</div>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="sidebar__group">
          <div className="sidebar__group-label">{group.label}</div>
          <ul className="sidebar__nav">
            {group.items.map((item) => (
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
        </div>
      ))}
    </nav>
  );
}
