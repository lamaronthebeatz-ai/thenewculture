import { createClient } from "@supabase/supabase-js";

// Chuẩn hoá về đúng gốc project (vd 'https://xxx.supabase.co'), không có
// path phía sau. Lý do: trang Project API Settings của Supabase Dashboard
// hiện sẵn 1 ô "URL" ngay cạnh ví dụ PostgREST/Auth dạng
// 'https://xxx.supabase.co/rest/v1/' — dễ bị copy nhầm nguyên cụm đó vào
// biến môi trường VITE_SUPABASE_URL thay vì chỉ phần gốc. Nếu để nguyên,
// mọi request (kể cả đăng nhập, .../auth/v1/token) sẽ bị ghép lặp path
// thành '.../rest/v1/auth/v1/token' — Supabase gateway trả về đúng lỗi
// "Invalid path specified in request URL" (đã gặp y hệt ở scripts/build.py,
// xem _normalize_supabase_url() ở đó — cùng một lỗi, cùng một cách sửa).
function normalizeSupabaseUrl(raw) {
  let url = (raw || "").trim().replace(/\/+$/, "");
  if (url.endsWith("/rest/v1")) url = url.slice(0, -"/rest/v1".length);
  if (url.endsWith("/auth/v1")) url = url.slice(0, -"/auth/v1".length);
  return url;
}

const supabaseUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Thiếu VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — tạo file .env.local từ .env.example rồi điền giá trị thật."
  );
}
if (!/^https?:\/\//.test(supabaseUrl)) {
  throw new Error(
    `VITE_SUPABASE_URL không hợp lệ: '${supabaseUrl}' — phải là URL đầy đủ dạng 'https://<project-ref>.supabase.co' (không kèm '/rest/v1').`
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
