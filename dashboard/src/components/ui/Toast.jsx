import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

// TNCOS component library — Toast. Bọc <App> 1 lần (xem App.jsx), gọi
// useToast().show("Đã lưu.", { tone: "success" }) ở bất kỳ đâu bên trong.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message, { tone = "neutral", duration = 4000 } = {}) => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, tone }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <div className="tncos-toast-region" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`tncos-toast tncos-toast--${t.tone} tncos-slide-up`}>
            <span>{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Đóng thông báo">
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() phải dùng trong <ToastProvider>");
  return ctx;
}
