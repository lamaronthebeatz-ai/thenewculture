// TNCOS Information Architecture — nguồn duy nhất cho nhóm điều hướng, dùng
// chung bởi Sidebar (desktop/tablet) và MobileNav (drawer "Thêm" trên mobile)
// — thêm 1 module mới chỉ cần sửa đúng 1 chỗ này.
export const NAV_GROUPS = [
  {
    key: "workspace",
    label: "Workspace",
    items: [{ to: "/", label: "Home", end: true, icon: "⌂" }],
  },
  {
    key: "editorial",
    label: "Editorial",
    items: [
      { to: "/articles", label: "Articles", icon: "▤" },
      { to: "/authors", label: "Authors", icon: "◐" },
      { to: "/categories", label: "Categories", icon: "▢" },
      { to: "/series", label: "Series", icon: "▥" },
      { to: "/tags", label: "Tags", icon: "◆" },
      { to: "/tnc-selects", label: "TNC Selects", icon: "★" },
      { to: "/magazine", label: "TNC Magazine", icon: "▦" },
    ],
  },
  {
    key: "publishing",
    label: "Publishing",
    items: [
      { to: "/hero", label: "Hero Manager", icon: "▨" },
      { to: "/ads", label: "Advertisement Manager", icon: "◫" },
      { to: "/promotions", label: "Promotion Manager", icon: "◪" },
      { to: "/announcements", label: "Announcement Manager", icon: "◔" },
      { to: "/menus", label: "Menu Builder", icon: "☰" },
      { to: "/footer", label: "Footer Builder", icon: "▁" },
    ],
  },
  // Rev 17 (Phase 5) — Layout Builder: theo đúng yêu cầu "Dashboard phải
  // thuần tiếng Việt" cho riêng module này (các nhóm khác giữ nguyên nhãn
  // tiếng Anh hiện có, không đổi ngoài phạm vi yêu cầu).
  {
    key: "layout",
    label: "Bố cục Website",
    items: [
      { to: "/layout/homepage", label: "Bố cục Trang chủ", icon: "◧", permission: "layout.view" },
      { to: "/layout/pages", label: "Bố cục Trang", icon: "◨", permission: "layout.view" },
      { to: "/layout/registry", label: "Danh mục Khối", icon: "▤", permission: "layout.view" },
    ],
  },
  {
    key: "media",
    label: "Media",
    items: [{ to: "/media", label: "Media Library", icon: "▧" }],
  },
  {
    key: "administration",
    label: "Administration",
    items: [
      { to: "/users", label: "Users", icon: "◑", permission: "users.view" },
      { to: "/roles", label: "Roles & Permissions", icon: "◕", permission: "roles.view" },
      { to: "/organization", label: "Organization", icon: "◒", permission: "organization.view" },
      { to: "/activity-log", label: "Activity Log", icon: "◷" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    items: [
      { to: "/settings", label: "Site Settings", icon: "⚙" },
      { to: "/profile", label: "Profile", icon: "☺" },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
