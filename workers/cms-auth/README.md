# tnc-cms-auth

Cloudflare Worker — OAuth token-exchange proxy cho Sveltia CMS. Không có
dependency, không lưu trạng thái (không KV/D1). Xem `src/index.js` để đọc
logic.

## Deploy (thao tác thủ công, một lần — cần credential thật của bạn)

1. Tạo GitHub OAuth App: `github.com/settings/developers` → **New OAuth App**
   - Homepage URL: `https://thenewculture.pages.dev`
   - Authorization callback URL: `https://<tên-worker>.<subdomain>.workers.dev/callback`
     (điền domain thật sau bước 2, rồi quay lại sửa URL này)

2. Deploy worker:
   ```
   cd workers/cms-auth
   npx wrangler login
   npx wrangler deploy
   ```
   Wrangler in ra URL thật của worker, dạng `https://tnc-cms-auth.<subdomain>.workers.dev`.

3. Set secret (KHÔNG đặt trong wrangler.toml hay bất kỳ file nào trong repo):
   ```
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```

4. Điền `GITHUB_CLIENT_ID` (giá trị public, không bí mật) vào `wrangler.toml`
   rồi `npx wrangler deploy` lại lần nữa.

5. Cập nhật `admin/config.yml` → `backend.base_url` bằng đúng URL ở bước 2,
   commit, push.

## Test cục bộ

```
cd workers/cms-auth
echo "GITHUB_CLIENT_ID=..." > .dev.vars
echo "GITHUB_CLIENT_SECRET=..." >> .dev.vars
npx wrangler dev
```
