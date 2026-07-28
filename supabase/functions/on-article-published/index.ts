// Phase 2A — Automated Publishing Pipeline (Edge Function).
//
// Nhận Database Webhook từ Supabase mỗi khi bảng "articles" có INSERT/UPDATE,
// LỌC đúng điều kiện "status vừa chuyển SANG published" (không phải mọi thay
// đổi, không phải draft/review/scheduled), rồi gọi GitHub API
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
    record?: { id?: string; slug?: string; status?: string };
    old_record?: { status?: string } | null;
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

  // Chỉ trigger đúng lúc status VỪA chuyển SANG "published":
  //   - INSERT thẳng vào published (old_record rỗng, record.status=published)
  //   - UPDATE draft/review/scheduled -> published (old_record.status khác published)
  // KHÔNG trigger khi: status vẫn là draft/review/scheduled, hoặc bài đã
  // published từ trước rồi sửa nội dung khác (old_record.status đã là
  // published — tránh build lại vô ích mỗi lần sửa nhỏ một bài đã đăng;
  // những thay đổi đó sẽ được cron hằng ngày hoặc lần publish bài KHÁC cuốn
  // theo, đúng phạm vi yêu cầu Phase 2A).
  const justPublished = newStatus === "published" && oldStatus !== "published";

  if (!justPublished) {
    return json({
      ok: true,
      triggered: false,
      reason: `status ${oldStatus ?? "(new)"} -> ${newStatus}, không phải lần published đầu tiên`,
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
