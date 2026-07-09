// TNC CMS Auth — Cloudflare Worker
//
// OAuth token-exchange proxy cho Sveltia CMS (backend: github), triển khai
// theo đúng giao thức popup/postMessage của Decap/Netlify CMS mà Sveltia CMS
// kế thừa. Không lưu trạng thái phía server (không KV/D1) — chống CSRF bằng
// cookie "state" ngắn hạn, so khớp giữa bước /auth và /callback.
//
// V2.2 — Permission Layer: sau khi đổi được access token, KHÔNG trả token
// thẳng cho CMS như V2.1. Worker tự xác minh lại với chính GitHub API xem
// người vừa đăng nhập có phải cộng tác viên thật của repo hay không, rồi
// mới suy ra vai trò biên tập và trả về cùng token. Không có bảng quyền
// riêng nào cả — GitHub Repository Permission là nguồn sự thật duy nhất,
// tra cứu lại (không cache) ở MỌI lần đăng nhập.
//
// Route bắt buộc, đúng như Sveltia CMS backend.base_url gọi tới:
//   GET /auth      -> chuyển hướng sang GitHub OAuth authorize
//   GET /callback  -> đổi "code" lấy access token, xác minh quyền, trả về
//                      cho cửa sổ popup (kèm role) hoặc HTTP 403 nếu không
//                      có quyền trên repo
//
// Biến môi trường cần cấu hình sau khi deploy (xem README.md cạnh file này):
//   GITHUB_CLIENT_ID      (wrangler.toml [vars], không bí mật)
//   GITHUB_CLIENT_SECRET  (wrangler secret put, KHÔNG commit vào repo)
//   GITHUB_OWNER          (wrangler.toml [vars])
//   GITHUB_REPO           (wrangler.toml [vars])

const ALLOWED_PROVIDER = "github";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const STATE_COOKIE = "tnc_oauth_state";
const DEFAULT_SCOPE = "repo,user";

// Mapping quyền GitHub -> vai trò biên tập, đúng bảng đã duyệt. Đây là
// TOÀN BỘ nơi mapping tồn tại — không lưu trong content, không lưu trong
// CMS collection, không có bảng nào khác. So khớp từ cao xuống thấp vì
// GitHub trả về permissions dạng cờ tích lũy (admin=true kéo theo mọi cờ
// thấp hơn cũng true).
const ROLE_BY_PERMISSION = [
  ["admin", "Editor-in-Chief"],
  ["maintain", "Managing Editor"],
  ["push", "Editor"], // "push" = quyền "Write" trong GitHub UI
  ["triage", "Contributor"],
  ["pull", "Reviewer"], // "pull" = quyền "Read" trong GitHub UI
];

function resolveEditorialRole(permissions) {
  if (!permissions) return null;
  for (const [flag, role] of ROLE_BY_PERMISSION) {
    if (permissions[flag]) return role;
  }
  return null;
}

function githubApiHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": GITHUB_API_VERSION,
    "user-agent": "tnc-cms-auth-worker",
  };
}

// Bước 1 — Ai vừa đăng nhập? Chỉ dùng để tra cứu, không hardcode username
// nào cả; danh tính luôn tự suy ra từ chính token vừa nhận được.
async function fetchAuthenticatedLogin(token) {
  const res = await fetch(`${GITHUB_API_BASE}/user`, { headers: githubApiHeaders(token) });
  if (!res.ok) return null;
  const data = await res.json();
  return data && typeof data.login === "string" ? data.login : null;
}

// Bước 2 — Có phải cộng tác viên THẬT của repo không? Cố tình dùng đúng
// endpoint "check if a user is a repository collaborator" (204/404), KHÔNG
// dùng permissions tổng quát của repo — vì repo này là repo PUBLIC: bất kỳ
// ai có tài khoản GitHub cũng có "pull" (Read) ngầm định trên repo public
// dù chưa từng được thêm làm cộng tác viên. Nếu suy quyền trực tiếp từ
// permissions tổng quát, một người lạ hoàn toàn cũng sẽ lọt qua với vai
// trò Reviewer — sai với yêu cầu "Unknown user -> 403". Endpoint kiểm tra
// tư cách cộng tác viên này độc lập với việc repo public hay private, nên
// mới là nguồn sự thật đúng cho "có quyền truy cập hay không".
async function isRepositoryCollaborator(owner, repo, username, token) {
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`,
    { headers: githubApiHeaders(token) }
  );
  // Chỉ 204 No Content nghĩa là "đúng, là cộng tác viên". Mọi mã khác
  // (404 không phải cộng tác viên, 403 không đủ quyền để hỏi, hay bất kỳ
  // lỗi nào khác) đều coi là KHÔNG — an toàn theo kiểu "mặc định từ chối".
  return res.status === 204;
}

// Bước 3 — Cấp độ quyền cụ thể, chỉ gọi SAU KHI đã xác nhận là cộng tác
// viên thật ở bước 2, để không bao giờ lẫn "pull ngầm định vì repo public"
// vào việc suy vai trò.
async function fetchRepoPermissions(owner, repo, token) {
  const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: githubApiHeaders(token),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.permissions ? data.permissions : null;
}

function randomState() {
  return crypto.randomUUID().replace(/-/g, "");
}

function htmlResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=UTF-8", ...extraHeaders },
  });
}

// Trang popup gửi kết quả về cửa sổ CMS gốc, đúng giao thức Decap/Sveltia CMS:
// popup chờ opener chủ động "bắt tay" bằng message "authorizing:<provider>"
// rồi mới gửi lại "authorization:<provider>:success:<payload>". Không gửi
// token cho tới khi nhận được cái bắt tay này, tránh rò rỉ token ra ngoài.
function renderResultPage({ provider, status, payload }) {
  const messageType = status === "success" ? "success" : "error";
  const data = JSON.stringify(payload);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Đăng nhập CMS</title></head>
<body>
<script>
(function () {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:${provider}:${messageType}:${data}',
      e.origin
    );
    window.removeEventListener('message', receiveMessage, false);
  }
  window.addEventListener('message', receiveMessage, false);
  window.opener.postMessage('authorizing:${provider}', '*');
})();
</script>
<p>Đang hoàn tất đăng nhập, cửa sổ này sẽ tự đóng…</p>
</body></html>`;
}

function parseCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleAuth(request, env) {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") || ALLOWED_PROVIDER;
  if (provider !== ALLOWED_PROVIDER) {
    return new Response("Provider không được hỗ trợ.", { status: 400 });
  }
  if (!env.GITHUB_CLIENT_ID) {
    return new Response(
      "Worker chưa cấu hình GITHUB_CLIENT_ID. Xem workers/cms-auth/README.md.",
      { status: 500 }
    );
  }

  const scope = url.searchParams.get("scope") || DEFAULT_SCOPE;
  const state = randomState();
  // redirect_uri luôn tự suy ra từ origin của chính Worker — không nhận từ
  // query string của client, tránh open-redirect.
  const redirectUri = `${url.origin}/callback`;

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scope);
  authorizeUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      location: authorizeUrl.toString(),
      // HttpOnly + Secure + SameSite=Lax: cookie chỉ dùng để Worker tự đối
      // chiếu state của chính nó ở bước callback, không cần JS phía client
      // đọc được, không cần lưu trữ phía server.
      "set-cookie": `${STATE_COOKIE}=${state}; Max-Age=600; Path=/; HttpOnly; Secure; SameSite=Lax`,
    },
  });
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = parseCookie(request.headers.get("Cookie"), STATE_COOKIE);

  if (!code || !state || !cookieState || state !== cookieState) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy thử đăng nhập lại." },
      }),
      400
    );
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: "Worker chưa cấu hình đầy đủ GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET." },
      }),
      500
    );
  }

  const redirectUri = `${url.origin}/callback`;
  const tokenRes = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "user-agent": "tnc-cms-auth-worker",
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: `GitHub từ chối yêu cầu đổi token (HTTP ${tokenRes.status}).` },
      }),
      502
    );
  }

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: tokenData.error_description || "Không nhận được access token từ GitHub." },
      }),
      400
    );
  }
  const token = tokenData.access_token;

  // Cookie state đã dùng xong ngay khi có token — xóa trước khi làm bất cứ
  // điều gì khác, dùng một lần duy nhất bất kể kết quả xác minh quyền sau
  // đây là cho phép hay từ chối.
  const clearCookieHeader = { "set-cookie": `${STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax` };

  if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: "Worker chưa cấu hình GITHUB_OWNER/GITHUB_REPO." },
      }),
      500,
      clearCookieHeader
    );
  }

  // ---- Permission Layer (V2.2) -------------------------------------
  // Không tin token vừa nhận là đủ để mở CMS — luôn xác minh lại với
  // chính GitHub API xem người này thật sự có quyền gì trên repo, mỗi
  // lần đăng nhập, không cache kết quả ở đâu cả.
  const login = await fetchAuthenticatedLogin(token);
  if (!login) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: "Không xác định được danh tính GitHub từ token vừa nhận." },
      }),
      403,
      clearCookieHeader
    );
  }

  const isCollaborator = await isRepositoryCollaborator(env.GITHUB_OWNER, env.GITHUB_REPO, login, token);
  if (!isCollaborator) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: `Tài khoản GitHub "${login}" không có quyền truy cập repo. Không thể đăng nhập CMS.` },
      }),
      403,
      clearCookieHeader
    );
  }

  const permissions = await fetchRepoPermissions(env.GITHUB_OWNER, env.GITHUB_REPO, token);
  const role = resolveEditorialRole(permissions);
  if (!role) {
    return htmlResponse(
      renderResultPage({
        provider: ALLOWED_PROVIDER,
        status: "error",
        payload: { message: `Tài khoản GitHub "${login}" không có quyền phù hợp trên repo.` },
      }),
      403,
      clearCookieHeader
    );
  }
  // ---------------------------------------------------------------------

  const page = renderResultPage({
    provider: ALLOWED_PROVIDER,
    status: "success",
    payload: { token, provider: ALLOWED_PROVIDER, role, login },
  });
  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      ...clearCookieHeader,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (url.pathname === "/auth") {
      return handleAuth(request, env);
    }
    if (url.pathname === "/callback") {
      return handleCallback(request, env);
    }
    if (url.pathname === "/") {
      return new Response("tnc-cms-auth: OK", { status: 200 });
    }
    return new Response("Not Found", { status: 404 });
  },
};
