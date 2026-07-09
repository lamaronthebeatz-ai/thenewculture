// TNC CMS Auth — Cloudflare Worker
//
// OAuth token-exchange proxy cho Sveltia CMS (backend: github), triển khai
// theo đúng giao thức popup/postMessage của Decap/Netlify CMS mà Sveltia CMS
// kế thừa. Không lưu trạng thái phía server (không KV/D1) — chống CSRF bằng
// cookie "state" ngắn hạn, so khớp giữa bước /auth và /callback.
//
// Route bắt buộc, đúng như Sveltia CMS backend.base_url gọi tới:
//   GET /auth      -> chuyển hướng sang GitHub OAuth authorize
//   GET /callback  -> đổi "code" lấy access token, trả về cho cửa sổ popup
//
// Biến môi trường cần cấu hình sau khi deploy (xem README.md cạnh file này):
//   GITHUB_CLIENT_ID      (wrangler.toml [vars], không bí mật)
//   GITHUB_CLIENT_SECRET  (wrangler secret put, KHÔNG commit vào repo)

const ALLOWED_PROVIDER = "github";
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const STATE_COOKIE = "tnc_oauth_state";
const DEFAULT_SCOPE = "repo,user";

function randomState() {
  return crypto.randomUUID().replace(/-/g, "");
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=UTF-8" },
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

  const page = renderResultPage({
    provider: ALLOWED_PROVIDER,
    status: "success",
    payload: { token: tokenData.access_token, provider: ALLOWED_PROVIDER },
  });
  return new Response(page, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8",
      // Xóa cookie state ngay sau khi dùng — dùng một lần duy nhất.
      "set-cookie": `${STATE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
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
