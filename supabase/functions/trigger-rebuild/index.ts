// CMS V2 — bug fix: "Rebuild site now" (gọi thủ công từ Dashboard).
//
// BỐI CẢNH LỖI ĐÃ GẶP: từ Phase 1 tới Phase 4, CMS V2 thêm nhiều bảng mới
// (site_settings, menus/menu_items, footer_settings/footer_partners,
// hero_slots, ads, promotions, announcements...) nhưng Database Webhook
// hiện có (xem supabase/functions/on-article-published/) CHỈ lắng nghe
// bảng "articles". Nghĩa là: tạo/sửa Announcement (hay Hero/Ads/Menu/
// Footer/Site Settings bất kỳ) không hề kích hoạt build lại site — thay
// đổi chỉ lên site khi có bài viết publish/xoá KHÁC cuốn theo, hoặc chờ
// tới lần chạy cron kế tiếp. Đây là lý do announcement "thêm vào nhưng
// không hiển thị, Cloudflare không thấy deploy mới".
//
// Fix gồm 2 phần (xem thêm .github/workflows/main.yml):
//   1. Rút ngắn lịch cron hằng ngày xuống mỗi 15 phút — lưới an toàn tự
//      động cho MỌI bảng CMS V2 hiện tại và sau này, không cần thêm
//      Database Webhook riêng cho từng bảng.
//   2. Function này — nút "Rebuild site now" trong Dashboard, cho editor
//      chủ động kích hoạt build ngay sau khi sửa xong, không cần chờ tới
//      15 phút.
//
// KHÔNG dùng chung request tới Database Webhook (khác on-article-published
// ở chỗ: function này được Dashboard gọi trực tiếp qua supabase.functions.
// invoke(), có sẵn JWT của editor đang đăng nhập trong header Authorization
// — không phải Supabase tự gọi khi có thay đổi dữ liệu).
//
// Xác thực: gọi lại đúng is_active_editor() (đã có từ Rev 5) bằng chính
// JWT của người gọi (KHÔNG dùng service_role) — cùng cơ chế RLS Dashboard
// đang dùng, không tạo đường phân quyền mới nào.
//
// Biến môi trường: SUPABASE_URL/SUPABASE_ANON_KEY do Supabase tự cấp sẵn
// cho mọi Edge Function (không cần `secrets set`). GITHUB_TOKEN/
// GITHUB_OWNER/GITHUB_REPO đã được cấu hình từ Phase 2A cho
// on-article-published — Supabase secrets dùng chung cho cả project, nên
// function này KHÔNG cần cấu hình thêm gì mới, chỉ cần deploy.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO");

// Bug fix: Dashboard gọi function này thẳng từ trình duyệt qua
// supabase.functions.invoke() (khác origin với *.supabase.co) — thiếu CORS
// khiến trình duyệt chặn cả preflight lẫn response thật, supabase-js báo
// "Failed to send a request to the Edge Function" dù function chạy bình
// thường phía server. on-article-published không cần CORS vì nó chỉ được
// Supabase Database Webhook gọi server-to-server, không phải từ browser.
//
// Danh sách header ở đây PHẢI khớp đúng danh sách supabase-js tự gắn vào
// MỌI request (xem node_modules/@supabase/supabase-js/src/cors.ts,
// export SUPABASE_HEADERS) — thiếu "x-client-info" (SDK tự gắn để báo phiên
// bản client, không phải do code Dashboard chủ động thêm) khiến trình duyệt
// từ chối cả request thật dù preflight OPTIONS đã trả 204 đúng origin.
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
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ ok: false, reason: "missing Authorization header" }, 401);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Thiếu SUPABASE_URL/SUPABASE_ANON_KEY (biến môi trường Supabase tự cấp)");
    return json({ ok: false, reason: "missing Supabase configuration" }, 500);
  }

  // Đúng RLS hiện có: is_active_editor() chạy dưới quyền JWT của người gọi
  // (không phải service_role) — khớp email auth.uid() với authors.email
  // đang hoạt động (xem migrate_rev5_dashboard_access.sql).
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_active_editor`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!checkRes.ok) {
    return json({ ok: false, reason: "auth check failed" }, 401);
  }
  const isEditor = await checkRes.json();
  if (isEditor !== true) {
    return json({ ok: false, reason: "not an active editor" }, 403);
  }

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    console.error("Thiếu GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO trong Edge Function secrets");
    return json({ ok: false, reason: "missing GitHub configuration" }, 500);
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "cms-config-changed" }),
    },
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    console.error("GitHub dispatch thất bại:", dispatchRes.status, text);
    return json({ ok: false, reason: "github dispatch failed", status: dispatchRes.status, body: text }, 502);
  }

  return json({ ok: true, triggered: true });
});
