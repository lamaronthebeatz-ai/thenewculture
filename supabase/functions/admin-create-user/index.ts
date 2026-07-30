// Dashboard V2.1.1 — đề xuất V2.2 #2: cho phép "+ User mới" tự tạo tài khoản
// Supabase Auth thay vì bắt admin phải vào Supabase Studio thủ công.
//
// BỐI CẢNH: Dashboard (role "authenticated", KHÔNG dùng service_role) không
// gọi được Admin API (auth.admin.createUser) — thao tác đó CHỈ thực hiện
// được bằng service_role, và service_role tuyệt đối không được nhúng vào
// code phía client (xem dashboard/.env.example). Function này là nơi DUY
// NHẤT chứa service_role cho luồng này — chạy phía server (Supabase Edge
// Function), không bao giờ gửi key đó về trình duyệt.
//
// Xác thực: verify caller có permission "users.create" bằng cách gọi lại
// has_permission() (Rev 13/14) bằng chính JWT của người gọi — cùng cơ chế
// RLS Dashboard đang dùng, không tạo đường phân quyền mới nào (giống hệt
// cách trigger-rebuild xác thực bằng is_active_editor()).
//
// Sau khi tạo xong tài khoản Auth, Dashboard (client, dùng session của
// chính admin đang gọi) tự INSERT dashboard_users bằng id trả về — KHÔNG
// làm việc đó trong function này, giữ đúng nguyên tắc "mọi ghi dữ liệu ứng
// dụng đi qua RLS của chính editor", function chỉ đảm nhận đúng 1 việc
// service_role bắt buộc phải làm (tạo tài khoản Auth).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Xem giải thích đầy đủ ở supabase/functions/trigger-rebuild/index.ts — cùng
// 1 lỗi CORS/x-client-info đã gặp, cùng 1 cách sửa, áp dụng lại nguyên vẹn.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-retry-count",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, reason: "missing Authorization header" }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Thiếu SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY (biến môi trường Supabase tự cấp)");
    return json({ ok: false, reason: "missing Supabase configuration" }, 500);
  }

  let email: string | undefined;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim() : undefined;
  } catch {
    // body rỗng/không phải JSON hợp lệ — xử lý ở check bên dưới
  }
  if (!email) {
    return json({ ok: false, reason: "missing email" }, 400);
  }

  // has_permission() chạy dưới quyền JWT của người gọi (không phải
  // service_role) — đúng RLS hiện có, không tạo luồng phân quyền mới.
  const permRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/has_permission`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ permission_key: "users.create" }),
  });
  if (!permRes.ok) {
    return json({ ok: false, reason: "auth check failed" }, 401);
  }
  const canCreate = await permRes.json();
  if (canCreate !== true) {
    return json({ ok: false, reason: "missing permission users.create" }, 403);
  }

  // Admin API — CHỈ service_role gọi được, key này không bao giờ rời khỏi
  // môi trường server của function.
  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });

  const createBody = await createRes.json();
  if (!createRes.ok) {
    // "User already registered" (422) — trường hợp thường gặp nhất, dịch
    // nghĩa rõ để Dashboard hiển thị đúng hướng xử lý.
    const reason = createRes.status === 422 ? "email already registered" : createBody?.msg || "create user failed";
    return json({ ok: false, reason, status: createRes.status }, createRes.status === 422 ? 409 : 502);
  }

  return json({ ok: true, id: createBody.id, email: createBody.email });
});
