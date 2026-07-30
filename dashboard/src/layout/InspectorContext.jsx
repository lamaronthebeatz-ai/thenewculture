import { createContext, useCallback, useContext, useMemo, useState } from "react";

const InspectorContext = createContext(null);

// TNCOS Inspector panel — panel thứ 3 của layout desktop (Sidebar | Main
// Workspace | Inspector), thay cho popup/modal khi cần xem Metadata/SEO/
// History/Publish/Properties của 1 item đang mở (đúng yêu cầu "Inspector:
// Không popup"). Bất kỳ trang nào cũng có thể gọi useInspector().open(...)
// để hiện panel — Phase 1 wiring thật cho module Articles (flagship), các
// module khác dùng chung shell này ở Phase sau mà không cần sửa layout.
export function InspectorProvider({ children }) {
  const [content, setContent] = useState(null); // { title, tabs: [{key,label,content}] }

  const open = useCallback((next) => setContent(next), []);
  const close = useCallback(() => setContent(null), []);

  const value = useMemo(() => ({ content, open, close, isOpen: content !== null }), [content, open, close]);

  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useInspector() {
  const ctx = useContext(InspectorContext);
  if (!ctx) throw new Error("useInspector() phải dùng trong <InspectorProvider>");
  return ctx;
}
