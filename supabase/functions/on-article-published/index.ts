// Phase 2A — Automated Publishing Pipeline (Edge Function).
//
// Nhận Database Webhook từ Supabase mỗi khi bảng "articles" có INSERT/UPDATE,
// LỌC đúng điều kiện "trạng thái LIVE trên site vừa đổi" — tức status=
// published && deleted_at IS NULL vừa chuyển từ false sang true (publish)
// hoặc từ true sang false (unpublish / xoá mềm) — không phải mọi thay đổi,
// rồi gọi GitHub API
// "Create a repository dispatch event" để kích hoạt workflow build site tĩnh
// hiện có (.github/workflows/main.yml, trigger repository_dispatch, type
// "article-published") — không cần ai commit/push/bấm rebuild thủ công.
//
// LÝ DO CẦN FUNCTION NÀY (không gọi thẳng Database Webhook -> GitHub API):
// Supabase Database Webhooks (cấu hình qua Dashboard, không đụng schema.sql)
// không hỗ trợ điều kiện theo cột (vd "chỉ khi status đổi thành published")
// — chúng chỉ lọc được theo bảng + loại sự kiện (Insert/Update/Delete). Nếu
// trỏ thẳng webhook vào GitHub API, MỌI lần sửa bất kỳ cột nào của MỌI bài
// viết (kể cả đang draft) đều kích hoạt build lại toàn site — vừa sai yêu
// cầu "chỉ trigger khi published", vừa lãng phí phút chạy CI. Function này
// là bước lọc bắt buộc, không phải một lớp API tổng quát cho website (không
// ai đọc dữ liệu qua đây, chỉ dùng nội bộ cho đúng 1 việc: lọc + relay).
//
// Biến môi trường cần cấu hình (Supabase Dashboard -> Edge Functions ->
// on-article-published -> Secrets, hoặc `supabase secrets set`):
//   GITHUB_TOKEN        Personal Access Token (fine-grained, chỉ cấp quyền
//                        "Contents: read/write" + "Actions: read/write" trên
//                        đúng 1 repo này) — dùng để gọi repository_dispatch.
//   GITHUB_OWNER        vd "lamaronthebeatz-ai"
//   GITHUB_REPO         vd "thenewculture"
//   WEBHOOK_SECRET       Chuỗi bí mật tự đặt — phải khớp header
//                        "x-webhook-secret" mà Database Webhook gửi lên
//                        (cấu hình trong phần "HTTP Headers" khi tạo webhook
//                        trên Supabase Dashboard) — chặn người ngoài gọi bừa
//                        endpoint này để spam trigger build.

const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO");
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ ok: false, reason: "method not allowed" }, 405);
  }

  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== WEBHOOK_SECRET) {
      return json({ ok: false, reason: "invalid webhook secret" }, 401);
    }
  }

  let payload: {
    type?: string;
    table?: string;
    record?: { id?: string; slug?: string; status?: string; deleted_at?: string | null };
    old_record?: { status?: string; deleted_at?: string | null } | null;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid JSON body" }, 400);
  }

  if (payload.table !== "articles") {
    return json({ ok: false, reason: `ignored table '${payload.table}'` });
  }

  const newStatus = payload.record?.status;
  const oldStatus = payload.old_record?.status ?? null;
  const newDeletedAt = payload.record?.deleted_at ?? null;
  const oldDeletedAt = payload.old_record?.deleted_at ?? null;

  // build.py chỉ đưa vào site những bài "status=published AND deleted_at IS
  // NULL" (xem load_articles()) — nghĩa là "đang hiển thị công khai" (live)
  // phụ thuộc CẢ HAI cột, không chỉ status. Bug đã gặp: Dashboard "Xoá" một
  // bài published chỉ set deleted_at (soft delete), status vẫn nguyên
  // "published" — nếu chỉ so status thì không thấy gì đổi, rebuild không
  // trigger, bài xoá vẫn còn trên site. Sửa: so sánh đúng trạng thái "live"
  // trước/sau (XOR), bắt được cả 4 trường hợp cần rebuild ngay:
  //   - Mới publish lần đầu (INSERT hoặc draft/review/scheduled -> published)
  //   - Unpublish (published -> draft/review/scheduled)
  //   - Xoá mềm một bài published (deleted_at: null -> có giá trị)
  //   - Khôi phục một bài published đã xoá (deleted_at: có giá trị -> null)
  // KHÔNG trigger khi bài published sửa nội dung khác (title/body/...) mà
  // vẫn giữ nguyên live=true trước và sau — tránh build lại vô ích mỗi lần
  // sửa nhỏ; những thay đổi đó vẫn lên site qua cron hằng ngày hoặc lần
  // publish/xoá bài KHÁC cuốn theo, đúng phạm vi yêu cầu Phase 2A.
  const wasLive = oldStatus === "published" && !oldDeletedAt;
  const isLive = newStatus === "published" && !newDeletedAt;
  const visibilityChanged = wasLive !== isLive;

  if (!visibilityChanged) {
    return json({
      ok: true,
      triggered: false,
      reason: `live status không đổi (was ${wasLive}, is ${isLive}) — status ${oldStatus ?? "(new)"} -> ${newStatus}`,
    });
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
      body: JSON.stringify({
        event_type: "article-published",
        client_payload: {
          article_id: payload.record?.id ?? null,
          slug: payload.record?.slug ?? null,
        },
      }),
    },
  );

  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    console.error("GitHub dispatch thất bại:", dispatchRes.status, text);
    return json({ ok: false, reason: "github dispatch failed", status: dispatchRes.status, body: text }, 502);
  }

  return json({ ok: true, triggered: true, slug: payload.record?.slug ?? null });
});
