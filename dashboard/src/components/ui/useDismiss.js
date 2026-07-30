import { useEffect } from "react";

// TNCOS component library — hành vi dùng chung cho Dialog/Drawer/Popover:
// nhấn Escape hoặc click ra ngoài ref thì đóng.
export function useDismiss(active, ref, onDismiss) {
  useEffect(() => {
    if (!active) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") onDismiss();
    }
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [active, ref, onDismiss]);
}
