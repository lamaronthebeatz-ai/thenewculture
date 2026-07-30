import { useRef } from "react";
import { useDismiss } from "./useDismiss";

// TNCOS component library — Drawer. side: right | left | bottom (bottom
// dùng cho mobile — xem layout/InspectorPanel.jsx dùng Drawer ở tablet).
export default function Drawer({ open, onClose, title, side = "right", children }) {
  const ref = useRef(null);
  useDismiss(open, ref, onClose);

  if (!open) return null;

  return (
    <div className="tncos-overlay tncos-overlay--drawer tncos-overlay-fade">
      <div
        ref={ref}
        className={`tncos-drawer tncos-drawer--${side} tncos-slide-in-right`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="tncos-drawer__header">
          <h2>{title}</h2>
          <button type="button" className="tncos-dialog__close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="tncos-drawer__body">{children}</div>
      </div>
    </div>
  );
}
