import { useEffect, useState } from "react";

// TNCOS shell — state nhỏ lưu cục bộ trình duyệt (sidebar collapsed/width,
// Favorites, Recent) — KHÔNG phải business data, không cần bảng CSDL mới
// (đúng ràng buộc Phase 1 "không thay đổi Database"). Đồng nghĩa: chưa đồng
// bộ nhiều thiết bị — nếu cần sau này, đó là việc thêm bảng ở Phase 2.
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage đầy/bị chặn (chế độ ẩn danh) — bỏ qua, không chặn UI.
    }
  }, [key, value]);

  return [value, setValue];
}
