import { useEffect, useState } from "react";
import { DASHBOARD_VERSION } from "../../lib/version";

export default function HeroHeader({ editorName }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Cập nhật mỗi 30s là đủ cho hiển thị giờ trên header — không cần mỗi giây.
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const dateStr = now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="hero-header">
      <h1>Xin chào, {editorName || "Editor"}</h1>
      <p className="hero-header__subtitle">The New Culture Editorial Dashboard</p>
      <div className="hero-header__meta">
        <span>{dateStr}</span>
        <span className="hero-header__dot">·</span>
        <span>{timeStr}</span>
        <span className="hero-header__dot">·</span>
        <span>Dashboard v{DASHBOARD_VERSION}</span>
      </div>
    </div>
  );
}
