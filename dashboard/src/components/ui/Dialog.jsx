import { useRef, useEffect } from "react";
import { useDismiss } from "./useDismiss";

// TNCOS component library — Dialog (modal). Không popup ngoài luồng — dùng
// cho xác nhận/form ngắn. Trang cần hiển thị metadata/history dài dùng
// Inspector panel (xem layout/InspectorPanel.jsx), không dùng Dialog.
export default function Dialog({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useDismiss(open, ref, onClose);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    ref.current?.querySelector("button, [href], input, select, textarea")?.focus();
    return () => previouslyFocused?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <div className="tncos-overlay tncos-overlay-fade">
      <div ref={ref} className="tncos-dialog tncos-scale-in" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tncos-dialog__header">
          <h2>{title}</h2>
          <button type="button" className="tncos-dialog__close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="tncos-dialog__body">{children}</div>
        {footer && <div className="tncos-dialog__footer">{footer}</div>}
      </div>
    </div>
  );
}
