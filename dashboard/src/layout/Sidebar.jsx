import { useState } from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

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
      { to: "/tnc-selects", label: "TNC Selects" },
      { to: "/magazine", label: "TNC Magazine" },
    ],
  },
  {
    label: "Thư viện",
    items: [{ to: "/media", label: "Media" }],
  },
  {
    label: "Trình diễn",
    items: [
      { to: "/hero", label: "Hero Manager" },
      { to: "/ads", label: "Advertisement Manager" },
      { to: "/promotions", label: "Promotion Manager" },
      { to: "/announcements", label: "Announcement Manager" },
    ],
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

// Bug fix: Site Settings/Menu/Footer/Hero/Ads/Promotion/Announcement không
// có Database Webhook riêng như Articles, nên sửa xong ở các module này
// không tự kích hoạt build lại site — phải chờ lịch cron (mỗi 15 phút) hoặc
// bấm nút này để build ngay. Xem supabase/functions/trigger-rebuild/.
function RebuildButton() {
  const [state, setState] = useState("idle"); // idle | loading | ok | error
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    setMessage("");
    const { data, error } = await supabase.functions.invoke("trigger-rebuild", { method: "POST" });
    if (error) {
      // Debug: "Failed to send a request..." (FunctionsFetchError) nghĩa là
      // fetch() thất bại trước khi có phản hồi (CORS/network) — không phải
      // lỗi logic bên trong function. Log rõ URL thực tế đã gọi + toàn bộ
      // error để so khớp đúng project/tab Network khi cần điều tra tiếp.
      console.error("[trigger-rebuild] invoke thất bại:", error.name, error.message, error);
      setState("error");
      setMessage(error.message || "Không kích hoạt được.");
      return;
    }
    if (data?.ok && data?.triggered) {
      setState("ok");
      setMessage("Đã kích hoạt build. Website sẽ cập nhật sau khoảng 1–2 phút.");
    } else {
      setState("error");
      setMessage(data?.reason || "Không kích hoạt được.");
    }
  }

  return (
    <div className="sidebar__rebuild">
      <button type="button" className="btn btn--ghost btn--sm" onClick={handleClick} disabled={state === "loading"}>
        {state === "loading" ? "Đang kích hoạt…" : "Rebuild site now"}
      </button>
      {message && <p className={state === "error" ? "field-error" : "muted small"}>{message}</p>}
    </div>
  );
}

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
      <RebuildButton />
    </nav>
  );
}
