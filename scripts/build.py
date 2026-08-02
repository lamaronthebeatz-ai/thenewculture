# -*- coding: utf-8 -*-
"""
TNC Site Builder
Sinh toàn bộ hệ thống trang tĩnh: index, 16 trang series, bài viết chi tiết.
Dữ liệu trung tâm -> đảm bảo nhất quán tuyệt đối giữa các trang.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import magazine  # scripts/magazine.py — Issue Builder cho TNC Magazine (Monthly Digital Magazine), module độc lập

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
os.makedirs(OUT, exist_ok=True)

# -----------------------------------------------------------------
# CẤU HÌNH SITE — dùng cho SEO, Open Graph, sitemap
# Đổi SITE_URL thành domain thật khi có tên miền riêng.
# -----------------------------------------------------------------
SITE_URL = "https://thenewculture.pages.dev"   # không có dấu / ở cuối
SITE_NAME = "The New Culture"
SITE_DESC = "Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam."

def _today_vn():
    """Sinh chuỗi ngày hiện tại theo định dạng Việt: 'Thứ Ba · 02.07.2026'."""
    import datetime
    thu_map = ["Chủ Nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"]
    now = datetime.datetime.now()
    thu = thu_map[int(now.strftime("%w"))]
    return f"{thu} · {now.strftime('%d.%m.%Y')}"

TODAY_VN = _today_vn()


# accent màu xoay vòng cho từng series (khớp class CSS .eyebrow--*)
ACCENTS = ["", "--blue", "--green", "--purple", "--amber"]
def accent_for(idx):
    return ACCENTS[idx % len(ACCENTS)]

# ---------------------------------------------------------------
# SUPABASE — nguồn dữ liệu duy nhất cho articles/series/authors/tags (thay
# thế hoàn toàn content/articles/*.md và content/editors/*.md). Chỉ dùng
# thư viện chuẩn (urllib) — không thêm dependency pip mới vào CI.
# content/profiles/*.md (Artist Profiles) KHÔNG thuộc phạm vi migration này,
# vẫn tiếp tục đọc từ Markdown như trước (xem load_profiles() bên dưới).
# ---------------------------------------------------------------
import json
import urllib.request
import urllib.error

def _normalize_supabase_url(raw):
    """Chuẩn hoá SUPABASE_URL về đúng gốc dự án (vd 'https://xxx.supabase.co'),
    không có path phía sau. Lý do: trang Project API Settings của Supabase
    Dashboard hiển thị sẵn 1 ô "URL" ngay cạnh ví dụ PostgREST dạng
    'https://xxx.supabase.co/rest/v1/' — dễ bị copy nhầm nguyên cụm đó vào
    secret SUPABASE_URL thay vì chỉ phần gốc. Nếu để nguyên, _supabase_get()
    sẽ tự ghép thêm '/rest/v1/<table>' lần nữa, tạo path lặp
    '/rest/v1/rest/v1/<table>' — đây đúng là path mà Supabase gateway không
    nhận diện được, trả về "HTTP 404 Invalid path specified in request URL".
    Cắt bỏ hậu tố '/rest/v1' (có hoặc không có dấu / cuối) nếu phát hiện, để
    {SUPABASE_URL}/rest/v1/{table} luôn đúng bất kể secret được điền thế nào."""
    url = (raw or "").strip().rstrip("/")
    if url.endswith("/rest/v1"):
        url = url[: -len("/rest/v1")]
    return url

SUPABASE_URL = _normalize_supabase_url(os.environ.get("SUPABASE_URL", ""))
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")

def _supabase_get(table, query):
    """GET một PostgREST resource tại {SUPABASE_URL}/rest/v1/{table}. `query`
    là chuỗi query string đã sẵn sàng (vd "select=slug,name&order=sort_order.asc")
    — không dùng urlencode vì cú pháp embed của PostgREST (dấu phẩy/ngoặc đơn
    trong select=...) phải giữ nguyên ký tự, và mọi giá trị lọc ở đây đều là
    ASCII đơn giản (slug, số, 'eq.published'...), không cần escape."""
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise RuntimeError(
            "Thiếu biến môi trường SUPABASE_URL / SUPABASE_ANON_KEY. build.py đọc "
            "articles/series/authors/tags trực tiếp từ Supabase — không còn đọc "
            "content/articles/*.md hay content/editors/*.md nữa (xem README/CI)."
        )
    if not SUPABASE_URL.startswith(("http://", "https://")):
        raise RuntimeError(
            f"SUPABASE_URL không hợp lệ: '{SUPABASE_URL}' — phải là URL đầy đủ "
            "dạng 'https://<project-ref>.supabase.co' (không kèm '/rest/v1')."
        )
    url = f"{SUPABASE_URL}/rest/v1/{table}?{query}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"Supabase trả lỗi khi đọc '{table}': HTTP {e.code} — "
            f"{e.read().decode('utf-8', 'replace')} (URL đã gọi: {url})"
        ) from e

def _format_vn_date(iso_ts):
    """Đảo ngược đúng định dạng 'D Tháng M, YYYY' từ published_at (timestamptz,
    PostgREST trả ISO 8601 có offset UTC) — quy đổi về giờ Việt Nam (UTC+7,
    không có giờ mùa hè nên offset cố định) trước khi lấy ngày/tháng/năm, vì
    import_real_content.sql lưu published_at là đúng nửa đêm giờ VN của ngày
    gốc trong frontmatter."""
    import datetime
    dt = datetime.datetime.fromisoformat(iso_ts.replace("Z", "+00:00"))
    vn = dt.astimezone(datetime.timezone(datetime.timedelta(hours=7)))
    return f"{vn.day} Tháng {vn.month}, {vn.year}"

def _esc(value):
    """Escape để chèn an toàn dữ liệu do editor tự nhập (title/dek/tag...)
    vào nội dung/thuộc tính HTML — bug fix (production audit): trước đây
    những giá trị này được in thẳng không escape ở nhiều nơi, cho phép một
    tài khoản editor (is_active_editor(), không cần service_role) lưu
    title/dek chứa "<script>" và thực thi cho MỌI khách truy cập site tĩnh
    công khai (stored XSS). CHỈ dùng ở điểm render HTML cuối cùng — head()
    và article_schema_json() (JSON-LD) đã tự escape đúng theo ngữ cảnh
    riêng của chúng, không gọi hàm này để tránh escape 2 lần."""
    import html as _html
    return _html.escape(str(value), quote=True)

# ---------------------------------------------------------------
# DỮ LIỆU TRUNG TÂM: 16 SERIES — đọc từ bảng public.series trên Supabase
# (đã seed đúng nguyên văn do Lamar cung cấp, xem database/seed.sql).
# ---------------------------------------------------------------
def load_series():
    rows = _supabase_get(
        "series",
        "select=slug,name,description,accent_color,sort_order"
        "&deleted_at=is.null&order=sort_order.asc"
    )
    series = []
    for i, row in enumerate(rows):
        series.append({
            "slug": row["slug"],
            "num": f"{i + 1:02d}",
            "name": row["name"],
            "desc": (row.get("description") or "").strip(),
            "tag_color": (row.get("accent_color") or "").strip(),
        })
    return series

SERIES = load_series()
SERIES_BY_SLUG = {s["slug"]: s for s in SERIES}

# ---------------------------------------------------------------
# DANH MỤC (Category) — đọc từ bảng public.categories trên Supabase.
# Phase 2A: bảng này đã tồn tại từ đầu (schema + Dashboard CRUD) nhưng
# CHƯA từng có trang công khai trên website — đây là lần đầu category thật
# sự hiển thị. Không phân cấp cha/con ở bản build này (categories.parent_id
# có trong schema nhưng chưa dùng ở tầng hiển thị) — chỉ danh sách phẳng,
# đúng phạm vi yêu cầu "category listing".
# ---------------------------------------------------------------
def load_categories():
    rows = _supabase_get(
        "categories",
        "select=slug,name,description,sort_order"
        "&deleted_at=is.null&order=sort_order.asc"
    )
    return [{
        "slug": row["slug"],
        "name": row["name"],
        "desc": (row.get("description") or "").strip(),
    } for row in rows]

CATEGORIES = load_categories()
CATEGORIES_BY_SLUG = {c["slug"]: c for c in CATEGORIES}

# Sinh mã lưu trữ + accent màu cho mỗi series
def _series_code(name):
    # lấy chữ cái đầu các từ, ví dụ "Inside The Culture" -> ITC, "TNC Origins" -> TNO
    words = name.replace("TNC", "T N C").split()
    letters = "".join(w[0] for w in words if w and w[0].isalnum()).upper()
    return letters[:3].ljust(3, "X")

for i, s in enumerate(SERIES):
    s["code"] = "TNC·" + _series_code(s["name"])
    s["accent"] = accent_for(i)

# ---------------------------------------------------------------
# Helper Markdown dùng chung — vẫn cần cho content/profiles/*.md (Artist
# Profiles, ngoài phạm vi migration Supabase; content/articles/ và
# content/editors/ không còn được đọc nữa, xem load_articles()/load_editors()).
# ---------------------------------------------------------------
import glob, re
import yaml

# Thư mục nội dung (tương đối so với gốc repo)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _parse_frontmatter(raw):
    """Tách frontmatter YAML và phần body markdown."""
    m = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)$', raw, re.DOTALL)
    if not m:
        return {}, raw
    meta = yaml.safe_load(m.group(1)) or {}
    body = m.group(2).strip()
    return meta, body

def _inline_md(text):
    """Xử lý định dạng inline: đậm, nghiêng, link, code. Trả về HTML an toàn."""
    import html as _html
    # escape HTML trước để tránh chèn thẻ độc hại, rồi mới thêm định dạng
    text = _html.escape(text, quote=False)
    # link [text](url)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)',
                  r'<a href="\2" target="_blank" rel="noopener">\1</a>', text)
    # in đậm **text** hoặc __text__
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__([^_]+)__', r'<strong>\1</strong>', text)
    # in nghiêng *text* hoặc _text_
    text = re.sub(r'(?<!\*)\*(?!\*)([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    text = re.sub(r'(?<!_)_(?!_)([^_]+)_(?!_)', r'<em>\1</em>', text)
    # code `text`
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return text

def _youtube_id(url):
    """Trích ID video từ nhiều dạng link YouTube."""
    m = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})', url)
    return m.group(1) if m else None

def _spotify_embed(url):
    """Trích loại nội dung + ID từ link Spotify (track/album/playlist/artist/episode/show),
    kể cả biến thể có tiền tố ngôn ngữ 'intl-xx/'."""
    m = re.search(r'open\.spotify\.com/(?:intl-\w+/)?(track|album|playlist|artist|episode|show)/([A-Za-z0-9]+)', url)
    if not m:
        return None
    return {"kind": m.group(1), "id": m.group(2)}

def _spotify_artist_id(url):
    """Trích ARTIST_ID từ trường 'spotify_artist' của hồ sơ Profile (Spotify
    Artist Embed) — dùng lại _spotify_embed(), chỉ chấp nhận kind == 'artist',
    tự bỏ qua query string (?si=...). Trả None nếu url trống/không hợp lệ."""
    if not url:
        return None
    sp = _spotify_embed(url)
    return sp["id"] if sp and sp["kind"] == "artist" else None

def _soundcloud_url(url):
    """Nhận diện link SoundCloud đứng riêng dòng (track hoặc playlist/'sets')."""
    return url if re.match(r'^https?://(www\.)?soundcloud\.com/\S+$', url) else None

def _md_body_to_blocks(md):
    """Chuyển markdown thành list block (kind, payload) để render.
    Hỗ trợ: h2/h3, blockquote, ảnh, video YouTube, nhúng Spotify/SoundCloud,
    danh sách gạch đầu dòng hoặc có số thứ tự, đoạn văn (có định dạng inline)."""
    blocks = []
    for para in re.split(r'\n\s*\n', md.strip()):
        para = para.strip()
        if not para:
            continue

        # Ảnh đứng riêng: ![alt](url)  — có thể kèm chú thích trên dòng kế
        img_match = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', para)
        if img_match:
            alt, src = img_match.group(1), img_match.group(2)
            blocks.append(("image", {"src": src, "alt": alt, "caption": alt}))
            continue

        # Link đứng riêng dòng -> nhúng trình phát (YouTube / Spotify / SoundCloud)
        if re.match(r'^https?://\S+$', para):
            yid = _youtube_id(para)
            if yid:
                blocks.append(("youtube", yid))
                continue
            sp = _spotify_embed(para)
            if sp:
                blocks.append(("spotify", sp))
                continue
            sc = _soundcloud_url(para)
            if sc:
                blocks.append(("soundcloud", sc))
                continue

        # Tiêu đề phụ
        if para.startswith('## '):
            blocks.append(("h2", _inline_md(para[3:].strip())))
            continue
        if para.startswith('### '):
            blocks.append(("h3", _inline_md(para[4:].strip())))
            continue

        # Trích dẫn
        if para.startswith('> '):
            text = " ".join(line[2:].strip() if line.startswith('> ') else line.strip()
                             for line in para.split('\n'))
            blocks.append(("blockquote", _inline_md(text)))
            continue

        # Danh sách gạch đầu dòng
        if all(line.strip().startswith(('- ', '* ')) for line in para.split('\n') if line.strip()):
            items = [_inline_md(line.strip()[2:].strip()) for line in para.split('\n') if line.strip()]
            blocks.append(("list", items))
            continue

        # Danh sách có số thứ tự: "1. ", "2) "...
        if all(re.match(r'^\d+[.)]\s+', line.strip()) for line in para.split('\n') if line.strip()):
            items = [_inline_md(re.sub(r'^\d+[.)]\s+', '', line.strip())) for line in para.split('\n') if line.strip()]
            blocks.append(("ordered_list", items))
            continue

        # Đoạn văn thường
        text = " ".join(line.strip() for line in para.split('\n'))
        blocks.append(("p", _inline_md(text)))
    return blocks

def _estimate_read_time(md):
    """Ước tính thời gian đọc theo số từ (trung bình ~200 từ/phút cho tiếng Việt)."""
    words = len(re.findall(r'\S+', md))
    minutes = max(1, round(words / 200))
    return f"{minutes} phút đọc"

def _auto_excerpt(md, limit=160):
    """Tự sinh tóm tắt (dek) từ đoạn văn xuôi đầu tiên của bài, chỉ dùng khi
    biên tập viên để trống trường Tóm tắt. Bỏ qua tiêu đề phụ/trích dẫn/
    danh sách/ảnh/video đứng trước, và bỏ ký hiệu định dạng markdown thô để
    ra chữ thuần (dùng được cả trong thẻ <meta description>)."""
    for para in re.split(r'\n\s*\n', md.strip()):
        para = para.strip()
        if not para:
            continue
        if para.startswith(('## ', '### ', '> ', '- ', '* ', '![')):
            continue
        if re.match(r'^https?://\S+$', para) or re.match(r'^\d+[.)]\s+', para):
            continue
        text = " ".join(line.strip() for line in para.split('\n'))
        text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)
        text = re.sub(r'(?<!\*)\*(?!\*)([^*]+)\*(?!\*)', r'\1', text)
        text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
        text = re.sub(r'`([^`]+)`', r'\1', text)
        if len(text) > limit:
            text = text[:limit].rsplit(' ', 1)[0] + "…"
        return text
    return ""

def _jpeg_dimensions(data):
    """Quét marker JPEG để tìm segment SOF chứa width/height thật. Trả về
    None nếu không parse được (file lỗi/định dạng lạ) — không chặn build."""
    import struct
    i = 2
    n = len(data)
    sof_markers = (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
                   0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF)
    while i < n - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in sof_markers:
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return (w, h)
        if marker == 0xD8 or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        try:
            seg_len = struct.unpack(">H", data[i + 2:i + 4])[0]
        except struct.error:
            return None
        i += 2 + seg_len
    return None

def image_dimensions(path):
    """Đọc width/height thật của ảnh (PNG/JPEG/GIF) từ header file — không
    phụ thuộc thư viện ngoài (không có Pillow trong requirements.txt của CI).
    Dùng để tính đúng aspect-ratio bìa TNC Magazine trên Trang chủ, tránh
    Cumulative Layout Shift khi ảnh chưa tải xong. Trả về None nếu không
    đọc được (file không tồn tại/định dạng không nhận ra) — nơi gọi phải
    tự có fallback, không được để lỗi này chặn build."""
    import struct
    try:
        with open(path, "rb") as f:
            data = f.read(65536)
    except OSError:
        return None
    if data[:8] == b'\x89PNG\r\n\x1a\n' and len(data) >= 24:
        w, h = struct.unpack(">II", data[16:24])
        return (w, h)
    if data[:6] in (b'GIF87a', b'GIF89a') and len(data) >= 10:
        w, h = struct.unpack("<HH", data[6:10])
        return (w, h)
    if data[:2] == b'\xff\xd8':
        return _jpeg_dimensions(data)
    return None

def slugify(text):
    """Chuẩn hóa chuỗi thành slug an toàn cho URL: bỏ dấu, chỉ giữ chữ/số/gạch ngang."""
    import unicodedata
    s = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or "bai-viet"

def load_articles():
    """Đọc toàn bộ bài viết ĐÃ PUBLISH từ bảng public.articles trên Supabase
    (thay thế content/articles/*.md), trả về đúng shape list-of-dict mà mọi
    render_* bên dưới đang dùng — không đổi tên khoá, không đổi kiểu dữ liệu.
    'ranking' lấy thẳng từ cột jsonb (đã ở dạng chuẩn hoá sẵn khi import —
    xem database/import_real_content.sql — KHÔNG chuẩn hoá lại lần 2)."""
    # Bug fix SẢN XUẤT (khẩn cấp): Dashboard v2.2 (Rev 15) thêm cột
    # articles.owner_id (cũng tham chiếu authors, cho engine RBAC + Ownership
    # Scope) — kể từ đó, articles có 2 FK tới authors (author_id VÀ owner_id)
    # nên embed ngầm định "authors(name)" bị PostgREST từ chối: "Could not
    # embed because more than one relationship was found for 'articles' and
    # 'authors'". _supabase_get() raise RuntimeError khi Supabase trả lỗi ->
    # TOÀN BỘ build.py (mọi lần cron/rebuild) đã crash ngay từ load_articles()
    # kể từ khi Rev 15 merge, không build được site nào cả. Sửa bằng cách chỉ
    # rõ embed đi qua đúng cột author_id (authors!articles_author_id_fkey), khớp đúng cách
    # dashboard/src đã sửa cho Dashboard React (ArticlesList.jsx/dashboardData.js).
    rows = _supabase_get(
        "articles",
        "select=slug,title,dek,body,cover_image_url,cover_credit,poster_image_url,"
        "sort_order,featured,hero_priority,read_time_minutes,ranking,published_at,"
        "authors!articles_author_id_fkey(name),series(slug),categories(slug),article_tags(tags(name))"
        "&status=eq.published&deleted_at=is.null&order=sort_order.asc,slug.asc"
    )
    articles = []
    for row in rows:
        body_md = row.get("body") or ""
        dek_val = (row.get("dek") or "").strip() or _auto_excerpt(body_md)
        read_time_minutes = row.get("read_time_minutes") or 0
        read_time = f"{read_time_minutes} phút đọc" if read_time_minutes > 0 else _estimate_read_time(body_md)
        tag_names = [
            link["tags"]["name"] for link in (row.get("article_tags") or [])
            if link.get("tags")
        ]
        articles.append({
            "slug": row["slug"],
            "series": row["series"]["slug"] if row.get("series") else "",
            # Phase 2A: category_id nullable — phần lớn bài thật hiện chưa gán
            # category (xem ARCHITECTURE_REVIEW.md), "" nghĩa là chưa phân loại.
            "category": row["categories"]["slug"] if row.get("categories") else "",
            "title": row["title"],
            "dek": dek_val,
            "author": row["authors"]["name"] if row.get("authors") else "TNC Editorial",
            "date": _format_vn_date(row["published_at"]),
            "read_time": read_time,
            "cover": row.get("cover_image_url") or "",
            "cover_credit": (row.get("cover_credit") or "").strip(),
            "poster": row.get("poster_image_url") or "",
            "featured": bool(row.get("featured", False)),
            "hero_priority": bool(row.get("hero_priority", False)),
            "order": row.get("sort_order", 999),
            "tags": tag_names,
            "ranking": row.get("ranking") or [],
            "body": _md_body_to_blocks(body_md),
        })
    # sắp xếp: order tăng dần (order nhỏ = ưu tiên/mới), fallback theo slug —
    # giữ lại dù ORDER BY đã làm đúng phía Supabase, để không phụ thuộc thứ
    # tự trả về của PostgREST.
    articles.sort(key=lambda a: (a["order"], a["slug"]))
    return articles

ARTICLES = load_articles()
ARTICLES_BY_SLUG = {a["slug"]: a for a in ARTICLES}

# -----------------------------------------------------------------
# CẤU HÌNH SITE (logo, GIF hero, Spotify) — đọc từ content/settings/site.yml
# -----------------------------------------------------------------
def load_settings():
    path = os.path.join(REPO_ROOT, "content", "settings", "site.yml")
    defaults = {
        "logo_image": "", "hero_gif": "",
        "hero_gif_song_title": "", "hero_gif_song_artist": "",
        "spotify_embed_url": "",
        "social_facebook": "", "social_instagram": "",
        "social_youtube": "", "social_tiktok": "",
        "header_bg_image": "",
        "ad_left_vertical": "", "ad_left_horizontal": "", "ad_left_link": "",
        "ad_right_vertical": "", "ad_right_horizontal": "", "ad_right_link": "",
        "cloudflare_analytics_token": "",
    }
    if not os.path.isfile(path):
        return defaults
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f) or {}
    for k in defaults:
        defaults[k] = (data.get(k) or "").strip() if isinstance(data.get(k), str) else defaults[k]
    return defaults

SETTINGS = load_settings()

# -----------------------------------------------------------------
# CMS V2 Phase 2 — Module 11 (Site Settings), Module 8 (Menu Builder),
# Module 9 (Footer Builder). Đọc từ Supabase (bảng site_settings/menus/
# menu_items/footer_settings/footer_partners — Rev 7), CÓ FALLBACK về
# đúng hành vi hardcode/site.yml hiện tại nếu bảng chưa tồn tại (trước khi
# chạy migration) hoặc chưa có dữ liệu — không bao giờ làm site trắng hay
# lỗi giữa lúc chuyển đổi. Phạm vi CHỈ đúng những gì Rev 7 phụ trách:
# site_name/site_description/logo/header_bg/favicon/robots/analytics token
# (không đụng hero_gif/spotify/social/ad_* — vẫn ở SETTINGS/site.yml, thuộc
# Phase 3) và 2 menu key "header_primary"/"footer" (3 key còn lại chưa wire
# ở phase này).
# -----------------------------------------------------------------
def load_site_settings():
    # Rev 12 — Dashboard Coverage Completion (Batch A): các field dưới đây
    # (hero_gif*/spotify_embed_url/social_*/ad_left_*/ad_right_*) trước đây
    # CHỈ đọc được từ content/settings/site.yml (Sveltia), không có field
    # Dashboard tương đương nào — nay đã có cột trên site_settings (Rev 12),
    # SETTINGS.get(...) chỉ còn dùng làm fallback khi Supabase chưa migrate.
    fallback = {
        "site_name": SITE_NAME,
        "site_description": SITE_DESC,
        "logo_image": SETTINGS.get("logo_image", ""),
        "header_bg_image": SETTINGS.get("header_bg_image", ""),
        "favicon_image": "/uploads/3727.png",
        "default_og_image": "",
        "cloudflare_analytics_token": SETTINGS.get("cloudflare_analytics_token", ""),
        "robots_directives": "",
        "maintenance_mode": False,
        "maintenance_message": "",
        "hero_gif_image": SETTINGS.get("hero_gif", ""),
        "hero_gif_song_title": SETTINGS.get("hero_gif_song_title", ""),
        "hero_gif_song_artist": SETTINGS.get("hero_gif_song_artist", ""),
        "spotify_embed_url": SETTINGS.get("spotify_embed_url", ""),
        "social_facebook": SETTINGS.get("social_facebook", ""),
        "social_instagram": SETTINGS.get("social_instagram", ""),
        "social_youtube": SETTINGS.get("social_youtube", ""),
        "social_tiktok": SETTINGS.get("social_tiktok", ""),
        "ad_left_vertical": SETTINGS.get("ad_left_vertical", ""),
        "ad_left_horizontal": SETTINGS.get("ad_left_horizontal", ""),
        "ad_left_link": SETTINGS.get("ad_left_link", ""),
        "ad_right_vertical": SETTINGS.get("ad_right_vertical", ""),
        "ad_right_horizontal": SETTINGS.get("ad_right_horizontal", ""),
        "ad_right_link": SETTINGS.get("ad_right_link", ""),
    }
    try:
        rows = _supabase_get(
            "site_settings",
            "select=site_name,site_description,robots_directives,cloudflare_analytics_token,"
            "maintenance_mode,maintenance_message,hero_gif_song_title,hero_gif_song_artist,"
            "spotify_embed_url,social_facebook,social_instagram,social_youtube,social_tiktok,"
            "ad_left_link,ad_right_link,"
            "logo:logo_media_id(url),header_bg:header_bg_media_id(url),favicon:favicon_media_id(url),"
            "default_og:default_og_image_id(url),hero_gif:hero_gif_media_id(url),"
            "ad_left_vertical:ad_left_vertical_media_id(url),ad_left_horizontal:ad_left_horizontal_media_id(url),"
            "ad_right_vertical:ad_right_vertical_media_id(url),ad_right_horizontal:ad_right_horizontal_media_id(url)"
        )
    except RuntimeError:
        return fallback
    if not rows:
        return fallback
    row = rows[0]
    return {
        "site_name": (row.get("site_name") or "").strip() or fallback["site_name"],
        "site_description": (row.get("site_description") or "").strip() or fallback["site_description"],
        "logo_image": (row.get("logo") or {}).get("url") or fallback["logo_image"],
        "header_bg_image": (row.get("header_bg") or {}).get("url") or fallback["header_bg_image"],
        "favicon_image": (row.get("favicon") or {}).get("url") or fallback["favicon_image"],
        "default_og_image": (row.get("default_og") or {}).get("url") or fallback["default_og_image"],
        "cloudflare_analytics_token": (row.get("cloudflare_analytics_token") or "").strip()
                                      or fallback["cloudflare_analytics_token"],
        "robots_directives": (row.get("robots_directives") or "").strip(),
        "maintenance_mode": bool(row.get("maintenance_mode")),
        "maintenance_message": (row.get("maintenance_message") or "").strip(),
        "hero_gif_image": (row.get("hero_gif") or {}).get("url") or fallback["hero_gif_image"],
        "hero_gif_song_title": (row.get("hero_gif_song_title") or "").strip() or fallback["hero_gif_song_title"],
        "hero_gif_song_artist": (row.get("hero_gif_song_artist") or "").strip() or fallback["hero_gif_song_artist"],
        "spotify_embed_url": (row.get("spotify_embed_url") or "").strip() or fallback["spotify_embed_url"],
        "social_facebook": (row.get("social_facebook") or "").strip() or fallback["social_facebook"],
        "social_instagram": (row.get("social_instagram") or "").strip() or fallback["social_instagram"],
        "social_youtube": (row.get("social_youtube") or "").strip() or fallback["social_youtube"],
        "social_tiktok": (row.get("social_tiktok") or "").strip() or fallback["social_tiktok"],
        "ad_left_vertical": (row.get("ad_left_vertical") or {}).get("url") or fallback["ad_left_vertical"],
        "ad_left_horizontal": (row.get("ad_left_horizontal") or {}).get("url") or fallback["ad_left_horizontal"],
        "ad_left_link": (row.get("ad_left_link") or "").strip() or fallback["ad_left_link"],
        "ad_right_vertical": (row.get("ad_right_vertical") or {}).get("url") or fallback["ad_right_vertical"],
        "ad_right_horizontal": (row.get("ad_right_horizontal") or {}).get("url") or fallback["ad_right_horizontal"],
        "ad_right_link": (row.get("ad_right_link") or "").strip() or fallback["ad_right_link"],
    }

SITE_SETTINGS = load_site_settings()

def _build_menu_tree(rows):
    """Chuyển list phẳng menu_items (có parent_id) thành cây tối đa 2 cấp,
    giữ đúng thứ tự sort_order đã ORDER BY sẵn ở query."""
    by_id = {r["id"]: {**r, "children": []} for r in rows}
    roots = []
    for r in rows:
        node = by_id[r["id"]]
        if r["parent_id"] and r["parent_id"] in by_id:
            by_id[r["parent_id"]]["children"].append(node)
        else:
            roots.append(node)
    return roots

def _menu_item_url(item):
    """Suy ra URL thật từ (link_kind, link_value) — tái dùng đúng hàm URL
    hiện có cho từng loại, không tự chế thêm quy tắc đặt tên file mới.
    link_value NULL (dữ liệu bất thường, ngoài ý muốn của Dashboard form vốn
    luôn gửi chuỗi) trả về "#" thay vì None — tránh sinh href="None" âm thầm
    trong HTML thật."""
    kind, value = item["link_kind"], item["link_value"]
    if not value:
        return "#"
    if kind == "series":
        return series_url(value)
    if kind == "category":
        return category_url(value)
    if kind == "article":
        return article_url(value)
    # 'external' hoặc 'custom_path' — value đã là URL/đường dẫn đầy đủ
    return value

def load_menu(key):
    """Đọc 1 menu (theo `key`) từ bảng menus/menu_items. Trả về cây menu
    (list, có thể lồng `children`) nếu có dữ liệu, hoặc None nếu bảng chưa
    tồn tại/rỗng cho đúng key này — nơi gọi tự dùng nội dung hardcode hiện
    tại khi nhận None, đúng yêu cầu "chưa có menu thì website vẫn hoạt
    động như hiện tại"."""
    try:
        menus_rows = _supabase_get("menus", f"select=id&key=eq.{key}")
        if not menus_rows:
            return None
        menu_id = menus_rows[0]["id"]
        rows = _supabase_get(
            "menu_items",
            "select=id,parent_id,label,link_kind,link_value,sort_order"
            f"&menu_id=eq.{menu_id}&is_active=eq.true&deleted_at=is.null&order=sort_order.asc"
        )
    except RuntimeError:
        return None
    if not rows:
        return None
    return _build_menu_tree(rows)

# Bug fix (production audit): masthead()/footer() gọi lại load_menu() ở MỌI
# trang được build (article, category, tag, series, trang phụ...) dù kết quả
# không đổi trong suốt 1 lần build — mỗi lần tốn 2 lượt HTTP round-trip tới
# Supabase (bảng menus + menu_items) không cần thiết. Tính 1 lần duy nhất ở
# đây, đúng khuôn mẫu SITE_SETTINGS/ADS_BY_PLACEMENT/CAMPAIGNS đã áp dụng.
HEADER_PRIMARY_MENU = load_menu("header_primary")
FOOTER_MENU = load_menu("footer")
# Rev 12 — Dashboard Coverage Completion (Batch B): 2 trong 5 key menu đã
# seed sẵn từ Rev 7 ("header_mega", "quick_link") có đủ UI quản lý trong
# Menu Builder từ lâu nhưng build.py chưa từng đọc — sửa trong Dashboard
# không có tác dụng gì trên site. Nay wire vào masthead(), giữ đúng fallback
# hardcode hiện tại khi rỗng/chưa có dữ liệu (không đổi output khi chưa ai
# nhập liệu qua Dashboard).
HEADER_MEGA_MENU = load_menu("header_mega")
QUICK_LINK_MENU = load_menu("quick_link")

# -----------------------------------------------------------------
# EDITOR IDENTITY SYSTEM (PR2) — Role / Badge / Honor registries.
# Thuần dữ liệu (id -> nhãn tiếng Việt/metadata), không phụ thuộc
# content/editors/ — mọi hồ sơ biên tập viên chỉ lưu ID tham chiếu vào các
# registry này (role_id: 1 giá trị; badge_ids/honor_ids: danh sách), không
# bao giờ chép lại nhãn/màu/mô tả vào CMS ("Editors store only IDs. Never
# duplicate metadata."). ID không hợp lệ hoặc bị xoá khỏi registry sau này
# được bỏ qua an toàn ở nơi đọc (load_editors), không chặn build.
# -----------------------------------------------------------------

# "SUPPORTED roles" — mỗi biên tập viên có ĐÚNG 1 vai trò chính.
EDITOR_ROLES = {
    "tong-bien-tap": "Tổng Biên tập",
    "pho-tong-bien-tap": "Phó Tổng Biên tập",
    "thu-ky-toa-soan": "Thư ký Tòa soạn",
    "truong-ban-bien-tap": "Trưởng ban Biên tập",
    "bien-tap-vien-cao-cap": "Biên tập viên Cao cấp",
    "bien-tap-vien": "Biên tập viên",
    "thuc-tap-bien-tap": "Thực tập Biên tập",
    "bien-tap-vien-am-nhac": "Biên tập viên Âm nhạc",
    "bien-tap-vien-van-hoa": "Biên tập viên Văn hóa",
    "bien-tap-vien-tin-tuc": "Biên tập viên Tin tức",
    "bien-tap-vien-danh-gia": "Biên tập viên Đánh giá",
    "bien-tap-vien-phong-van": "Biên tập viên Phỏng vấn",
    "bien-tap-vien-nghien-cuu": "Biên tập viên Nghiên cứu",
    "giam-doc-sang-tao": "Giám đốc Sáng tạo",
    "bien-tap-vien-hinh-anh": "Biên tập viên Hình ảnh",
    "cong-tac-vien": "Cộng tác viên",
}

# Nhóm huy hiệu (taxonomy) — mỗi badge thuộc đúng 1 nhóm.
EDITOR_BADGE_CATEGORIES = {
    "sang-lap": "Sáng lập",
    "chuyen-mon": "Chuyên môn",
    "bao-chi": "Báo chí",
    "noi-dung": "Nội dung",
    "cong-dong": "Cộng đồng",
}

# Màu + hoạt ảnh mặc định theo độ hiếm — mọi badge/honor kế thừa màu này trừ
# khi tự khai báo "color" riêng ("Allow badge-specific overrides").
EDITOR_RARITIES = {
    "tieu-chuan": {"label": "Tiêu chuẩn", "color": "#8A9BA8"},
    "noi-bat": {"label": "Nổi bật", "color": "#3B82F6"},
    "xuat-sac": {"label": "Xuất sắc", "color": "#D4AF37"},
    "huyen-thoai": {"label": "Huyền thoại", "color": "#FFD700"},
}

# id -> {label, category, rarity, desc, color(tùy chọn, ghi đè màu rarity)}
EDITOR_BADGES = {
    "nguoi-dong-sang-lap": {
        "label": "Người Đồng sáng lập", "category": "sang-lap", "rarity": "huyen-thoai",
        "desc": "Một trong những người đặt nền móng đầu tiên cho The New Culture.",
    },
    "kien-truc-nen-tang": {
        "label": "Kiến trúc Nền tảng", "category": "sang-lap", "rarity": "xuat-sac",
        "desc": "Xây dựng cấu trúc biên tập/tuyến nội dung cốt lõi của toà soạn.",
    },
    "chuyen-gia-hip-hop": {
        "label": "Chuyên gia Hip-Hop", "category": "chuyen-mon", "rarity": "xuat-sac",
        "desc": "Kiến thức chuyên sâu, được công nhận về văn hóa hip-hop underground.",
    },
    "chuyen-gia-van-hoa": {
        "label": "Chuyên gia Văn hóa", "category": "chuyen-mon", "rarity": "noi-bat",
        "desc": "Am hiểu sâu rộng về văn hóa đại chúng và các dòng chảy xã hội liên quan.",
    },
    "dao-duc-bao-chi": {
        "label": "Đạo đức Báo chí", "category": "bao-chi", "rarity": "noi-bat",
        "desc": "Tuân thủ nghiêm ngặt chuẩn mực đạo đức và kiểm chứng thông tin.",
    },
    "dieu-tra-chuyen-sau": {
        "label": "Điều tra Chuyên sâu", "category": "bao-chi", "rarity": "xuat-sac",
        "desc": "Thực hiện các bài điều tra, phân tích chuyên sâu có chiều sâu tư liệu.",
    },
    "cay-but-noi-bat": {
        "label": "Cây bút Nổi bật", "category": "noi-dung", "rarity": "noi-bat",
        "desc": "Sản xuất nội dung chất lượng cao, đều đặn và được độc giả đón nhận.",
    },
    "san-xuat-ben-vung": {
        "label": "Sản xuất Bền vững", "category": "noi-dung", "rarity": "tieu-chuan",
        "desc": "Duy trì nhịp độ xuất bản ổn định trong thời gian dài.",
    },
    "nguoi-ket-noi": {
        "label": "Người Kết nối", "category": "cong-dong", "rarity": "tieu-chuan",
        "desc": "Kết nối toà soạn với cộng đồng độc giả và nghệ sĩ.",
    },
    "dai-su-cong-dong": {
        "label": "Đại sứ Cộng đồng", "category": "cong-dong", "rarity": "noi-bat",
        "desc": "Đại diện tích cực cho tiếng nói và giá trị của cộng đồng underground.",
    },
}

# id -> {label, rarity, desc, color(tùy chọn)} — Honor KHÔNG có category (đơn
# giản hơn Badge theo đúng yêu cầu: "a separate Honor Registry").
EDITOR_HONORS = {
    "nguoi-sang-lap": {
        "label": "Người Sáng lập", "rarity": "huyen-thoai",
        "desc": "Vinh danh người đã khai sinh The New Culture, đặt nền móng cho toàn bộ hệ thống biên tập.",
    },
    "10-nam-cong-hien": {
        "label": "10 Năm Cống hiến", "rarity": "xuat-sac",
        "desc": "Vinh danh một thập kỷ gắn bó và đóng góp không ngừng nghỉ cho toà soạn.",
    },
}

# -----------------------------------------------------------------
# HỒ SƠ BIÊN TẬP VIÊN — đọc từ bảng public.authors trên Supabase
# Chỉ tác giả có role_id THẬT (1 trong 16 id của EDITOR_ROLES) mới được sinh
# trang tác giả và hiện link trong bài viết. Tên trong "authors.name" phải
# khớp chính xác (kể cả hoa/thường và khoảng trắng) với tên tác giả embed
# trong "articles.authors.name" mà load_articles() trả về ở a["author"].
# -----------------------------------------------------------------
def load_editors():
    """Đọc hồ sơ biên tập viên từ bảng public.authors trên Supabase (thay thế
    content/editors/*.md), trả về đúng shape {name: {...}} như trước.

    QUAN TRỌNG — chỉ đưa vào dict những author có role_id THẬT (1 trong 16 id
    tiếng Việt của EDITOR_ROLES): đây là tín hiệu duy nhất còn lại (sau khi
    gộp mọi tác giả vào 1 bảng authors) để phân biệt "biên tập viên có hồ sơ
    thật" (trước đây = có file trong content/editors/) với "tác giả bút danh
    chuyên mục" (vd 'TNC Editorial', 'TNC SELECTAS' — tạo trong
    import_real_content.sql chỉ để thoả FK articles.author_id, role chung
    'editor'). Nếu không lọc, các bút danh này sẽ vô tình có trang tác giả
    riêng — đúng điều ĐÃ được ghi chú tránh ở nơi sinh trang tác giả bên dưới
    ("tránh trang trống cho các tên chuyên mục như 'TNC Editorial'")."""
    rows = _supabase_get(
        "authors",
        "select=id,slug,name,avatar_url,bio,role,honor,badges&deleted_at=is.null"
    )
    editors = {}
    author_id_to_name = {}
    for row in rows:
        name = (row.get("name") or "").strip()
        if not name:
            continue

        role_id = (row.get("role") or "").strip()
        if role_id not in EDITOR_ROLES:
            continue  # không phải hồ sơ biên tập thật — bỏ qua, không tạo trang

        raw_badge_ids = row.get("badges") or []
        if not isinstance(raw_badge_ids, list):
            raw_badge_ids = []
        badge_ids = [b for b in raw_badge_ids if b in EDITOR_BADGES]

        honor = (row.get("honor") or "").strip()
        honor_ids = [honor] if honor in EDITOR_HONORS else []

        editors[name] = {
            "name": name,
            "avatar": (row.get("avatar_url") or "").strip(),
            "bio": (row.get("bio") or "").strip(),
            "slug": row.get("slug") or slugify(name),
            "role_id": role_id,
            "badge_ids": badge_ids,
            "honor_ids": honor_ids,
            "medals": [],
        }
        if row.get("id"):
            author_id_to_name[row["id"]] = name

    # Huân chương (Rev 16) — đọc author_medals (chỉ is_visible=true) join
    # medals (master — RLS "Public read active medals" tự lọc is_active=true/
    # chưa xoá; hàng không khớp trả về medal=null, bỏ qua an toàn bên dưới,
    # không raise). Bọc try/except như mọi loader không bắt buộc khác (site
    # phải build được kể cả khi bảng medals rỗng/tạm lỗi) — KHÔNG nằm trong
    # nhóm loader bắt buộc (series/categories/articles/authors).
    try:
        medal_rows = _supabase_get(
            "author_medals",
            "select=author_id,sort_order,"
            "medal:medals(id,name,short_description,detailed_description,alt_text,media:media_id(url))"
            "&is_visible=eq.true&order=sort_order.asc"
        )
    except RuntimeError as e:
        print(f"  ! Không tải được author_medals (Rev 16) — bỏ qua huân chương: {e}")
        medal_rows = []
    for row in medal_rows:
        name = author_id_to_name.get(row.get("author_id"))
        if not name:
            continue
        medal = row.get("medal")
        if not medal:
            continue  # medal đã bị ẩn/xoá (không qua nổi RLS public) — bỏ qua
        image_url = (medal.get("media") or {}).get("url", "").strip()
        if not image_url:
            continue  # chưa gắn ảnh -> không đủ dữ liệu hiển thị an toàn
        editors[name]["medals"].append({
            "id": medal.get("id"),
            "name": (medal.get("name") or "").strip(),
            "short_description": (medal.get("short_description") or "").strip(),
            "detailed_description": (medal.get("detailed_description") or "").strip(),
            "alt_text": (medal.get("alt_text") or "").strip(),
            "image_url": image_url,
        })
    return editors

# ----- Components: RoleChip / BadgeChip / HonorChip -----
# Mọi hàm nhận ID, tự tra registry, trả "" nếu ID không tồn tại (an toàn khi
# thiếu/ID bị xoá về sau — không bao giờ raise).

def render_role_chip(role_id):
    """RoleChip — vai trò chính của biên tập viên."""
    label = EDITOR_ROLES.get(role_id)
    if not label:
        return ""
    return f'<span class="role-chip">{label}</span>'

def _render_identity_chip(entry_id, registry, css_class):
    """Dùng chung cho BadgeChip/HonorChip: áp màu/hoạt ảnh theo rarity (có thể
    override bằng "color" riêng của từng mục), kèm BadgeTooltip (hover, CSS
    thuần) + BadgePopover (click, JS toggler .is-open — xem footer())."""
    entry = registry.get(entry_id)
    if not entry:
        return ""
    rarity_id = entry.get("rarity", "tieu-chuan")
    rarity = EDITOR_RARITIES.get(rarity_id, EDITOR_RARITIES["tieu-chuan"])
    color = entry.get("color") or rarity["color"]
    category_label = EDITOR_BADGE_CATEGORIES.get(entry.get("category", ""), "")
    desc = entry.get("desc", "")
    category_html = f'<span class="badge-chip__popover-category">{category_label}</span>' if category_label else ""
    return (
        f'<span class="{css_class} {css_class}--{rarity_id}" style="--chip-color:{color};" tabindex="0">'
        f'{entry["label"]}'
        f'<span class="badge-chip__tooltip">{desc}</span>'
        f'<span class="badge-chip__popover">{category_html}'
        f'<span class="badge-chip__popover-rarity">{rarity["label"]}</span>'
        f'<span class="badge-chip__popover-desc">{desc}</span></span>'
        f'</span>'
    )

def render_badge_chip(badge_id):
    """BadgeChip — 1 huy hiệu biên tập viên."""
    return _render_identity_chip(badge_id, EDITOR_BADGES, "badge-chip")

def render_honor_chip(honor_id):
    """HonorChip — 1 vinh danh. Luôn được render TRƯỚC badges ở nơi gọi
    (render_author_page): section .editor-honors đứng trước .editor-badges."""
    return _render_identity_chip(honor_id, EDITOR_HONORS, "honor-chip")

def render_badge_overflow_chip(hidden_badge_ids):
    """+N (PR4.1, Author Card): chip gộp các badge còn lại khi vượt quá số
    lượng hiển thị tối đa. Tái dùng NGUYÊN class .badge-chip/.badge-chip__tooltip/
    .badge-chip__popover (CSS rarity "tieu-chuan" + JS click-toggle .is-open đã
    có sẵn từ PR2, xem footer()) — không tạo component/CSS/JS mới, chỉ khác nội
    dung: liệt kê tên các badge còn lại thay vì mô tả 1 badge."""
    names = [EDITOR_BADGES[b]["label"] for b in hidden_badge_ids if b in EDITOR_BADGES]
    if not names:
        return ""
    desc = ", ".join(names)
    return (
        f'<span class="badge-chip badge-chip--tieu-chuan" tabindex="0">'
        f'+{len(names)}'
        f'<span class="badge-chip__tooltip">{desc}</span>'
        f'<span class="badge-chip__popover">'
        f'<span class="badge-chip__popover-rarity">Huy hiệu khác</span>'
        f'<span class="badge-chip__popover-desc">{desc}</span></span>'
        f'</span>'
    )

def render_medal_chip(medal):
    """MedalChip (Rev 16, Author Medals) — 1 huân chương: icon ảnh nhỏ (PNG/
    WebP/GIF; GIF giữ nguyên hoạt ảnh vì chỉ in thẳng <img src>, không
    convert/resize) + tooltip (hover, CSS thuần) + popover (tap/click). Tái
    dùng NGUYÊN VẸN cơ chế click-toggle .is-open đã có cho BadgeChip/HonorChip
    (xem querySelector '.badge-chip,.honor-chip,.medal-chip' trong footer())
    — chỉ khác: nội dung/ảnh đọc từ dict đã build sẵn ở load_editors() (bảng
    medals/author_medals), không tra registry tĩnh như Badge/Honor."""
    if not medal.get("image_url"):
        return ""
    name = medal.get("name", "")
    alt = medal.get("alt_text") or name
    tooltip = medal.get("short_description") or name
    detail = medal.get("detailed_description") or medal.get("short_description") or ""
    popover_desc_html = f'<span class="medal-chip__popover-desc">{_esc(detail)}</span>' if detail else ""
    return (
        f'<span class="medal-chip" tabindex="0">'
        f'<img class="medal-chip__icon" src="{medal["image_url"]}" alt="{_esc(alt)}" loading="lazy">'
        f'<span class="medal-chip__tooltip">{_esc(tooltip)}</span>'
        f'<span class="medal-chip__popover">'
        f'<span class="medal-chip__popover-name">{_esc(name)}</span>'
        f'{popover_desc_html}'
        f'</span>'
        f'</span>'
    )

def render_medals_html(medals):
    """Danh sách MedalChip liên tiếp cho 1 author — dùng chung cho author-box
    (cuối bài) và trang hồ sơ. Trả '' nếu rỗng (render only if data exists)."""
    return "".join(render_medal_chip(m) for m in medals)

EDITORS = load_editors()

# Editor Discovery System (PR4): chứa kết quả Editorial Intelligence (PR3) đã
# tính sẵn cho MỌI biên tập viên, được main() điền vào (populate) một lần,
# trước khi render bất kỳ trang tác giả nào — để các component dùng chung
# (EditorCard, Related Editors, Prev/Next Editor) có thể tra cứu dữ liệu của
# BẤT KỲ editor nào mà không cần tính lại (không đổi compute_editor_intelligence
# / compute_related_editors của PR3 — chỉ thêm nơi lưu trữ kết quả dùng chung).
EDITOR_INTELLIGENCE = {}
# Thứ tự xác định (không random) toàn bộ editor có trang, dùng cho Previous/Next
# Editor — sắp theo tên (a-z), main() điền vào trước khi render trang tác giả.
EDITOR_ORDER = []

# -----------------------------------------------------------------
# TIẾP THỊ — Chiến dịch quảng bá, đọc từ content/campaigns/*.md
# Đúng NGÀY BUILD (không phải ngày người dùng xem trang) quyết định chiến
# dịch nào đang trong khoảng chạy — đây là chủ đích của tính năng (banner
# tự bật/tắt theo lịch), khác với publish date của bài viết vốn phải bất
# biến tuyệt đối. Không có chiến dịch nào thỏa điều kiện -> không hardcode
# banner mặc định, không render gì cả.
# -----------------------------------------------------------------
def _parse_iso_datetime(raw):
    """Đọc timestamptz PostgREST trả về (ISO 8601 có offset, có thể tận
    cùng bằng 'Z') — dùng để lọc hero_slots/ads theo start_at/end_at.
    Trả về None nếu trống/không đọc được (coi như không giới hạn phía đó,
    cùng nguyên tắc với _parse_campaign_date bên dưới)."""
    if not raw:
        return None
    import datetime
    try:
        return datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None

def _parse_campaign_date(raw):
    """Đọc chuỗi ngày định dạng YYYY-MM-DD (Sveltia CMS datetime widget,
    type: date). Chấp nhận cả dạng ISO đầy đủ (có giờ) để an toàn, chỉ lấy
    10 ký tự đầu. Trả về None nếu trống hoặc không đọc được (không chặn
    build, chỉ coi như không giới hạn phía đó)."""
    if not raw:
        return None
    import datetime
    try:
        return datetime.date.fromisoformat(str(raw).strip()[:10])
    except ValueError:
        return None

def _load_campaigns_from_file():
    """Đọc content/campaigns/*.md (Sveltia CMS, hành vi gốc trước Rev 8) —
    dùng làm fallback khi bảng promotions (Supabase) rỗng/chưa migrate."""
    campaigns_dir = os.path.join(REPO_ROOT, "content", "campaigns")
    campaigns = []
    if not os.path.isdir(campaigns_dir):
        return campaigns
    for path in sorted(glob.glob(os.path.join(campaigns_dir, "*.md"))):
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, _ = _parse_frontmatter(raw)
        title = (meta.get("title") or "").strip()
        if not title:
            print(f"  ! Bỏ qua chiến dịch {os.path.basename(path)} (thiếu tiêu đề)")
            continue
        campaigns.append({
            "slug": slugify(os.path.splitext(os.path.basename(path))[0]),
            "title": title,
            "active": bool(meta.get("active", False)),
            "placement": (meta.get("placement") or "sticky_bottom").strip(),
            "type": (meta.get("type") or "image").strip(),
            "desktop_image": (meta.get("desktop_image") or "").strip(),
            "mobile_image": (meta.get("mobile_image") or "").strip(),
            "video": (meta.get("video") or "").strip(),
            "destination_url": (meta.get("destination_url") or "").strip(),
            "open_in_new_tab": bool(meta.get("open_in_new_tab", True)),
            "start_date": _parse_campaign_date(meta.get("start_date")),
            "end_date": _parse_campaign_date(meta.get("end_date")),
            "dismissible": bool(meta.get("dismissible", True)),
            "dismiss_days": int(meta.get("dismiss_days") or 0),
            "priority": int(meta.get("priority") or 0),
        })
    return campaigns

def load_campaigns():
    """Module 4 — Promotion Manager (Rev 8). Đọc bảng promotions (Supabase)
    nếu đã có dữ liệu; rỗng/chưa migrate thì fallback đọc
    content/campaigns/*.md y hệt hành vi gốc. pick_active_campaign() bên
    dưới nhận đúng shape dict như cũ ở cả 2 nguồn, không cần sửa gì."""
    try:
        rows = _supabase_get(
            "promotions",
            "select=slug,title,is_active,placement,video_url,destination_url,open_in_new_tab,"
            "dismissible,dismiss_days,priority,start_at,end_at,"
            "desktop:media_id(url),mobile:mobile_media_id(url)"
            "&deleted_at=is.null"
        )
    except RuntimeError:
        rows = None
    if not rows:
        return _load_campaigns_from_file()
    campaigns = []
    for row in rows:
        desktop_url = (row.get("desktop") or {}).get("url", "")
        mobile_url = (row.get("mobile") or {}).get("url", "")
        video_url = row.get("video_url") or ""
        campaigns.append({
            "slug": row["slug"],
            "title": row.get("title") or "",
            "active": bool(row.get("is_active")),
            "placement": row.get("placement") or "sticky_bottom",
            "type": "video" if video_url else "image",
            "desktop_image": desktop_url,
            "mobile_image": mobile_url,
            "video": video_url,
            "destination_url": row.get("destination_url") or "",
            "open_in_new_tab": bool(row.get("open_in_new_tab", True)),
            "start_date": _parse_campaign_date(row.get("start_at")),
            "end_date": _parse_campaign_date(row.get("end_at")),
            "dismissible": bool(row.get("dismissible", True)),
            "dismiss_days": int(row.get("dismiss_days") or 0),
            "priority": int(row.get("priority") or 0),
        })
    return campaigns

def pick_active_campaign(campaigns, placement, today=None):
    """Chọn đúng 1 chiến dịch để render cho một vị trí (placement):
    active=True, và today nằm trong [start_date, end_date] (thiếu 1 trong
    2 mốc = không giới hạn phía đó). Nhiều chiến dịch cùng thỏa -> lấy
    priority LỚN NHẤT; đồng priority -> lấy slug nhỏ nhất (a-z) để kết quả
    ổn định, không đổi ngẫu nhiên giữa các lần build."""
    import datetime
    today = today or datetime.date.today()
    eligible = [
        c for c in campaigns
        if c["active"]
        and c["placement"] == placement
        and (c["start_date"] is None or c["start_date"] <= today)
        and (c["end_date"] is None or c["end_date"] >= today)
    ]
    if not eligible:
        return None
    eligible.sort(key=lambda c: (-c["priority"], c["slug"]))
    return eligible[0]

CAMPAIGNS = load_campaigns()
ACTIVE_STICKY_BANNER = pick_active_campaign(CAMPAIGNS, "sticky_bottom")

# -----------------------------------------------------------------
# Module 2 — Hero Manager (Rev 8). Thay dần khối GIF hero đọc từ SETTINGS
# (content/settings/site.yml: hero_gif/hero_gif_song_title/artist). Hero
# bài viết (articles.featured/hero_priority, render_hero_slideshow()) đã
# đúng CMS từ trước, KHÔNG đụng tới ở đây.
# -----------------------------------------------------------------
def load_hero_slots():
    """Đọc bảng hero_slots — trả về list slot đang active (đã lọc is_active
    + trong khoảng start_at/end_at), sắp priority giảm dần. Rỗng/lỗi kết
    nối -> [] để nơi gọi tự fallback SETTINGS (hero_gif cũ)."""
    try:
        rows = _supabase_get(
            "hero_slots",
            "select=id,kind,title,subtitle,priority,start_at,end_at,"
            "desktop:desktop_media_id(url)"
            "&is_active=eq.true&deleted_at=is.null&order=priority.desc"
        )
    except RuntimeError:
        return []
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    eligible = []
    for r in rows:
        start = _parse_iso_datetime(r.get("start_at"))
        end = _parse_iso_datetime(r.get("end_at"))
        if start and start > now:
            continue
        if end and end < now:
            continue
        if not (r.get("desktop") or {}).get("url"):
            continue
        eligible.append(r)
    return eligible

# -----------------------------------------------------------------
# Module 3 — Advertisement Manager (Rev 8). Thay 2 slot quảng cáo tĩnh
# (ad_left_*/ad_right_* trong SETTINGS) bằng bảng ads, nhóm theo
# placement_id. render_ad_block()/render_ad_block_horizontal_only() bên
# dưới fallback nguyên xi SETTINGS nếu placement chưa có quảng cáo active.
# -----------------------------------------------------------------
def load_ads():
    try:
        rows = _supabase_get(
            "ads",
            "select=id,placement_id,creative_kind,link_url,link_target,priority,start_at,end_at,"
            "media:media_id(url)"
            "&is_active=eq.true&deleted_at=is.null&order=priority.desc"
        )
    except RuntimeError:
        return {}
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    by_placement = {}
    for r in rows:
        start = _parse_iso_datetime(r.get("start_at"))
        end = _parse_iso_datetime(r.get("end_at"))
        if start and start > now:
            continue
        if end and end < now:
            continue
        if not (r.get("media") or {}).get("url"):
            continue
        by_placement.setdefault(r["placement_id"], []).append(r)
    return by_placement

ADS_BY_PLACEMENT = load_ads()

# -----------------------------------------------------------------
# Module 5 — Announcement Manager (Rev 9). Năng lực hoàn toàn mới, không
# tồn tại trước đó (đã xác nhận ở audit) — không có gì để fallback ngoài
# "không render gì" khi bảng chưa tồn tại/rỗng/lỗi kết nối, đúng yêu cầu
# fail-safe.
# -----------------------------------------------------------------
def load_announcements():
    """Đọc bảng announcements — trả về announcement được ưu tiên cao nhất
    đang active + trong khoảng start_at/end_at, hoặc None nếu chưa migrate/
    rỗng/lỗi kết nối/không có announcement nào hợp lệ."""
    try:
        rows = _supabase_get(
            "announcements",
            "select=id,kind,message,link_url,countdown_at,style,priority,start_at,end_at"
            "&is_active=eq.true&deleted_at=is.null&order=priority.desc"
        )
    except RuntimeError:
        return None
    if not rows:
        return None
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    eligible = [
        r for r in rows
        if not (_parse_iso_datetime(r.get("start_at")) and _parse_iso_datetime(r.get("start_at")) > now)
        and not (_parse_iso_datetime(r.get("end_at")) and _parse_iso_datetime(r.get("end_at")) < now)
    ]
    return eligible[0] if eligible else None

# Bug fix (production audit): render_announcement_bar() được masthead() gọi
# lại ở MỌI trang, nên load_announcements() (1 lượt HTTP tới Supabase) bị
# lặp lại vô ích cho cùng 1 kết quả suốt 1 lần build — tính 1 lần duy nhất,
# đúng khuôn mẫu SITE_SETTINGS/ADS_BY_PLACEMENT/CAMPAIGNS.
ANNOUNCEMENT = load_announcements()

def render_announcement_bar():
    """Thanh thông báo phía trên masthead. Chỉ 1 kiểu hiển thị tĩnh duy
    nhất (không phân biệt hành vi theo kind — không ticker cuộn, không
    đếm ngược động, đúng phạm vi đã duyệt), màu sắc đổi theo `style`.
    Không có announcement hợp lệ -> trả về chuỗi rỗng, không render gì."""
    a = ANNOUNCEMENT
    if not a:
        return ""
    message = a.get("message") or ""
    if not message:
        return ""
    link = a.get("link_url") or ""
    style = a.get("style") or "info"
    content = f'<a href="{link}">{message}</a>' if link else f'<span>{message}</span>'
    return f'<div class="announcement-bar announcement-bar--{style}" data-kind="{a.get("kind","bar_top")}">{content}</div>\n'

# -----------------------------------------------------------------
# HỒ SƠ NHÂN VẬT/ĐƠN VỊ (TNC Profiles — dạng "thẻ tướng")
# Đọc từ content/profiles/*.md. Đây là loại dữ liệu tách biệt hoàn toàn
# với "Bài viết" — chỉ dùng riêng cho series TNC Profiles.
# -----------------------------------------------------------------
PROFILE_TYPES = {
    "nghe-si":       {"label": "Nghệ sĩ",           "accent": ""},
    "producer":      {"label": "Producer",          "accent": "--gold"},
    "label":         {"label": "Label",             "accent": "--blue"},
    "studio":        {"label": "Studio",            "accent": "--green"},
    "quan-ly":       {"label": "Quản lý & Booking",  "accent": "--purple"},
    "khac":          {"label": "Nhà sáng tạo khác",  "accent": "--amber"},
}

# Hệ thống Badge thành tích — gán thủ công qua CMS, không phụ thuộc điểm số.
# Một hồ sơ có thể mang nhiều badge cùng lúc. Thứ tự trong dict quyết định
# thứ tự hiển thị xếp chồng trên thẻ (badge nổi bật nhất đứng trước).
PROFILE_BADGES = {
    "goat":       {"label": "GOAT",       "desc": "Đỉnh cao mọi thời đại"},
    "hot":        {"label": "HOT",        "desc": "Đang thịnh hành, hoạt động sôi nổi"},
    "rising":     {"label": "RISING",     "desc": "Đang trên đà tăng trưởng rõ rệt"},
    "talent":     {"label": "TALENT",     "desc": "Gương mặt mới tiềm năng, được ủng hộ"},
    "verified":   {"label": "VERIFIED",   "desc": "Hồ sơ đã được xác thực chính chủ"},
    "veteran":    {"label": "VETERAN",    "desc": "Kỳ cựu, có thâm niên lâu năm trong nghề"},
    "underrated": {"label": "UNDERRATED", "desc": "Thực lực cao hơn mức được ghi nhận"},
}

def load_profiles():
    profiles_dir = os.path.join(REPO_ROOT, "content", "profiles")
    profiles = []
    if not os.path.isdir(profiles_dir):
        return profiles
    for path in sorted(glob.glob(os.path.join(profiles_dir, "*.md"))):
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, body_md = _parse_frontmatter(raw)
        name = (meta.get("name") or "").strip()
        if not name:
            print(f"  ! Bỏ qua hồ sơ {os.path.basename(path)} (thiếu tên)")
            continue
        ptype = (meta.get("type") or "khac").strip()
        if ptype not in PROFILE_TYPES:
            print(f"  ! Hồ sơ {os.path.basename(path)}: loại '{ptype}' không hợp lệ, dùng 'khac'")
            ptype = "khac"
        try:
            influence = int(meta.get("influence", 0))
        except (TypeError, ValueError):
            influence = 0
        influence = max(0, min(100, influence))  # kẹp trong khoảng 0-100

        # Đọc danh sách badge, lọc bỏ giá trị không hợp lệ, giữ đúng thứ tự ưu tiên PROFILE_BADGES
        raw_badges = meta.get("badges") or []
        if not isinstance(raw_badges, list):
            raw_badges = []
        valid_badges = set(b for b in raw_badges if b in PROFILE_BADGES)
        ordered_badges = [key for key in PROFILE_BADGES if key in valid_badges]
        invalid = set(raw_badges) - set(PROFILE_BADGES.keys())
        if invalid:
            print(f"  ! Hồ sơ {os.path.basename(path)}: badge không hợp lệ bị bỏ qua: {', '.join(invalid)}")

        raw_aliases = meta.get("aliases") or []
        if not isinstance(raw_aliases, list):
            raw_aliases = []
        aliases = [a.strip() for a in raw_aliases if (a or "").strip()]

        profiles.append({
            "slug": os.path.splitext(os.path.basename(path))[0],
            "name": name,
            "type": ptype,
            "role": (meta.get("role") or "").strip(),
            "influence": influence,
            "avatar": (meta.get("avatar") or "").strip(),
            "short_desc": (meta.get("short_desc") or "").strip(),
            "badges": ordered_badges,
            "aliases": aliases,
            "body": _md_body_to_blocks(body_md),
            "spotify_artist": (meta.get("spotify_artist") or "").strip(),
        })
    return profiles

PROFILES = load_profiles()

# -----------------------------------------------------------------
# ARTIST KNOWLEDGE GRAPH V1
# Nối TNC Profiles với bài viết KHÔNG qua nhập tay: một bài viết "thuộc
# về" một Profile khi 1 trong các tag của bài (đã slugify, bỏ dấu/# ) khớp
# slug tên hoặc slug của bất kỳ alias nào của Profile đó. "match_slugs"
# là tập hợp các slug nhận diện một Profile — dùng để gộp bài viết liên
# quan (mục 1-2) VÀ để nhận diện tên nghệ sĩ xuất hiện trong thân bài để
# tự sinh internal link (mục 3), không lưu trùng dữ liệu ở đâu cả, chỉ
# tính lại mỗi lần build từ đúng 2 nguồn: content/profiles (Markdown) + bảng
# articles trên Supabase.
# -----------------------------------------------------------------
def _entity_match_slugs(name, aliases):
    slugs = set()
    for form in [name] + list(aliases):
        s = slugify((form or "").strip())
        if s and s != "bai-viet":
            slugs.add(s)
    return slugs

for _p in PROFILES:
    _p["match_slugs"] = _entity_match_slugs(_p["name"], _p["aliases"])

def _parse_vn_date(date_str):
    """Parse chuỗi ngày 'D Tháng M, YYYY' (định dạng publish date duy nhất
    dùng trong toàn hệ thống) thành datetime.date để so sánh/sắp xếp. Ngày
    không đọc được (hiếm, dữ liệu lỗi) coi như cũ nhất, xếp cuối, không
    chặn build."""
    import datetime
    m = re.match(r'^\s*(\d{1,2})\s*Tháng\s*(\d{1,2})\s*,\s*(\d{4})\s*$', date_str or "")
    if not m:
        return datetime.date.min
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime.date(year, month, day)
    except ValueError:
        return datetime.date.min

# profile_slug -> list bài viết liên quan, mới nhất trước, không trùng lặp
PROFILE_ARTICLES = {}
for _p in PROFILES:
    _matched, _seen = [], set()
    for _a in ARTICLES:
        _tag_slugs = {slugify(t) for t in _a.get("tags", [])}
        if _p["match_slugs"] & _tag_slugs and _a["slug"] not in _seen:
            _matched.append(_a)
            _seen.add(_a["slug"])
    _matched.sort(key=lambda a: _parse_vn_date(a["date"]), reverse=True)
    PROFILE_ARTICLES[_p["slug"]] = _matched

# Chỉ mục ngược: bề mặt chữ thật (giữ nguyên hoa/thường để hiển thị) ->
# Profile, dùng để tự sinh internal link trong thân bài Article. Khớp
# theo entity HOÀN CHỈNH (\b...\b, không link một phần từ), không phân
# biệt hoa/thường khi so khớp nhưng giữ nguyên đúng chữ gốc trong bài khi
# hiển thị link. Tên/alias trùng giữa 2 Profile khác nhau -> giữ Profile
# nạp trước, cảnh báo rõ, không crash build.
SURFACE_TO_PROFILE = {}
_surface_forms = []
for _p in PROFILES:
    for _form in [_p["name"]] + _p["aliases"]:
        _form = (_form or "").strip()
        if not _form:
            continue
        _key = _form.lower()
        _owner = SURFACE_TO_PROFILE.get(_key)
        if _owner and _owner["slug"] != _p["slug"]:
            print(f"  ! CẢNH BÁO: tên/alias '{_form}' trùng giữa hồ sơ '{_owner['name']}' và '{_p['name']}' — chỉ liên kết tới '{_owner['name']}'")
            continue
        SURFACE_TO_PROFILE[_key] = _p
        _surface_forms.append(_form)

ENTITY_PATTERN = None
if _surface_forms:
    _alt = "|".join(re.escape(f) for f in sorted(set(_surface_forms), key=len, reverse=True))
    ENTITY_PATTERN = re.compile(r'\b(?:' + _alt + r')\b', re.IGNORECASE)

_ENTITY_TAG_RE = re.compile(r'(<[^>]+>)')
_ENTITY_SKIP_TAGS = {"a", "code", "h1", "h2", "h3", "h4", "h5", "h6"}

def linkify_entities(html_fragment):
    """Tự động chèn internal link tới TNC Profile khi tên/alias nghệ sĩ
    xuất hiện trong HTML thân bài ĐÃ RENDER — không sửa markdown gốc, chỉ
    sinh link ở bước build. An toàn theo thẻ HTML: bỏ qua hoàn toàn nội
    dung bên trong <a> (không lồng link/không link lại link có sẵn),
    <code> (không link trong code) và heading h1-h6 (không link trong
    heading). Không đụng URL/thuộc tính vì chỉ xử lý các đoạn text NẰM
    NGOÀI thẻ, không bao giờ chạm vào bên trong dấu <...>. Mỗi Profile chỉ
    được link ở lần xuất hiện ĐẦU TIÊN trong bài, tránh rợp link toàn bài."""
    if not ENTITY_PATTERN or not html_fragment:
        return html_fragment
    linked_slugs = set()
    skip_depth = 0
    out = []
    for tok in _ENTITY_TAG_RE.split(html_fragment):
        if not tok:
            continue
        if tok[0] == '<':
            m = re.match(r'</?([a-zA-Z0-9]+)', tok)
            tagname = m.group(1).lower() if m else ""
            if tagname in _ENTITY_SKIP_TAGS:
                skip_depth += -1 if tok.startswith('</') else 1
                skip_depth = max(skip_depth, 0)
            out.append(tok)
            continue
        if skip_depth > 0:
            out.append(tok)
            continue

        def _sub(m):
            surface = m.group(0)
            profile = SURFACE_TO_PROFILE.get(surface.lower())
            if not profile or profile["slug"] in linked_slugs:
                return surface
            linked_slugs.add(profile["slug"])
            return f'<a href="{profile_url(profile["slug"])}">{surface}</a>'

        out.append(ENTITY_PATTERN.sub(_sub, tok))
    return "".join(out)


# Bảo hiểm: nếu chưa có bài nào, tạo 1 bài chào mừng tạm để trang chủ không lỗi
if not ARTICLES:
    ARTICLES = [{
        "slug": "chao-mung",
        "series": SERIES[0]["slug"],
        "category": "",
        "title": "Chào mừng đến với The New Culture",
        "dek": "Chưa có bài viết nào. Hãy thêm bài đầu tiên qua trang quản trị /admin/.",
        "author": "TNC Editorial",
        "date": "",
        "read_time": "1 phút đọc",
        "cover": "",
        "cover_credit": "",
        "poster": "",
        "featured": True,
        "hero_priority": False,
        "order": 1,
        "tags": [],
        "ranking": [],
        "body": [("p", "Nội dung đầu tiên đang chờ được viết. Truy cập /admin/ để bắt đầu.")],
    }]
# đưa featured lên đầu để làm hero (nếu có)
_featured = [a for a in ARTICLES if a["featured"]]
if _featured:
    hero = _featured[0]
    ARTICLES.remove(hero)
    ARTICLES.insert(0, hero)

ARTICLES_BY_SERIES = {}
for a in ARTICLES:
    ARTICLES_BY_SERIES.setdefault(a["series"], []).append(a)

# Phase 2A: chỉ mục Category — category_id nullable nên nhiều bài chưa gán
# (a["category"] == ""), những bài đó không xuất hiện ở đây, tương tự cách
# ARTICLES_BY_SERIES xử lý series rỗng.
ARTICLES_BY_CATEGORY = {}
for a in ARTICLES:
    if a.get("category"):
        ARTICLES_BY_CATEGORY.setdefault(a["category"], []).append(a)

# Chỉ mục Tag: gom bài viết theo slug của từ khóa (không phân biệt hoa/thường,
# có dấu/không dấu), giữ lại cách viết gốc xuất hiện đầu tiên để hiển thị.
TAGS_BY_SLUG = {}
for a in ARTICLES:
    for t in a.get("tags", []):
        t = (t or "").strip()
        if not t:
            continue
        tslug = slugify(t)
        TAGS_BY_SLUG.setdefault(tslug, {"name": t, "articles": []})
        TAGS_BY_SLUG[tslug]["articles"].append(a)

print(f"Đã nạp {len(SERIES)} series, {len(ARTICLES)} bài viết từ Supabase.")

# -----------------------------------------------------------------
# TNC MAGAZINE (Monthly Digital Magazine) — Rev 11: đọc metadata Issue từ
# bảng magazine_issues (Supabase) nếu đã migrate; rỗng/chưa migrate thì
# fallback đọc content/magazine/*.md y hệt hành vi gốc (cùng mẫu
# load_campaigns()/_load_campaigns_from_file() ở Rev 8). Collection này
# KHÔNG chứa bài viết — toàn bộ logic gộp bài theo Tháng/Năm + tính Issue
# Number nằm trong scripts/magazine.py (Issue Builder, module độc lập),
# không đổi ở Rev 11.
# -----------------------------------------------------------------
def _load_magazine_issues_from_file():
    """Đọc content/magazine/*.md (Sveltia CMS, hành vi gốc trước Rev 11) —
    dùng làm fallback khi bảng magazine_issues (Supabase) rỗng/chưa migrate."""
    magazine_dir = os.path.join(REPO_ROOT, "content", "magazine")
    raw = []
    if not os.path.isdir(magazine_dir):
        return raw
    for path in sorted(glob.glob(os.path.join(magazine_dir, "*.md"))):
        with open(path, encoding="utf-8") as f:
            file_raw = f.read()
        meta, _ = _parse_frontmatter(file_raw)
        raw.append({
            "slug": os.path.splitext(os.path.basename(path))[0],
            "cover_image": (meta.get("cover_image") or "").strip(),
            "cover_story": str(meta.get("cover_story") or "").strip(),
            "editors_note": (meta.get("editors_note") or "").strip(),
            "month": meta.get("month"),
            "year": meta.get("year"),
            "status": (meta.get("status") or "draft").strip(),
        })
    return raw

def load_magazine_issues_raw():
    try:
        rows = _supabase_get(
            "magazine_issues",
            "select=slug,cover_image_url,cover_story_slug,editors_note,month,year,status"
            "&deleted_at=is.null"
        )
    except RuntimeError:
        rows = None
    if not rows:
        return _load_magazine_issues_from_file()
    return [
        {
            "slug": row["slug"],
            "cover_image": row.get("cover_image_url") or "",
            "cover_story": row.get("cover_story_slug") or "",
            "editors_note": row.get("editors_note") or "",
            "month": row.get("month"),
            "year": row.get("year"),
            "status": row.get("status") or "draft",
        }
        for row in rows
    ]

def _resolve_magazine_article(raw_slug):
    """Cover Story field (relation) lưu slug thô của Sveltia CMS (có thể
    còn dấu, do slug entry Article không ép clean_accents) — chuẩn hoá
    qua đúng slugify() mà load_articles() đã dùng cho chính Article đó
    rồi mới tra cứu, để không phụ thuộc CMS lưu slug có dấu hay không."""
    if not raw_slug:
        return None
    return ARTICLES_BY_SLUG.get(slugify(raw_slug))

MAGAZINE_RAW_ISSUES = load_magazine_issues_raw()
MAGAZINE_ISSUES, _magazine_skipped, _magazine_duplicates, _magazine_bad_cover_story = magazine.build_issues(
    MAGAZINE_RAW_ISSUES, ARTICLES, _parse_vn_date, _resolve_magazine_article
)
for _slug in _magazine_skipped:
    print(f"  ! TNC Magazine: số báo '{_slug}' thiếu/lỗi Tháng hoặc Năm phát hành, bỏ qua")
for _slug in _magazine_duplicates:
    print(f"  ! TNC Magazine: số báo '{_slug}' trùng Tháng/Năm với số báo khác, bỏ qua")
for _slug in _magazine_bad_cover_story:
    print(f"  ! TNC Magazine: số báo '{_slug}' có Cover Story không khớp bài viết nào, bỏ qua trường này")
if MAGAZINE_ISSUES:
    print(f"TNC Magazine: {len(MAGAZINE_ISSUES)} số báo đã xuất bản.")
# =================================================================
# TEMPLATE v3 — theo hệ thống component Complex-style
# =================================================================

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?'
         'family=Archivo:wght@400;500;600;700;800;900&'
         'family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">'
         '<meta name="view-transition" content="same-origin">')

def head(title, desc=None, path="", image="", og_type="website", append_site_name=True, schema_json=""):
    """Sinh <head> đầy đủ SEO + Open Graph.
    path: đường dẫn tương đối của trang (vd 'article-abc.html') để tạo canonical/og:url.
    image: đường dẫn ảnh đại diện (tương đối hoặc tuyệt đối).
    append_site_name: mặc định True — tự nối '— The New Culture' vào cuối tiêu đề
    (quy ước SEO chuẩn cho phần lớn trang). Đặt False khi tiêu đề đã tự chứa
    tên thương hiệu (ví dụ trang chủ), tránh lặp tên khi chia sẻ mạng xã hội."""
    import html as _html
    desc = desc or SITE_SETTINGS["site_description"]
    desc_short = (desc[:157] + "…") if len(desc) > 158 else desc
    canonical = f"{SITE_URL}/{path}" if path else SITE_URL + "/"
    if image:
        og_image = image if image.startswith("http") else f"{SITE_URL}/{image.lstrip('/')}"
    elif SITE_SETTINGS["default_og_image"]:
        # Rev 12: Dashboard (Site Settings -> "Ảnh Open Graph mặc định") đã
        # có field + cột từ Rev 7 nhưng build.py chưa từng đọc — trang nào
        # không tự có ảnh riêng vẫn luôn dùng đúng "/og-default.png" hardcode.
        og_image = SITE_SETTINGS["default_og_image"]
    else:
        og_image = f"{SITE_URL}/og-default.png"
    full_title = f"{title} — {SITE_SETTINGS['site_name']}" if append_site_name else title
    t = _html.escape(full_title, quote=True)
    d = _html.escape(desc_short, quote=True)
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="#E11D0F">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="{SITE_SETTINGS['favicon_image']}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<!-- Open Graph -->
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE_SETTINGS['site_name']}">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{og_image}">
<meta property="og:locale" content="vi_VN">
<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{og_image}">
{FONTS}
<link rel="stylesheet" href="style.css">
{schema_json}
</head>
<body>
"""

NAV_ITEMS = [
    ("tnc-origins","TNC Origins"),
    ("tnc-profiles","TNC Profiles"),
    ("tnc-records","TNC Records"),
    ("tnc-breakdown","TNC Breakdown"),
    ("tnc-editorial","TNC Editorial"),
    ("tnc-culture","TNC Culture"),
    ("inside-the-culture","Inside The Culture"),
    ("tnc-radar","TNC Radar"),
    # Rev 18 — TNC Premium: series chính thức, xuất hiện cùng các series khác
    # trên thanh điều hướng chính (yêu cầu riêng của series này).
    ("tnc-premium","TNC Premium"),
]

def _is_video_file(path):
    """Nhận diện một đường dẫn media có phải video hay không, dựa theo đuôi tệp."""
    return path.lower().endswith((".mp4", ".webm", ".mov"))

def _ad_media_tag(src):
    """Sinh thẻ HTML hiển thị đúng loại media (ảnh tĩnh hoặc video tự động
    phát lặp vô hạn, không nút điều khiển) dựa theo đuôi tệp."""
    if not src:
        return ""
    if _is_video_file(src):
        return (f'<video src="{src}" autoplay loop muted playsinline '
                 f'class="ad-block__media"></video>')
    return f'<img src="{src}" alt="Quảng cáo" loading="lazy" class="ad-block__media">'

def render_ad_block(placement_id, vertical_key, horizontal_key, link_key, extra_class=""):
    """Module 3 — Advertisement Manager (Rev 8). Ưu tiên quảng cáo active từ
    Supabase (bảng ads, đúng placement_id); rỗng thì fallback nguyên xi logic
    cũ (ưu tiên ảnh/video DỌC trong SETTINGS, ngược lại dùng bản NGANG thay
    thế). Tự ẩn hoàn toàn nếu không có gì cho vị trí này ở cả 2 nguồn."""
    ads_here = ADS_BY_PLACEMENT.get(placement_id) or []
    if ads_here:
        ad = ads_here[0]
        src = (ad.get("media") or {}).get("url", "")
        link = ad.get("link_url") or ""
        media_html = _ad_media_tag(src)
        data_attr = f' data-ad-id="{ad["id"]}"'
        if link:
            target_attrs = ' target="_blank" rel="noopener sponsored"' if ad.get("link_target", "external") == "external" else ""
            return (f'<a href="{link}"{target_attrs} '
                     f'class="ad-block ad-block--vertical {extra_class}"{data_attr}>{media_html}</a>')
        return f'<div class="ad-block ad-block--vertical {extra_class}"{data_attr}>{media_html}</div>'

    # Rev 12: fallback quảng cáo giờ đọc từ SITE_SETTINGS (Dashboard), tự rơi
    # về SETTINGS (site.yml) qua fallback đã có sẵn trong load_site_settings().
    vertical = SITE_SETTINGS.get(vertical_key, "")
    horizontal = SITE_SETTINGS.get(horizontal_key, "")
    link = SITE_SETTINGS.get(link_key, "")
    src = vertical or horizontal
    if not src:
        return ""
    orientation_cls = "ad-block--vertical" if src == vertical else "ad-block--horizontal-fallback"
    media_html = _ad_media_tag(src)
    if link:
        return (f'<a href="{link}" target="_blank" rel="noopener sponsored" '
                 f'class="ad-block {orientation_cls} {extra_class}">{media_html}</a>')
    return f'<div class="ad-block {orientation_cls} {extra_class}">{media_html}</div>'

def render_ad_block_horizontal_only(placement_id, horizontal_key, link_key, extra_class=""):
    """Bản NGANG thuần túy của render_ad_block() — dùng cho trang chủ và mọi
    vị trí trên di động, luôn ưu tiên bản ngang bất kể có bản dọc hay không."""
    ads_here = ADS_BY_PLACEMENT.get(placement_id) or []
    if ads_here:
        ad = ads_here[0]
        src = (ad.get("media") or {}).get("url", "")
        link = ad.get("link_url") or ""
        media_html = _ad_media_tag(src)
        data_attr = f' data-ad-id="{ad["id"]}"'
        if link:
            target_attrs = ' target="_blank" rel="noopener sponsored"' if ad.get("link_target", "external") == "external" else ""
            return (f'<a href="{link}"{target_attrs} '
                     f'class="ad-block ad-block--horizontal {extra_class}"{data_attr}>{media_html}</a>')
        return f'<div class="ad-block ad-block--horizontal {extra_class}"{data_attr}>{media_html}</div>'

    horizontal = SITE_SETTINGS.get(horizontal_key, "")
    link = SITE_SETTINGS.get(link_key, "")
    if not horizontal:
        return ""
    media_html = _ad_media_tag(horizontal)
    if link:
        return (f'<a href="{link}" target="_blank" rel="noopener sponsored" '
                 f'class="ad-block ad-block--horizontal {extra_class}">{media_html}</a>')
    return f'<div class="ad-block ad-block--horizontal {extra_class}">{media_html}</div>'

def render_sticky_ads_sidebar():
    """Hai khối quảng cáo sticky hai bên hông (desktop rộng, từ 1400px).
    Tự ẩn độc lập nếu chưa cấu hình media cho vị trí đó."""
    left = render_ad_block("sidebar_left", "ad_left_vertical", "ad_left_horizontal", "ad_left_link", "ad-block--sidebar-left")
    right = render_ad_block("sidebar_right", "ad_right_vertical", "ad_right_horizontal", "ad_right_link", "ad-block--sidebar-right")
    if not left and not right:
        return ""
    return f"""
  <div class="ad-sidebar ad-sidebar--left">{left}</div>
  <div class="ad-sidebar ad-sidebar--right">{right}</div>
"""

def render_inline_ad_mobile():
    """Khối quảng cáo ngang thay thế cho mobile/màn hẹp (dưới 1400px), nơi
    sidebar bị ẩn. Chèn trong nội dung bài viết, dùng ảnh ngang."""
    left = render_ad_block_horizontal_only("sidebar_left", "ad_left_horizontal", "ad_left_link")
    right = render_ad_block_horizontal_only("sidebar_right", "ad_right_horizontal", "ad_right_link")
    if not left and not right:
        return ""
    return f"""
  <div class="container ad-inline-mobile">
    {left}
    {right}
  </div>
"""

def render_homepage_ad_block():
    """Khối quảng cáo ngang trên trang chủ, đặt giữa 'Câu chuyện nổi bật'
    và 'Video'. Ưu tiên gộp cả hai vị trí trái/phải thành một dải ngang duy
    nhất (dùng bản ngang của cả hai, xếp cạnh nhau) nếu cả hai đã cấu hình;
    nếu chỉ một bên có dữ liệu, hiển thị đúng một khối. Tự ẩn hoàn toàn nếu
    chưa cấu hình gì."""
    left = render_ad_block_horizontal_only("sidebar_left", "ad_left_horizontal", "ad_left_link")
    right = render_ad_block_horizontal_only("sidebar_right", "ad_right_horizontal", "ad_right_link")
    if not left and not right:
        return ""
    return f"""
  <section class="section container ad-homepage">
    <div class="ad-homepage__row">
      {left}
      {right}
    </div>
  </section>
"""

def wordmark_html(variant="lead"):
    """Sinh logo: ảnh tùy chỉnh nếu có trong Settings, ngược lại chữ mặc định.
    variant='lead' dùng cho masthead chính (có dòng Lamar's phía trên);
    variant='plain' dùng cho menu overlay / footer."""
    if SITE_SETTINGS.get("logo_image"):
        alt = "The New Culture"
        cls = "wordmark wordmark--img" + (" wordmark--lead" if variant == "lead" else "")
        return f'<a href="index.html" class="{cls}" aria-label="The New Culture — trang chủ"><img src="{SITE_SETTINGS["logo_image"]}" alt="{alt}"></a>'
    if variant == "lead":
        return ('<a href="index.html" class="wordmark wordmark--lead" aria-label="The New Culture — trang chủ">'
                '<span class="wordmark__owner">Lamar\'s</span>'
                '<span class="wordmark__title">THE NEW CULTURE</span></a>')
    return '<a href="index.html" class="wordmark"><span class="wordmark__title">THE NEW CULTURE</span></a>'

def active_socials():
    """Trả về danh sách (nhãn, url) cho các nền tảng đã được điền link trong CMS.
    Nền tảng nào để trống sẽ không xuất hiện trong danh sách — tránh hiện link chết.
    Rev 12: đọc từ SITE_SETTINGS (Dashboard), tự rơi về SETTINGS (site.yml)
    qua fallback đã có sẵn trong load_site_settings()."""
    platforms = [
        ("Facebook", SITE_SETTINGS["social_facebook"]),
        ("Instagram", SITE_SETTINGS["social_instagram"]),
        ("YouTube", SITE_SETTINGS["social_youtube"]),
        ("TikTok", SITE_SETTINGS["social_tiktok"]),
    ]
    return [(label, url) for label, url in platforms if url]

def follow_button_url():
    """Nút 'Theo dõi' ở đầu trang: dẫn thẳng tới Facebook nếu đã cấu hình,
    ngược lại tạm thời dẫn về trang Theo dõi nội bộ của site."""
    fb = SITE_SETTINGS["social_facebook"]
    return fb if fb else "theo-doi.html"

def masthead(active=None):
    # Module 8 — Menu Builder: menu chính đọc từ Supabase (menus.key=
    # 'header_primary') nếu đã có dữ liệu; rỗng/chưa migrate thì dùng đúng
    # NAV_ITEMS hardcode như trước — không bao giờ mất menu giữa lúc chuyển đổi.
    if HEADER_PRIMARY_MENU:
        nav_pairs = [(_menu_item_url(m), m["label"]) for m in HEADER_PRIMARY_MENU]
        active_url = f"series-{active}.html" if active else None
    else:
        nav_pairs = [(f"series-{slug}.html", label) for slug, label in NAV_ITEMS]
        active_url = f"series-{active}.html" if active else None
    nav_links = ""
    for url, label in nav_pairs:
        cls = ' class="is-active"' if url == active_url else ""
        nav_links += f'<a href="{url}"{cls}>{label}</a>'

    # overlay: đủ 16 series + link phụ
    menu_series = ""
    for s in SERIES:
        menu_series += f'<a href="{series_url(s["slug"])}"><span class="menu-code">{s["code"]} · {s["num"]}</span>{s["name"]}</a>'

    # Rev 12: quick_link (3 link ở .masthead__util) và header_mega (2 cột
    # "Khám phá"/"Tổ chức" trong menu-overlay) đọc từ Menu Builder nếu đã có
    # dữ liệu; rỗng/chưa cấu hình thì dùng đúng HTML hardcode như trước.
    if QUICK_LINK_MENU:
        quick_links_html = "".join(f'<a href="{_menu_item_url(m)}">{m["label"]}</a>' for m in QUICK_LINK_MENU)
    else:
        quick_links_html = """<a href="all-series.html">Series</a>
        <a href="tnc-sessions.html">TNC Sessions</a>
        <a href="hop-tac.html">Hợp tác</a>"""

    if HEADER_MEGA_MENU:
        mega_columns_html = "".join(
            f'<div class="menu-col"><h4>{col["label"]}</h4>'
            + "".join(f'<a href="{_menu_item_url(c)}">{c["label"]}</a>' for c in col["children"])
            + "</div>"
            for col in HEADER_MEGA_MENU
        )
    else:
        mega_columns_html = """<div class="menu-col">
      <h4>Khám phá</h4>
      <a href="all-series.html">Tất cả Series</a>
      <a href="archive.html">Toàn bộ bài viết</a>
      <a href="all-categories.html">Chuyên mục</a>
      <a href="all-tags.html">Tất cả chủ đề</a>
      <a href="video.html">Video</a>
      <a href="su-kien.html">Sự kiện</a>
      <a href="tnc-sessions.html">TNC Sessions</a>
      <a href="newsletter.html">Newsletter</a>
    </div>
    <div class="menu-col">
      <h4>Tổ chức</h4>
      <a href="ve-tnc.html">Về TNC</a>
      <a href="hop-tac.html">Hợp tác</a>
      <a href="lien-he.html">Liên hệ</a>
      <a href="tuyen-dung.html">Tuyển dụng</a>
      <a href="theo-doi.html">Theo dõi TNC</a>
    </div>"""

    # Module 5 — Announcement Manager: hiển thị phía trên masthead. Không có
    # announcement hợp lệ -> render_announcement_bar() trả về "", không đổi
    # gì so với trước Rev 9.
    return f"""{render_announcement_bar()}
<header class="masthead">
  <div class="masthead__util">
    <div class="container">
      <span id="mastheadDate">{TODAY_VN} · Sài Gòn</span>
      <div class="u-links">
        {quick_links_html}
      </div>
    </div>
  </div>
  <div class="masthead__main{' masthead__main--has-bg' if SITE_SETTINGS.get('header_bg_image') else ''}"{f' style="background-image:url(\'{SITE_SETTINGS["header_bg_image"]}\')"' if SITE_SETTINGS.get('header_bg_image') else ''}>
    <div class="container">
      {wordmark_html('lead')}
      <div class="masthead__actions">
        <a href="search.html" class="icon-btn" aria-label="Tìm kiếm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        </a>
        <a href="{follow_button_url()}"{' target="_blank" rel="noopener"' if SITE_SETTINGS['social_facebook'] else ''} class="btn btn--solid">Theo dõi</a>
        <button class="icon-btn" id="menuToggle" aria-label="Mở menu" aria-expanded="false" aria-controls="siteMenu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>
  </div>
  <nav class="masthead__nav" aria-label="Chuyên mục Series">
    <div class="container">
      {nav_links}
      <a href="all-series.html">Tất cả Series →</a>
    </div>
  </nav>
</header>

<div class="menu-overlay" id="siteMenu" role="dialog" aria-modal="true" aria-label="Menu điều hướng" hidden>
  <div class="menu-overlay__bar">
    <div class="container">
      {wordmark_html('plain')}
      <button class="icon-btn" id="menuClose" aria-label="Đóng menu">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
  </div>
  <div class="container menu-overlay__body">
    <div class="menu-col menu-col--series">
      <h4>{len(SERIES)} Series</h4>
      <div class="menu-series">{menu_series}</div>
    </div>
    {mega_columns_html}
  </div>
</div>
"""

def newsletter():
    return """
<section class="newsletter">
  <div class="container">
    <div>
      <h2>Theo dõi Archive của TNC</h2>
      <p>Tóm tắt tin tức, phỏng vấn và nghiên cứu underground mỗi tuần — thẳng vào hộp thư.</p>
    </div>
    <form action="newsletter.html" method="get">
      <input type="email" name="email" placeholder="email@example.com" aria-label="Địa chỉ email" required>
      <button type="submit" class="btn btn--solid">Đăng ký</button>
    </form>
  </div>
</section>
"""

def analytics_script_tag():
    """Cloudflare Web Analytics — chỉ render khi đã cấu hình token qua CMS.
    Phòng trường hợp người dùng dán nhầm cả đoạn <script> mẫu từ dashboard
    Cloudflare (thay vì chỉ token bên trong): tự trích token ra, tránh sinh
    thẻ <script> lồng nhau làm hỏng cấu trúc HTML trên toàn bộ trang."""
    raw = SITE_SETTINGS.get("cloudflare_analytics_token", "")
    if not raw:
        return ""
    m = re.search(r'"token"\s*:\s*"([a-f0-9]+)"', raw)
    token = m.group(1) if m else raw.strip()
    if not re.fullmatch(r'[a-f0-9]{16,64}', token):
        print(f"  ! Cloudflare Analytics Token không hợp lệ, bỏ qua: {raw[:40]}")
        return ""
    return (f'<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
            f'data-cf-beacon=\'{{"token": "{token}"}}\'></script>')

def render_promo_banner(campaign):
    """Sticky Bottom Banner — V3.0 Promotion System. Chỉ nhận vào chiến
    dịch đã được pick_active_campaign() chọn sẵn (đúng 1 hoặc None); hàm
    này không tự quyết định chiến dịch nào được chạy, chỉ render.
    Mặc định ẩn bằng CSS (.promo-banner không có class is-visible) — JS
    trong footer() mới bật hiện sau khi kiểm tra localStorage, để tránh
    nháy lại banner mà người dùng vừa đóng, và mới lúc đó mới thêm
    padding-bottom cho <body>."""
    if not campaign:
        return ""
    desktop_img = campaign["desktop_image"]
    mobile_img = campaign["mobile_image"] or desktop_img
    has_link = bool(campaign["destination_url"])
    target_attrs = ' target="_blank" rel="noopener sponsored"' if campaign["open_in_new_tab"] else ""

    if campaign["type"] == "video" and campaign["video"]:
        poster_attr = f' poster="{desktop_img}"' if desktop_img else ""
        media_html = (f'<video class="promo-banner__media" src="{campaign["video"]}"{poster_attr} '
                      f'autoplay loop muted playsinline></video>')
    elif desktop_img:
        media_html = (
            '<picture>'
            f'<source media="(max-width:768px)" srcset="{mobile_img}">'
            f'<img class="promo-banner__media" src="{desktop_img}" alt="" loading="lazy">'
            '</picture>'
        )
    else:
        # Thiếu cả video lẫn ảnh desktop -> không có gì để hiển thị.
        return ""

    inner = f'<div class="promo-banner__inner">{media_html}</div>'
    content = (f'<a class="promo-banner__link" href="{campaign["destination_url"]}"{target_attrs}>{inner}</a>'
               if has_link else inner)
    close_btn = ('<button type="button" class="promo-banner__close" aria-label="Đóng quảng bá">&times;</button>'
                 if campaign["dismissible"] else "")

    return f"""
<div class="promo-banner" id="promoStickyBanner" data-campaign="{campaign['slug']}" data-placement="sticky_bottom"
     data-dismissible="{1 if campaign['dismissible'] else 0}" data-dismiss-days="{campaign['dismiss_days']}">
  {content}
  {close_btn}
</div>"""

def load_footer_settings():
    """Module 9 — Footer Builder. Đọc footer_settings (Supabase); fallback về
    đúng 2 dòng text hardcode hiện tại nếu bảng rỗng/chưa migrate."""
    fallback = {
        "description": "Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam. "
                        "Lưu giữ để không giá trị nào bị lãng quên.",
        "copyright_text": "© 2026 The New Culture — Bản demo",
    }
    try:
        rows = _supabase_get("footer_settings", "select=description,copyright_text")
    except RuntimeError:
        return fallback
    if not rows:
        return fallback
    row = rows[0]
    return {
        "description": (row.get("description") or "").strip() or fallback["description"],
        "copyright_text": (row.get("copyright_text") or "").strip() or fallback["copyright_text"],
    }

def load_footer_partners():
    """Module 9 — danh sách đối tác/nhà tài trợ hiển thị ở chân trang. Tính
    năng MỚI (chưa từng có dữ liệu) — bảng rỗng là bình thường, không render
    gì cả khi rỗng (không đổi giao diện hiện tại)."""
    try:
        rows = _supabase_get(
            "footer_partners",
            "select=name,link_url,logo:logo_media_id(url)&is_active=eq.true&deleted_at=is.null&order=sort_order.asc"
        )
    except RuntimeError:
        return []
    return rows or []

# Bug fix (production audit): footer() được gọi lại ở MỌI trang, nên 2 loader
# này bị lặp lại vô ích cho cùng 1 kết quả suốt 1 lần build — tính 1 lần duy
# nhất, đúng khuôn mẫu SITE_SETTINGS/ADS_BY_PLACEMENT/CAMPAIGNS.
FOOTER_SETTINGS = load_footer_settings()
FOOTER_PARTNERS = load_footer_partners()

# 3 cột liên kết chân trang hiện tại (Khám phá / Series chính / Tổ chức) —
# dùng làm fallback đúng nguyên trạng khi menus.key='footer' chưa có dữ liệu.
_FOOTER_FALLBACK_COLUMNS = [
    ("Khám phá", [
        ("Toàn bộ Series", "all-series.html"),
        ("Toàn bộ bài viết", "archive.html"),
        ("TNC Magazine", "magazine-archive.html"),
        ("Video", "video.html"),
        ("Sự kiện", "su-kien.html"),
        ("Newsletter", "newsletter.html"),
    ]),
    ("Series chính", [
        ("TNC Origins", "series-tnc-origins.html"),
        ("TNC Profiles", "series-tnc-profiles.html"),
        ("Inside The Culture", "series-inside-the-culture.html"),
        ("TNC Radar", "series-tnc-radar.html"),
    ]),
    ("Tổ chức", [
        ("Về TNC", "ve-tnc.html"),
        ("Hợp tác", "hop-tac.html"),
        ("Liên hệ", "lien-he.html"),
        ("Tuyển dụng", "tuyen-dung.html"),
    ]),
]

def footer():
    socials = active_socials()
    icon_map = {"Facebook": "Fb", "Instagram": "Ig", "YouTube": "Yt", "TikTok": "Tt"}
    social_icons_html = "".join(
        f'<a href="{url}" target="_blank" rel="noopener" aria-label="{label}">{icon_map[label]}</a>'
        for label, url in socials
    )
    social_list_html = "".join(
        f'<li><a href="{url}" target="_blank" rel="noopener">{label}</a></li>'
        for label, url in socials
    )

    footer_settings = FOOTER_SETTINGS
    footer_menu = FOOTER_MENU
    if footer_menu:
        columns = [(col["label"], [(c["label"], _menu_item_url(c)) for c in col["children"]]) for col in footer_menu]
    else:
        columns = _FOOTER_FALLBACK_COLUMNS
    column_blocks = [
        f'<div class="footer__col"><h4>{label}</h4><ul>'
        + "".join(f'<li><a href="{url}">{link_label}</a></li>' for link_label, url in links)
        + "</ul></div>"
        for label, links in columns
    ]
    # "Nền tảng" (mạng xã hội, động qua active_socials()) giữ đúng vị trí thứ
    # 3 như giao diện gốc (Khám phá / Series chính / Nền tảng / Tổ chức) —
    # chèn vào giữa thay vì nối cuối, để không đổi thứ tự cột khi footer_menu
    # rỗng/chưa cấu hình (đúng yêu cầu không đổi giao diện production).
    social_column = f'<div class="footer__col"><h4>Nền tảng</h4><ul>{social_list_html}</ul></div>'
    insert_at = min(2, len(column_blocks))
    column_blocks.insert(insert_at, social_column)
    columns_html = "".join(column_blocks)

    partners = FOOTER_PARTNERS
    partners_html = ""
    if partners:
        partner_items = "".join(
            f'<a href="{p["link_url"]}" target="_blank" rel="noopener sponsored">'
            + (f'<img src="{p["logo"]["url"]}" alt="{p["name"]}" loading="lazy">' if p.get("logo") else p["name"])
            + "</a>"
            for p in partners
        )
        partners_html = f'<div class="footer__partners">{partner_items}</div>'

    return f"""
<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__brand">
        {wordmark_html('plain')}
        <p>{footer_settings['description']}</p>
        <div class="footer__social">
          {social_icons_html}
        </div>
      </div>
      {columns_html}
    </div>
    {partners_html}
    <div class="footer__bottom">
      <span>{footer_settings['copyright_text']}</span>
      <span>Founder &amp; Editor-in-Chief · Lamar</span>
    </div>
  </div>
</footer>
""" + render_promo_banner(ACTIVE_STICKY_BANNER) + """
<script>
(function(){
  var open=document.getElementById('menuToggle');
  var close=document.getElementById('menuClose');
  var menu=document.getElementById('siteMenu');
  if(!open||!menu)return;
  function show(){menu.hidden=false;document.body.style.overflow='hidden';open.setAttribute('aria-expanded','true');requestAnimationFrame(function(){menu.classList.add('is-open');});}
  function hide(){menu.classList.remove('is-open');document.body.style.overflow='';open.setAttribute('aria-expanded','false');setTimeout(function(){menu.hidden=true;},280);}
  open.addEventListener('click',show);
  if(close)close.addEventListener('click',hide);
  menu.addEventListener('click',function(e){if(e.target===menu)hide();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!menu.hidden)hide();});
})();
// Module 3 — Advertisement Manager: click/impression tracking. Chỉ những
// quảng cáo thật từ Supabase (bảng ads, có data-ad-id) mới được đếm —
// quảng cáo fallback (SETTINGS/site.yml) không có thuộc tính này nên
// không gọi gì cả, đúng bằng không cho tới khi editor tạo ads qua Dashboard.
(function(){
  var ads=document.querySelectorAll('[data-ad-id]');
  if(!ads.length)return;
  function call(id,kind){
    fetch('""" + SUPABASE_URL + """/rest/v1/rpc/increment_ad_stat',{method:'POST',
      headers:{'apikey':'""" + SUPABASE_ANON_KEY + """','Authorization':'Bearer """ + SUPABASE_ANON_KEY + """','Content-Type':'application/json'},
      body:JSON.stringify({p_ad_id:id,p_kind:kind}),keepalive:true}).catch(function(){});
  }
  ads.forEach(function(el){call(el.getAttribute('data-ad-id'),'impression');});
  document.addEventListener('click',function(e){
    var el=e.target.closest('[data-ad-id]');
    if(el)call(el.getAttribute('data-ad-id'),'click');
  });
})();
// Nút sao chép link bài viết
(function(){
  document.addEventListener('click',function(e){
    var btn=e.target.closest('.share-copy');
    if(!btn)return;
    var url=btn.getAttribute('data-url')||location.href;
    function done(){var t=btn.textContent;btn.textContent='Đã sao chép';btn.classList.add('copied');setTimeout(function(){btn.textContent=t;btn.classList.remove('copied');},1800);}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(url).then(done).catch(done);}
    else{var i=document.createElement('input');i.value=url;document.body.appendChild(i);i.select();try{document.execCommand('copy');}catch(_){}document.body.removeChild(i);done();}
  });
})();
// Hero slideshow: tự động chuyển sau 5 giây, chủ động chuyển bằng vuốt (di động)
// hoặc kéo chuột (desktop). Không dùng nút bấm hay chấm chỉ báo — giữ ảnh sạch.
(function(){
  var root=document.querySelector('[data-slideshow]');
  if(!root)return;
  var slides=Array.prototype.slice.call(root.querySelectorAll('.hero-full-slide'));
  if(slides.length<2)return;
  var current=0;
  var intervalMs=parseInt(root.getAttribute('data-slide-interval'),10)||5000;
  var timer=null;
  // Hero Progress — thanh mảnh báo thời gian tới khi tự chuyển slide (thay
  // cho chấm chỉ báo, xem comment CSS .hero-progress). reflow ép trình
  // duyệt tính lại style trước khi thêm class mới, đảm bảo transition luôn
  // chạy lại từ đầu (kỹ thuật chuẩn, không dùng thư viện ngoài).
  var progressBar=root.querySelector('.hero-progress__bar');
  function resetProgress(){
    if(!progressBar)return;
    progressBar.classList.remove('is-filling');
    progressBar.style.transitionDuration='0s';
    void progressBar.offsetWidth;
    progressBar.style.transitionDuration=intervalMs+'ms';
    progressBar.classList.add('is-filling');
  }
  function pauseProgress(){
    if(!progressBar)return;
    progressBar.classList.remove('is-filling');
  }

  function goTo(index){
    slides[current].classList.remove('is-active');
    current=(index+slides.length)%slides.length;
    slides[current].classList.add('is-active');
    resetProgress(); // slide vừa đổi (dù do timer hay thao tác tay) -> chạy lại từ đầu
    // Báo cho Hero Parallax Controller (IIFE riêng, phía dưới) biết slide
    // active vừa đổi để tự bind sang media mới — không gọi thẳng hàm của
    // nhau, giữ 2 cơ chế độc lập, chỉ liên lạc qua sự kiện DOM.
    root.dispatchEvent(new CustomEvent('heroslidechange'));
  }
  function next(){goTo(current+1);}
  function prev(){goTo(current-1);}
  function startAuto(){
    stopAuto();
    timer=setInterval(next,intervalMs);
    resetProgress();
  }
  function stopAuto(){
    if(timer){clearInterval(timer);timer=null;}
    pauseProgress();
  }
  function restartAuto(){startAuto();}

  // Ngưỡng khoảng cách tối thiểu (px) để tính là một thao tác vuốt/kéo thực sự,
  // tránh nhầm với một cú bấm nhẹ vào tiêu đề hoặc nút "Đọc bài" bên trong slide.
  var SWIPE_THRESHOLD=50;
  var startX=0,startY=0,isDragging=false,dragMoved=false;

  function dragStart(x,y){
    startX=x;startY=y;isDragging=true;dragMoved=false;
    stopAuto();
  }
  function dragEnd(x,y){
    if(!isDragging)return;
    isDragging=false;
    var dx=x-startX,dy=y-startY;
    if(Math.abs(dx)>SWIPE_THRESHOLD && Math.abs(dx)>Math.abs(dy)){
      dragMoved=true;
      if(dx<0){next();}else{prev();}
    }
    restartAuto();
  }

  // Cảm ứng (di động)
  root.addEventListener('touchstart',function(e){
    var t=e.changedTouches[0];
    dragStart(t.clientX,t.clientY);
  },{passive:true});
  root.addEventListener('touchend',function(e){
    var t=e.changedTouches[0];
    dragEnd(t.clientX,t.clientY);
  });

  // Chuột kéo (desktop)
  root.addEventListener('mousedown',function(e){
    dragStart(e.clientX,e.clientY);
    e.preventDefault();
  });
  root.addEventListener('mouseup',function(e){
    dragEnd(e.clientX,e.clientY);
  });
  root.addEventListener('mouseleave',function(){
    if(isDragging){isDragging=false;restartAuto();}
  });
  // Nếu vừa kéo xong (dragMoved), chặn sự kiện click phát sinh ngay sau đó
  // để không vô tình mở link bài viết khi người dùng chỉ có ý định kéo slide.
  root.addEventListener('click',function(e){
    if(dragMoved){e.preventDefault();e.stopPropagation();dragMoved=false;}
  },true);

  startAuto();
})();
// Marquee TNC Profiles: dải thẻ tự động trôi liên tục từ phải sang trái,
// vòng lặp vô tận (nhờ danh sách thẻ đã được nhân đôi ở phía server).
// Tạm dừng khi người dùng chạm/kéo; nối lại chuyển động sau khi thả ra.
(function(){
  var root=document.querySelector('[data-marquee]');
  if(!root)return;
  var track=root.querySelector('.profiles-spotlight__track');
  if(!track)return;

  var speedPxPerSec=parseFloat(root.getAttribute('data-marquee-speed'))||40;
  var prefersReducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(prefersReducedMotion)return; // tôn trọng thiết lập giảm chuyển động: không chạy marquee, giữ cuộn tay thường
  // halfWidth phải dựa trên giới hạn cuộn THỰC TẾ của trình duyệt
  // (scrollWidth - clientWidth), không phải track.scrollWidth/2 đơn thuần.
  // Lý do: phần cuối track luôn hiển thị vừa khung nhìn (clientWidth) mà
  // không cần cuộn, nên quãng đường cuộn khả dụng của một "bộ thẻ" là
  // (track.scrollWidth - clientWidth) / 2, không phải track.scrollWidth/2.
  // Nếu tính sai (dùng track.scrollWidth/2), giá trị đích có thể vượt quá
  // giới hạn cuộn vật lý tối đa mà trình duyệt cho phép, khiến scrollLeft
  // bị ghim cứng ở mức trần trong khi thuật toán vẫn tưởng đang cuộn tiếp.
  var halfWidth=(track.scrollWidth-root.clientWidth)/2;
  var isPaused=false;
  var isDragging=false,dragMoved=false,startX=0,startScroll=0;
  var lastTs=null;
  // scrollLeft của trình duyệt chỉ lưu số nguyên (làm tròn), nên mỗi khung
  // hình chỉ dịch dưới 1px sẽ bị làm tròn LÊN liên tục, gây tốc độ thực tế
  // cao hơn cấu hình nhiều lần. Dùng biến riêng lưu giá trị chính xác đầy đủ
  // phần thập phân, chỉ ghi ra scrollLeft (làm tròn) mỗi khung hình.
  var preciseScroll=root.scrollLeft;

  function tick(ts){
    if(lastTs===null)lastTs=ts;
    var dt=(ts-lastTs)/1000;
    lastTs=ts;
    if(!isPaused && !isDragging){
      preciseScroll+=speedPxPerSec*dt;
      if(preciseScroll>=halfWidth){
        preciseScroll-=halfWidth; // quay vòng liền mạch, không giật
      }
      root.scrollLeft=preciseScroll;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function dragStart(x){
    isDragging=true;dragMoved=false;startX=x;startScroll=root.scrollLeft;
  }
  function dragMove(x){
    if(!isDragging)return;
    var dx=x-startX;
    if(Math.abs(dx)>4)dragMoved=true;
    root.scrollLeft=startScroll-dx;
  }
  function dragEnd(){
    if(!isDragging)return;
    isDragging=false;
    // Chuẩn hóa lại vị trí cuộn về trong phạm vi [0, halfWidth) để chuyển
    // động tự động tiếp tục mượt mà, tránh trôi ra ngoài vùng đã nhân đôi.
    if(root.scrollLeft<0)root.scrollLeft+=halfWidth;
    if(root.scrollLeft>=halfWidth)root.scrollLeft-=halfWidth;
    // Đồng bộ lại biến chính xác theo vị trí thực tế sau khi người dùng thả
    // tay, tránh animation tự động nhảy về vị trí cũ trước khi kéo.
    preciseScroll=root.scrollLeft;
  }

  // Cảm ứng (di động)
  root.addEventListener('touchstart',function(e){
    isPaused=true;
    dragStart(e.touches[0].clientX);
  },{passive:true});
  root.addEventListener('touchmove',function(e){
    dragMove(e.touches[0].clientX);
  },{passive:true});
  root.addEventListener('touchend',function(){
    dragEnd();isPaused=false;
  });

  // Chuột kéo (desktop)
  root.addEventListener('mousedown',function(e){
    isPaused=true;
    dragStart(e.clientX);
    e.preventDefault();
  });
  root.addEventListener('mousemove',function(e){
    if(isDragging)dragMove(e.clientX);
  });
  window.addEventListener('mouseup',function(){
    if(isDragging){dragEnd();isPaused=false;}
  });

  // Dừng chuyển động khi con trỏ đang ở trong khu vực (kể cả không kéo)
  root.addEventListener('mouseenter',function(){isPaused=true;});
  root.addEventListener('mouseleave',function(){if(!isDragging)isPaused=false;});

  // Chặn click phát sinh ngay sau một thao tác kéo có di chuyển thực sự,
  // tránh vô tình mở trang hồ sơ khi người dùng chỉ có ý định lướt thẻ.
  root.addEventListener('click',function(e){
    if(dragMoved){e.preventDefault();e.stopPropagation();dragMoved=false;}
  },true);
})();

// 1. Scroll-reveal cho .js-reveal
(function(){
  var els=document.querySelectorAll('.js-reveal');
  if(!els.length)return;
  if(!('IntersectionObserver' in window)){els.forEach(function(el){el.classList.add('is-visible');});return;}
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){en.target.classList.add('is-visible');io.unobserve(en.target);}
    });
  },{threshold:0.1,rootMargin:'0px 0px -40px 0px'});
  els.forEach(function(el){io.observe(el);});
})();

// 3. Tắt skeleton shimmer khi ảnh tải xong
(function(){
  document.querySelectorAll('img[loading="lazy"]').forEach(function(img){
    if(img.complete){img.classList.add('img-loaded');return;}
    img.addEventListener('load',function(){img.classList.add('img-loaded');});
    img.addEventListener('error',function(){img.classList.add('img-loaded');});
  });
})();

// 4. Cursor tùy chỉnh (chỉ thiết bị có chuột thật)
(function(){
  if(!window.matchMedia('(hover:hover)').matches)return;
  var dot=document.createElement('div');
  dot.className='cursor-dot';
  document.body.appendChild(dot);
  document.addEventListener('mousemove',function(e){
    dot.style.left=e.clientX+'px';dot.style.top=e.clientY+'px';dot.classList.add('is-active');
  });
  document.addEventListener('mouseleave',function(){dot.classList.remove('is-active');});
  document.querySelectorAll('a,button,.card,.profile-card,.poster-card').forEach(function(el){
    el.addEventListener('mouseenter',function(){dot.classList.add('is-hover');});
    el.addEventListener('mouseleave',function(){dot.classList.remove('is-hover');});
  });
})();

// 5. Progress bar đọc bài (chỉ hiện trên trang có .article-body)
(function(){
  var article=document.querySelector('.article-body');
  if(!article)return;
  var bar=document.createElement('div');
  bar.className='read-progress';
  document.body.appendChild(bar);
  var ticking=false;
  function update(){
    ticking=false;
    var docH=document.documentElement.scrollHeight-window.innerHeight;
    var scrolled=window.scrollY;
    var pct=docH>0?(scrolled/docH*100):0;
    bar.style.width=Math.min(Math.max(pct,0),100)+'%';
  }
  function onScroll(){
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);
  update();
})();

// 9. Sticky header mượt — thêm bóng đổ nhẹ khi đã cuộn khỏi đầu trang,
// giúp masthead nổi rõ hơn trên nội dung khi dính trần (position:sticky).
// rAF-throttle giống mọi scroll listener khác trong file này, chỉ đổi 1
// class, không đụng vị trí/kích thước -> không ảnh hưởng Core Web Vitals.
(function(){
  var header=document.querySelector('.masthead');
  if(!header)return;
  var ticking=false;
  function update(){
    ticking=false;
    header.classList.toggle('is-scrolled',window.scrollY>4);
  }
  function onScroll(){
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll',onScroll,{passive:true});
  update();
})();

// 6. Command palette (Ctrl/Cmd+K) — điều hướng nhanh tới tìm kiếm
(function(){
  document.addEventListener('keydown',function(e){
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
      e.preventDefault();
      window.location.href='search.html';
    }
  });
})();

// 8. Parallax nhẹ cho hero khi cuộn — Hero Parallax Controller.
// Áp dụng cho ĐÚNG 1 slide tại một thời điểm: media + content của slide
// đang active (không phải luôn slide đầu tiên). Khi Hero Slideshow đổi
// slide (sự kiện 'heroslidechange' do IIFE slideshow phía trên phát ra),
// tự bind sang media/content của slide mới; slide không active không bao
// giờ được ghi transform. Hero tĩnh (không slideshow, chỉ 1 bài) vẫn hoạt
// động như cũ. Ảnh và chữ dịch chuyển ở 2 TỐC ĐỘ KHÁC NHAU khi cuộn (ảnh
// nhanh hơn, chữ chậm hơn) để tạo cảm giác chiều sâu (depth) — chữ như ở
// gần người xem hơn nền phía sau.
(function(){
  var heroSection=document.querySelector('.hero-full');
  if(!heroSection||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var slideshowRoot=document.querySelector('[data-slideshow]');
  var MEDIA_RATE=0.25;
  var CONTENT_RATE=0.12;
  var activeMedia=null,activeContent=null;

  function findActiveSlideScope(){
    return slideshowRoot
      ? slideshowRoot.querySelector('.hero-full-slide.is-active')
      : heroSection;
  }
  function findActiveMedia(scope){
    var media=scope&&scope.querySelector('.hero-full__media');
    return media?media.querySelector('img,.media__zoom'):null;
  }

  var ticking=false;
  function applyTransform(){
    ticking=false;
    var y=window.scrollY;
    if(y>=window.innerHeight)return;
    if(activeMedia)activeMedia.style.transform='translateY('+(y*MEDIA_RATE)+'px)';
    if(activeContent)activeContent.style.transform='translateY('+(y*CONTENT_RATE)+'px)';
  }
  function onScroll(){
    if(ticking)return;
    ticking=true;
    requestAnimationFrame(applyTransform);
  }

  function bindActiveSlide(){
    var scope=findActiveSlideScope();
    var nextMedia=findActiveMedia(scope);
    var nextContent=scope?scope.querySelector('.hero-full__content'):null;
    if(nextMedia===activeMedia&&nextContent===activeContent)return;
    // Slide rời đi: xoá transform cũ, tránh lệch hình khi quay vòng lại.
    if(activeMedia)activeMedia.style.transform='';
    if(activeContent)activeContent.style.transform='';
    activeMedia=nextMedia;activeContent=nextContent;
    applyTransform(); // áp ngay theo vị trí cuộn hiện tại, không chờ sự kiện scroll kế tiếp
  }

  bindActiveSlide();
  window.addEventListener('scroll',onScroll,{passive:true});
  if(slideshowRoot)slideshowRoot.addEventListener('heroslidechange',bindActiveSlide);
})();

// PWA: đăng ký service worker
if('serviceWorker' in navigator){
  window.addEventListener('load',function(){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  });
}

// 6. Web Share API — ưu tiên share sheet gốc trên thiết bị hỗ trợ
(function(){
  if(!navigator.share)return;
  document.querySelectorAll('.share-native').forEach(function(btn){
    btn.hidden=false;
    btn.addEventListener('click',function(){
      navigator.share({title:btn.getAttribute('data-title'),url:btn.getAttribute('data-url')}).catch(function(){});
    });
  });
})();

// 5. Infinite scroll cho trang series — hiện thêm 8 bài mỗi lần cuộn tới cuối
(function(){
  var sentinel=document.querySelector('.js-infinite-sentinel');
  if(!sentinel)return;
  var hidden=document.querySelectorAll('.js-infinite-item[style*="display:none"]');
  if(!hidden.length)return;
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        var next=document.querySelectorAll('.js-infinite-item[style*="display:none"]');
        for(var i=0;i<Math.min(8,next.length);i++){next[i].style.display='';}
        if(document.querySelectorAll('.js-infinite-item[style*="display:none"]').length===0){
          io.unobserve(sentinel);
        }
      }
    });
  },{rootMargin:'200px'});
  io.observe(sentinel);
})();

// 7. Reader Mode — ẩn header/sidebar quảng cáo, chỉ hiện nội dung
(function(){
  var btn=document.querySelector('.reader-mode-toggle');
  if(!btn)return;
  btn.addEventListener('click',function(){
    document.body.classList.toggle('reader-mode');
    btn.textContent=document.body.classList.contains('reader-mode')?'Thoát chế độ đọc':'Chế độ đọc';
  });
})();

// 2. Text scramble cho tiêu đề hero — chỉ chạy 1 lần khi tải trang
(function(){
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  document.querySelectorAll('.js-scramble').forEach(function(h1){
    var link=h1.querySelector('a');
    var target=link?link:h1;
    var finalText=target.textContent;
    var len=finalText.length;
    var frame=0;
    var totalFrames=Math.min(len*2,40);
    function tick(){
      var out='';
      for(var i=0;i<len;i++){
        var charProgress=frame-i*1.2;
        if(charProgress>=totalFrames*0.4){out+=finalText[i];}
        else if(finalText[i]===' '){out+=' ';}
        else{out+=CHARS[Math.floor(Math.random()*CHARS.length)];}
      }
      target.textContent=out;
      frame++;
      if(frame<totalFrames+len*1.2){requestAnimationFrame(tick);}
      else{target.textContent=finalText;}
    }
    requestAnimationFrame(tick);
  });
})();

// 1. Magnetic hover — chỉ thiết bị có chuột thật, cường độ nhẹ
(function(){
  if(!window.matchMedia('(hover:hover)').matches)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  var STRENGTH=0.25;
  document.querySelectorAll('.btn--solid, .hero-full__cta').forEach(function(el){
    el.classList.add('magnetic');
    el.addEventListener('mousemove',function(e){
      var r=el.getBoundingClientRect();
      var x=(e.clientX-r.left-r.width/2)*STRENGTH;
      var y=(e.clientY-r.top-r.height/2)*STRENGTH;
      el.style.transform='translate('+x+'px,'+y+'px)';
    });
    el.addEventListener('mouseleave',function(){el.style.transform='';});
  });
})();

// 4. Count-up cho số liệu — loại trừ phần tử trong marquee (đã nhân đôi
// DOM để loop vô hạn), chỉ áp dụng ở lưới tĩnh (trang danh mục, hero riêng)
(function(){
  var els=document.querySelectorAll('.js-count');
  if(!els.length)return;
  var targets=[],staticEls=[];
  els.forEach(function(el){
    if(el.closest('.profiles-spotlight--marquee')){staticEls.push(el);}
    else{targets.push(el);}
  });
  // Phần tử trong marquee: hiện số thật ngay lập tức, không animate
  // (đã nhân đôi DOM để loop vô hạn, animate riêng lẻ sẽ gây lệch hình).
  staticEls.forEach(function(el){el.textContent=el.getAttribute('data-count');});
  if(!targets.length)return;
  function animate(el){
    var target=parseInt(el.getAttribute('data-count'),10)||0;
    var dur=900,start=null;
    function step(ts){
      if(start===null)start=ts;
      var p=Math.min((ts-start)/dur,1);
      el.textContent=Math.round(target*(1-Math.pow(1-p,3)));
      if(p<1)requestAnimationFrame(step);else el.textContent=target;
    }
    requestAnimationFrame(step);
  }
  if(!('IntersectionObserver' in window)){
    targets.forEach(function(el){el.textContent=el.getAttribute('data-count');});
    return;
  }
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){animate(en.target);io.unobserve(en.target);}
    });
  },{threshold:0.3});
  targets.forEach(function(el){io.observe(el);});
})();
// Sticky Bottom Banner (V3.0 Promotion System) — mặc định ẩn bằng CSS;
// chỉ hiện sau khi xác nhận chiến dịch này chưa bị người dùng đóng trong
// thời hạn "Hiện lại sau". Đóng banner ghi mốc thời gian vào localStorage
// theo đúng slug chiến dịch — đổi chiến dịch khác thì tự hiện lại ngay,
// không cần biên tập viên phải làm gì thêm.
(function(){
  var el=document.getElementById('promoStickyBanner');
  if(!el)return;
  var STORAGE_PREFIX='tnc_promo_dismissed_';
  var slug=el.getAttribute('data-campaign');
  var dismissible=el.getAttribute('data-dismissible')==='1';
  var dismissDays=parseInt(el.getAttribute('data-dismiss-days'),10)||0;
  function reveal(){
    el.classList.add('is-visible');
    document.body.classList.add('has-promo-sticky-banner');
  }
  if(dismissible){
    try{
      var raw=localStorage.getItem(STORAGE_PREFIX+slug);
      if(raw){
        var dismissedAt=parseInt(raw,10);
        var expiresAt=dismissedAt+dismissDays*86400000;
        if(!isNaN(dismissedAt)&&Date.now()<expiresAt)return; // vẫn trong thời hạn ẩn, không hiện lại
      }
    }catch(_err){}
  }
  reveal();
  var closeBtn=el.querySelector('.promo-banner__close');
  if(closeBtn){
    closeBtn.addEventListener('click',function(){
      el.classList.remove('is-visible');
      document.body.classList.remove('has-promo-sticky-banner');
      if(dismissible){
        try{localStorage.setItem(STORAGE_PREFIX+slug,String(Date.now()));}catch(_err){}
      }
    });
  }
})();
// BadgePopover: bấm vào BadgeChip/HonorChip/MedalChip (Rev 16) để mở popover
// chi tiết (nhóm/độ hiếm/mô tả, hoặc tên+mô tả huân chương) — bấm lại hoặc
// bấm ra ngoài để đóng. Tooltip (hover, desktop) xử lý thuần bằng CSS; tap
// (mobile) dùng đúng cơ chế click-toggle này, không cần xử lý riêng.
(function(){
  var openChip=null;
  function closeOpen(){
    if(openChip){openChip.classList.remove('is-open');openChip=null;}
  }
  document.addEventListener('click',function(e){
    var chip=e.target.closest('.badge-chip,.honor-chip,.medal-chip');
    if(chip){
      var wasOpen=chip.classList.contains('is-open');
      closeOpen();
      if(!wasOpen){chip.classList.add('is-open');openChip=chip;}
      e.stopPropagation();
      return;
    }
    closeOpen();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeOpen();});
})();
// Masthead date (real-time): #mastheadDate được server-render sẵn 1 giá trị
// tĩnh tại thời điểm build (TODAY_VN, xem masthead()) — nếu site không được
// build lại mỗi ngày, chuỗi này "đứng yên" theo ngày build cũ. Script này ghi
// đè lại đúng ngày/thứ THẬT theo giờ Sài Gòn mỗi lần trang được mở (và làm
// mới mỗi phút, phòng trường hợp mở tab qua nửa đêm) — không phụ thuộc build
// lại site nữa. Bọc try/catch: nếu Intl.DateTimeFormat lỗi/không hỗ trợ
// (trình duyệt rất cũ), giữ nguyên chuỗi server-render, không làm hỏng trang.
(function(){
  var el=document.getElementById('mastheadDate');
  if(!el) return;
  var THU={Sunday:'Chủ Nhật',Monday:'Thứ Hai',Tuesday:'Thứ Ba',Wednesday:'Thứ Tư',Thursday:'Thứ Năm',Friday:'Thứ Sáu',Saturday:'Thứ Bảy'};
  function render(){
    try{
      var parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());
      var map={};
      parts.forEach(function(p){map[p.type]=p.value;});
      var thu=THU[map.weekday]||map.weekday;
      el.textContent=thu+' · '+map.day+'.'+map.month+'.'+map.year+' · Sài Gòn';
    }catch(e){/* giữ nguyên chuỗi server-render */}
  }
  render();
  setInterval(render,60000);
})();
// Editor article filter (PR4): chỉ ẩn/hiện các hàng bài viết theo
// data-series/data-year/data-categories đã render sẵn — không tính toán lại
// bất kỳ số liệu biên tập nào (mọi số liệu vẫn do build.py sinh).
(function(){
  var filterBar=document.querySelector('.editor-filter');
  if(!filterBar) return;
  var rows=document.querySelectorAll('[data-series]');
  var selects=filterBar.querySelectorAll('select[data-filter]');
  function apply(){
    var f={};
    selects.forEach(function(s){f[s.dataset.filter]=s.value;});
    rows.forEach(function(row){
      var okSeries=!f.series || row.dataset.series===f.series;
      var okYear=!f.year || row.dataset.year===f.year;
      var cats=(row.dataset.categories||'').split('|');
      var okCategories=!f.categories || cats.indexOf(f.categories)>-1;
      row.hidden=!(okSeries&&okYear&&okCategories);
    });
  }
  selects.forEach(function(s){s.addEventListener('change',apply);});
})();
// Author Card (PR4.1, +MedalChip Rev 16): cả khung .author-box là 1 link tới
// trang hồ sơ, nhưng BadgeChip/HonorChip/MedalChip bên trong cần click độc
// lập để mở đúng BadgePopover hiện có (không điều hướng nhầm sang trang hồ
// sơ). Không đổi BadgePopover/BadgeTooltip hiện có — chỉ chặn hành vi điều
// hướng mặc định của <a> bao ngoài khi click trúng chip, ở capture phase
// (chạy trước khi <a> điều hướng).
document.addEventListener('click',function(e){
  var chip=e.target.closest('.author-box .badge-chip,.author-box .honor-chip,.author-box .medal-chip');
  if(chip) e.preventDefault();
},true);
</script>
""" + analytics_script_tag() + """
</body>
</html>"""

def article_url(slug): return f"article-{slug}.html"
def series_url(slug): return f"series-{slug}.html"
def tag_url(slug): return f"tag-{slug}.html"
def category_url(slug): return f"category-{slug}.html"

def art_code(article):
    """Mã lưu trữ bài viết: TNC·ITC·001"""
    s = SERIES_BY_SLUG[article["series"]]
    idx = ARTICLES_BY_SERIES[article["series"]].index(article) + 1
    return f"{s['code']}·{idx:03d}"

def is_community_poster(article):
    """Xác định một bài viết có nên hiển thị dạng poster dọc hay không:
    phải thuộc series TNC Community VÀ đã có ảnh poster. Nếu thuộc
    TNC Community nhưng chưa có poster, bài vẫn hiển thị dạng thẻ chuẩn
    (graceful fallback), tránh vỡ giao diện khi thiếu ảnh."""
    return article.get("series") == "tnc-community" and bool(article.get("poster"))

def render_poster_card(a):
    """Sinh thẻ poster dọc cho một bài viết TNC Community. Bấm vào dẫn
    thẳng tới trang bài viết đầy đủ — không có khung riêng, kế thừa
    hạ tầng bài viết chuẩn (tác giả, chia sẻ, SEO)."""
    return f"""
      <a class="poster-card" href="{article_url(a['slug'])}">
        <div class="poster-card__media">
          <img src="{a['poster']}" alt="{_esc(a['title'])}" loading="lazy">
          <span class="poster-card__archive">{art_code(a)}</span>
        </div>
        <div class="poster-card__body">
          <h3 class="poster-card__title">{_esc(a['title'])}</h3>
          <span class="poster-card__meta">{a['date']}</span>
        </div>
      </a>"""

def zoom(article, eager=False):
    """Trả về lớp media bên trong: ảnh bìa nếu có, ngược lại placeholder gradient.
    eager=True: bỏ lazy-load, dùng cho ảnh LCP (hero) để cải thiện tốc độ tải."""
    cover = article.get("cover") if article else ""
    if cover:
        loading_attr = 'fetchpriority="high"' if eager else 'loading="lazy"'
        return f'<img class="media__zoom" src="{cover}" alt="" {loading_attr}>'
    return '<div class="media__zoom"></div>'

def author_slug(name):
    """Chuyển tên tác giả thành slug file: 'TNC Editorial' -> 'tnc-editorial'."""
    import unicodedata
    s = unicodedata.normalize('NFD', name).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or "tnc"

def author_url(name):
    return f"author-{author_slug(name)}.html"

def profile_url(slug):
    return f"profile-{slug}.html"

def author_byline_html(author_name):
    """Sinh khối avatar + tên tác giả cho trang bài viết.
    Nếu tác giả có hồ sơ trong content/editors/: hiện ảnh thật (nếu có) + tên dạng liên kết.
    Nếu không có hồ sơ: hiện tên dạng chữ thường, không liên kết, avatar giữ ô trống mặc định."""
    ed = EDITORS.get(author_name)
    if ed:
        if ed["avatar"]:
            avatar_html = f'<img src="{ed["avatar"]}" alt="{author_name}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;display:block;">'
        else:
            avatar_html = '<div style="width:40px;height:40px;border-radius:50%;background:var(--c-bg-subtle);"></div>'
        name_html = f'<a href="{author_url(author_name)}">{author_name}</a>'
    else:
        avatar_html = '<div style="width:40px;height:40px;border-radius:50%;background:var(--c-bg-subtle);"></div>'
        name_html = author_name
    return (f'<div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-4) 0;'
            f'border-top:1px solid var(--c-line);border-bottom:1px solid var(--c-line);">'
            f'{avatar_html}<div><div style="font-weight:700;font-size:var(--t-sm);">{name_html}</div>')

def author_bio_box_html(author_name):
    """Sinh khung giới thiệu đầy đủ biên tập viên, đặt cuối mỗi bài viết:
    ảnh đại diện cỡ lớn, tên, Editor Identity System (RoleChip/HonorChip/
    BadgeChip — PR4.1, tái dùng NGUYÊN VẸN component/CSS/JS từ PR2, không
    tạo hệ thống thứ hai), và trọn vẹn tiểu sử. Chỉ hiển thị khi tác giả đã
    có hồ sơ đầy đủ trong CMS (content/editors/) — tự ẩn hoàn toàn nếu
    thiếu, tránh khung trống hoặc thông tin không đầy đủ. Đọc thẳng
    EDITORS[author_name] — không nhân đôi dữ liệu, không thêm trường CMS.

    Toàn bộ khung là 1 link duy nhất tới trang hồ sơ (author_url) — chưa có
    route "/editors/{slug}" riêng trong kiến trúc site tĩnh này nên tái dùng
    đúng route hiện có, không phát minh route mới. Badge/Honor bên trong vẫn
    click/hover độc lập để mở đúng BadgeTooltip/BadgePopover hiện có (không
    điều hướng nhầm) — xem guard JS trong footer()."""
    ed = EDITORS.get(author_name)
    if not ed or not ed.get("bio"):
        return ""
    avatar_html = (f'<img src="{ed["avatar"]}" alt="{author_name}" class="author-box__avatar">'
                   if ed["avatar"] else '<div class="author-box__avatar"></div>')

    role_chip_html = render_role_chip(ed.get("role_id") or "bien-tap-vien")

    # Honor "(nếu có)": khung compact cuối bài chỉ hiện 1 vinh danh (khác với
    # Editor Profile Hero hiện TẤT CẢ honors) — vinh danh đầu tiên đã nhập.
    honor_ids = ed.get("honor_ids", [])
    honor_html = render_honor_chip(honor_ids[0]) if honor_ids else ""
    honor_section = f'<div class="author-box__honor">{honor_html}</div>' if honor_html else ""

    # Badge: tối đa 3, phần còn lại gộp vào chip "+N" (render_badge_overflow_chip).
    badge_ids = ed.get("badge_ids", [])
    badges_html = "".join(render_badge_chip(b) for b in badge_ids[:3]) + render_badge_overflow_chip(badge_ids[3:])
    badges_section = f'<div class="author-box__badges">{badges_html}</div>' if badges_html else ""

    # Huân chương (Rev 16): nhỏ/tinh gọn, đặt sau badges — không đổi bố cục
    # author-box hiện có, chỉ thêm 1 hàng icon nếu author có huân chương.
    medals_html = render_medals_html(ed.get("medals", []))
    medals_section = f'<div class="author-box__medals">{medals_html}</div>' if medals_html else ""

    return f"""
    <div class="container" style="max-width:680px;">
      <a class="author-box" href="{author_url(author_name)}" aria-label="Xem hồ sơ biên tập viên {author_name}">
        {avatar_html}
        <div class="author-box__body">
          <span class="author-box__label">Về tác giả</span>
          <span class="author-box__name">{author_name}</span>
          <div class="author-box__role">{role_chip_html}</div>
          {honor_section}
          {badges_section}
          {medals_section}
          <p class="author-box__bio">{ed['bio']}</p>
        </div>
      </a>
    </div>"""

def share_bar(a, path):
    """Thanh nút chia sẻ mạng xã hội cho một bài viết."""
    import urllib.parse
    url = f"{SITE_URL}/{path}"
    u = urllib.parse.quote(url, safe='')
    t = urllib.parse.quote(a["title"], safe='')
    fb = f"https://www.facebook.com/sharer/sharer.php?u={u}"
    x = f"https://twitter.com/intent/tweet?url={u}&text={t}"
    return f"""
    <div class="share-bar" aria-label="Chia sẻ bài viết">
      <span class="share-bar__label">Chia sẻ</span>
      <button class="share-btn share-native" data-url="{url}" data-title="{_esc(a['title'])}" type="button" hidden>Chia sẻ...</button>
      <a class="share-btn" href="{fb}" target="_blank" rel="noopener" aria-label="Chia sẻ Facebook">Facebook</a>
      <a class="share-btn" href="{x}" target="_blank" rel="noopener" aria-label="Chia sẻ X">X</a>
      <button class="share-btn share-copy" data-url="{url}" type="button">Sao chép link</button>
    </div>"""


# -----------------------------------------------------------------
# RENDER: INDEX
# -----------------------------------------------------------------
def render_hero_slideshow(slides):
    """Khối hero toàn màn hình dạng ảnh nền, tiêu đề/mô tả/nút đè lên góc dưới trái
    (bố cục tham chiếu Complex.com). Tự động chuyển giữa các bài mới nhất sau
    mỗi 5 giây. Người dùng chủ động chuyển bằng thao tác vuốt (di động) hoặc
    kéo chuột (desktop) — không dùng nút bấm hay chấm chỉ báo, giữ giao diện
    ảnh sạch, không bị che khuất. Nếu chỉ có 1 bài, hiển thị tĩnh."""
    if not slides:
        return ""

    if len(slides) == 1:
        a = slides[0]
        s = SERIES_BY_SLUG[a["series"]]
        return f"""
  <section class="hero-full">
    <div class="hero-full__media">{zoom(a, eager=True)}<div class="hero-full__scrim"></div></div>
    <div class="hero-full__content">
      <span class="hero-full__eyebrow eyebrow{s['accent']}">{s['name']}</span>
      <h1 class="hero-full__title js-scramble"><a href="{article_url(a['slug'])}">{_esc(a['title'])}</a></h1>
      <p class="hero-full__dek">{_esc(a['dek'])}</p>
      <a href="{article_url(a['slug'])}" class="hero-full__cta">Đọc bài</a>
    </div>
  </section>"""

    slides_html = ""
    for i, a in enumerate(slides):
        s = SERIES_BY_SLUG[a["series"]]
        active_cls = " is-active" if i == 0 else ""
        scramble_cls = " js-scramble" if i == 0 else ""
        title_tag = "h1" if i == 0 else "p"
        slides_html += f"""
      <div class="hero-full-slide{active_cls}" data-slide-index="{i}">
        <div class="hero-full__media">{zoom(a, eager=(i==0))}<div class="hero-full__scrim"></div></div>
        <div class="hero-full__content">
          <span class="hero-full__eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <{title_tag} class="hero-full__title{scramble_cls}"><a href="{article_url(a['slug'])}">{_esc(a['title'])}</a></{title_tag}>
          <p class="hero-full__dek">{_esc(a['dek'])}</p>
          <a href="{article_url(a['slug'])}" class="hero-full__cta">Đọc bài</a>
        </div>
      </div>"""

    return f"""
  <section class="hero-full hero-slideshow" data-slideshow data-slide-interval="5000">
    <div class="hero-slideshow__track">{slides_html}
    </div>
    <div class="hero-progress" aria-hidden="true"><div class="hero-progress__bar"></div></div>
  </section>"""

def render_gif_hero():
    """Module 2 — Hero Manager (Rev 8). Ưu tiên slot đang active từ Supabase
    (bảng hero_slots, priority cao nhất trong khoảng ngày); rỗng/chưa cấu
    hình thì fallback nguyên xi khung GIF hero cũ đọc từ SETTINGS
    (content/settings/site.yml). Không phát âm thanh — chỉ là khối trình
    diễn hình ảnh. Ẩn hoàn toàn nếu chưa cấu hình ở cả 2 nguồn."""
    slots = load_hero_slots()
    slot = slots[0] if slots else None
    if slot:
        media_url = (slot.get("desktop") or {}).get("url", "")
        title = slot.get("title") or ""
        subtitle = slot.get("subtitle") or ""
        info = ""
        if title or subtitle:
            info = f"""
      <div class="gif-hero__info">
        <span class="gif-hero__label">Đang vang lên</span>
        <span class="gif-hero__song">{title}</span>
        <span class="gif-hero__artist">{subtitle}</span>
      </div>"""
        media_tag = (
            f'<video src="{media_url}" autoplay loop muted playsinline class="gif-hero__img"></video>'
            if _is_video_file(media_url)
            else f'<img src="{media_url}" alt="{title or "The New Culture"}" class="gif-hero__img">'
        )
        return f"""
  <section class="gif-hero">
    {media_tag}
    {info}
  </section>
"""

    # Rev 12: fallback GIF hero giờ đọc từ SITE_SETTINGS (Dashboard), tự rơi
    # về SETTINGS (site.yml) qua fallback đã có sẵn trong load_site_settings().
    gif = SITE_SETTINGS["hero_gif_image"]
    if not gif:
        return ""
    title = SITE_SETTINGS["hero_gif_song_title"]
    artist = SITE_SETTINGS["hero_gif_song_artist"]
    info = ""
    if title or artist:
        info = f"""
      <div class="gif-hero__info">
        <span class="gif-hero__label">Đang vang lên</span>
        <span class="gif-hero__song">{title}</span>
        <span class="gif-hero__artist">{artist}</span>
      </div>"""
    return f"""
  <section class="gif-hero">
    <img src="{gif}" alt="{title or 'The New Culture'}" class="gif-hero__img">
    {info}
  </section>
"""

def render_spotify_block():
    """Khối nhúng Spotify riêng biệt, độc lập với khung GIF. Ẩn nếu chưa cấu hình."""
    url = SITE_SETTINGS["spotify_embed_url"]
    if not url:
        return ""
    return f"""
  <section class="container spotify-block">
    <div class="section-head"><h2>Đang nghe</h2></div>
    <iframe src="{url}" width="100%" height="152" frameborder="0" allowfullscreen=""
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy" title="Spotify player"></iframe>
  </section>
"""

def latest_ranking_article():
    """Tìm bài có bảng xếp hạng (ranking không rỗng), ưu tiên bài mới nhất theo order."""
    candidates = [a for a in ARTICLES if a.get("ranking")]
    return candidates[0] if candidates else None

def render_ranking_spotlight():
    """Khối BXH TNC Selects cố định trên trang chủ — luôn hiện bài ranking mới nhất.
    Bố cục hàng ngang: số hạng lớn + ảnh thumbnail tĩnh + tên bài/nghệ sĩ.
    Chỉ hiện thumbnail — không nhúng trình phát YouTube (giữ trang chủ nhẹ)."""
    a = latest_ranking_article()
    if not a:
        return ""
    s = SERIES_BY_SLUG[a["series"]]
    top_items = a["ranking"][:5]
    rows = ""
    for it in top_items:
        if it["cover"]:
            img = f'<img src="{it["cover"]}" alt="" loading="lazy">'
        elif it["youtube"]:
            img = f'<img src="https://img.youtube.com/vi/{it["youtube"]}/hqdefault.jpg" alt="" loading="lazy">'
        else:
            img = '<div class="spot-row__ph"></div>'
        play_badge = '<span class="spot-row__play">▶</span>' if it["youtube"] else ""
        artist = f'<span class="spot-row__artist">{it["artist"]}</span>' if it["artist"] else ""
        rows += f"""
      <a class="spot-row" href="{article_url(a['slug'])}">
        <span class="spot-row__num">{it['rank']:02d}</span>
        <span class="spot-row__media">{img}{play_badge}</span>
        <span class="spot-row__body">
          <span class="spot-row__song">{it['song']}</span>
          {artist}
        </span>
      </a>"""
    more_count = len(a["ranking"]) - len(top_items)
    more_note = f'<span class="spot-more-note">+{more_count} mục khác trong bài</span>' if more_count > 0 else ""
    return f"""
  <section class="ranking-spotlight js-reveal">
    <div class="container">
      <div class="section-head">
        <h2>Bảng Xếp Hạng — {s['name']}</h2>
        <a class="more" href="{article_url(a['slug'])}">Xem toàn bộ →</a>
      </div>
      <a class="ranking-spotlight__title-link" href="{article_url(a['slug'])}">{_esc(a['title'])}</a>
      <div class="spot-rows">{rows}
      </div>
      {more_note}
    </div>
  </section>
"""

def select_hero_articles(articles, count=3):
    """Chọn đúng `count` bài (mặc định 3) cho Hero trang chủ, theo 2 bước:
    Bước 1: mọi bài có hero_priority=true, mới nhất trước (tái dùng
    _parse_vn_date — cùng cách sắp xếp "mới nhất trước" đã dùng cho
    PROFILE_ARTICLES, không phát minh lại logic ngày tháng).
    Bước 2: nếu chưa đủ `count`, lấp các vị trí còn lại bằng bài mới nhất
    trong số CÒN LẠI (chưa được chọn ở bước 1) — không bao giờ trùng bài.
    Nếu nhiều hơn `count` bài có hero_priority=true, chỉ lấy `count` bài mới
    nhất trong số đó (không tràn ra bước 2).
    Articles không có khái niệm draft/published riêng (khác Magazine Issue) —
    mọi bài trong `articles` (đã qua load_articles()) coi như đã xuất bản,
    nên không cần lọc trạng thái ở đây."""
    priority = sorted(
        (a for a in articles if a.get("hero_priority")),
        key=lambda a: _parse_vn_date(a["date"]),
        reverse=True,
    )
    hero = priority[:count]
    if len(hero) < count:
        chosen = {a["slug"] for a in hero}
        rest = sorted(
            (a for a in articles if a["slug"] not in chosen),
            key=lambda a: _parse_vn_date(a["date"]),
            reverse=True,
        )
        hero += rest[: count - len(hero)]
    return hero

def _compute_homepage_ctx():
    """Dữ liệu tính 1 LẦN, dùng chung cho mọi khối trang chủ (Hero/Tin nổi
    bật/Bài viết mới...) — đúng yêu cầu hiệu năng "không query lặp" của Rev
    17 (Layout Builder). Tách riêng khỏi render_index()/render_homepage_blocks()
    để cả 2 đường render (Block Engine và fallback hardcode) dùng chung
    đúng 1 logic chọn Hero/Cover Story, không lệch nhau."""
    # Hero trang chủ: luôn đúng 3 bài, chọn theo hero_priority rồi mới nhất
    # (select_hero_articles — đã tự loại trùng, không cần lọc thêm ở đây).
    slide_articles = select_hero_articles(ARTICLES)

    # Câu chuyện nổi bật (Cover Story): TRƯỚC ĐÂY cố định lấy đúng bài thứ 5
    # theo sort_order thủ công, không bao giờ đổi trừ khi biên tập viên tự
    # sắp lại sort_order, kể cả khi có bài mới hoặc bài được đánh dấu
    # "featured" — đây là lý do khối này "đứng yên" theo thời gian. Sửa: ưu
    # tiên bài featured=true MỚI NHẤT (theo published_at thật, tái dùng
    # _parse_vn_date — cùng cách "mới nhất trước" đã dùng cho
    # select_hero_articles ở trên, không phát minh lại logic ngày tháng);
    # nếu chưa bài nào được đánh dấu featured, dùng bài mới nhất nói chung.
    # Loại trừ các bài đã dùng cho Hero slide để không lặp lại ngay bên dưới.
    hero_slugs = {a["slug"] for a in slide_articles}
    feat_pool = [a for a in ARTICLES if a["slug"] not in hero_slugs] or ARTICLES
    featured_only = sorted(
        (a for a in feat_pool if a.get("featured")),
        key=lambda a: _parse_vn_date(a["date"]),
        reverse=True,
    )
    if featured_only:
        feat = featured_only[0]
    elif feat_pool:
        feat = max(feat_pool, key=lambda a: _parse_vn_date(a["date"]))
    else:
        feat = None
    return {"slide_articles": slide_articles, "feat": feat}


def _render_hardcoded_homepage_body(ctx):
    """Fallback BẮT BUỘC (Rev 17): thân trang chủ y HỆT bản hardcode trước
    Layout Builder — dùng khi chưa có page_layouts active cho 'homepage'
    (site mới/CSDL chưa migrate) hoặc load_page_layout() lỗi. Không được sửa
    nội dung hàm này để khác với các hàm _render_block_* — 2 bên PHẢI tạo ra
    HTML tương đương (đã verify bằng build.py chạy qua mock PostgREST, xem
    báo cáo Rev 17), giữ hàm riêng ở đây là để có 1 bản KHÔNG BAO GIỜ đổi
    theo cấu hình Layout Builder, đảm bảo đúng yêu cầu "chưa có dữ liệu thì
    render giống hệt production hiện tại"."""
    slide_articles = ctx["slide_articles"]
    feat = ctx["feat"]
    fs = SERIES_BY_SLUG[feat["series"]] if feat else None

    trending = ""
    for i, a in enumerate(ARTICLES[:6], 1):
        s = SERIES_BY_SLUG[a["series"]]
        trending += f"""
      <a class="trending__item" href="{article_url(a['slug'])}">
        <span class="trending__num">{i:02d}</span>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3>{_esc(a['title'])}</h3>
        </div>
      </a>"""

    cells = ""
    for s in SERIES:
        cells += f"""
      <a class="series-cell" href="{series_url(s['slug'])}">
        <span class="series-cell__code">{s['code']} · {s['num']}</span>
        <h3>{s['name']}</h3>
        <p>{s['desc']}</p>
      </a>"""

    latest_pool = sorted(ARTICLES, key=lambda a: _parse_vn_date(a["date"]), reverse=True)
    latest = ""
    latest_count = 0
    for a in latest_pool:
        if feat and a["slug"] == feat["slug"]:
            continue
        if latest_count >= 6:
            break
        s = SERIES_BY_SLUG[a["series"]]
        latest += f"""
      <a class="card" href="{article_url(a['slug'])}">
        <div class="media media--3-2">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{_esc(a['title'])}</h3>
        <span class="byline">{a['author']} · {a['date']}</span>
      </a>"""
        latest_count += 1

    return f"""{render_gif_hero()}{render_spotify_block()}
{render_hero_slideshow(slide_articles)}
<main>
  <section class="section container cover-story js-reveal">
    <div class="section-head"><h2>Câu chuyện nổi bật</h2></div>
    <div class="feature">
      <a href="{article_url(feat['slug'])}" aria-hidden="true" tabindex="-1">
        <div class="media media--16-9">{zoom(feat)}<span class="archive-code">{art_code(feat)}</span></div>
      </a>
      <div>
        <span class="eyebrow eyebrow{fs['accent']}">{fs['name']}</span>
        <h2><a href="{article_url(feat['slug'])}">{feat['title']}</a></h2>
        <p>{feat['dek']}</p>
        <a class="btn btn--ghost" href="{article_url(feat['slug'])}">Đọc bài</a>
      </div>
    </div>
  </section>
{render_homepage_magazine_block()}
  <section class="trending container js-reveal">
    <div class="section-head"><h2>Đang được quan tâm</h2></div>
    <div class="trending__grid">{trending}
    </div>
  </section>
{render_ranking_spotlight()}
{render_profiles_homepage_block()}
{render_community_homepage_block()}
  <section class="series-band js-reveal">
    <div class="container">
      <div class="section-head">
        <h2>Series</h2>
        <a class="more" href="all-series.html">{len(SERIES)} tuyến nội dung — bản đồ tri thức TNC</a>
      </div>
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>
{render_homepage_ad_block()}
  <section class="section container js-reveal">
    <div class="section-head"><h2>Mới đăng</h2><a class="more" href="archive.html">Xem thêm →</a></div>
    <div class="grid grid-3">{latest}
    </div>
  </section>
</main>
"""


# ===================================================================
# LAYOUT BUILDER (Rev 17) — Block Engine.
#
# 3 khái niệm tách biệt (xem migrate_rev17_layout_builder.sql):
#   layout_block_types — Registry, CHỈ phục vụ Dashboard (form "Thêm Khối"/
#     cấu hình tự sinh theo config_schema) — build.py KHÔNG đọc bảng này.
#   page_layouts        — 1 "trang" có bố cục quản lý được (page_key).
#   layout_blocks        — các Khối thật trong 1 page_layout (thứ tự/bật-tắt/
#     hiển thị theo thiết bị/điều kiện/lịch chạy/cấu hình riêng).
#
# BLOCK_RENDERERS ánh xạ block_type_key -> hàm Python render — đây là "nửa
# code" của kiến trúc plugin (nửa dữ liệu là layout_block_types ở Dashboard).
# Đăng ký 1 module tương lai = thêm 1 hàng layout_block_types (Dashboard,
# không cần deploy) + thêm 1 hàm ở đây (cần deploy) — build.py không có cách
# nào sinh HTML tuỳ ý từ thuần dữ liệu (trừ custom_html/custom_markdown).
# ===================================================================

def _render_block_gif_hero(block, ctx):
    return render_gif_hero()

def _render_block_spotify(block, ctx):
    return render_spotify_block()

def _render_block_hero(block, ctx):
    return render_hero_slideshow(ctx["slide_articles"])

def _render_block_featured_story(block, ctx):
    """Tin nổi bật — mặc định dùng ctx['feat'] (xem _compute_homepage_ctx).
    config.manual_slug (tuỳ chọn): ghim tay 1 bài cụ thể, bỏ qua logic tự
    động — trả "" an toàn nếu slug không tồn tại/đã bị xoá thay vì lỗi."""
    cfg = block.get("config") or {}
    manual_slug = (cfg.get("manual_slug") or "").strip()
    feat = None
    if manual_slug:
        feat = ARTICLES_BY_SLUG.get(manual_slug)
    if not feat:
        feat = ctx.get("feat")
    if not feat:
        return ""
    fs = SERIES_BY_SLUG[feat["series"]]
    return f"""
  <section class="section container cover-story js-reveal">
    <div class="section-head"><h2>Câu chuyện nổi bật</h2></div>
    <div class="feature">
      <a href="{article_url(feat['slug'])}" aria-hidden="true" tabindex="-1">
        <div class="media media--16-9">{zoom(feat)}<span class="archive-code">{art_code(feat)}</span></div>
      </a>
      <div>
        <span class="eyebrow eyebrow{fs['accent']}">{fs['name']}</span>
        <h2><a href="{article_url(feat['slug'])}">{feat['title']}</a></h2>
        <p>{feat['dek']}</p>
        <a class="btn btn--ghost" href="{article_url(feat['slug'])}">Đọc bài</a>
      </div>
    </div>
  </section>"""

def _render_block_magazine(block, ctx):
    return render_homepage_magazine_block()

def _render_block_trending(block, ctx):
    cfg = block.get("config") or {}
    try:
        limit = max(1, int(cfg.get("limit") or 6))
    except (TypeError, ValueError):
        limit = 6
    trending = ""
    for i, a in enumerate(ARTICLES[:limit], 1):
        s = SERIES_BY_SLUG[a["series"]]
        trending += f"""
      <a class="trending__item" href="{article_url(a['slug'])}">
        <span class="trending__num">{i:02d}</span>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3>{_esc(a['title'])}</h3>
        </div>
      </a>"""
    if not trending:
        return ""
    return f"""
  <section class="trending container js-reveal">
    <div class="section-head"><h2>Đang được quan tâm</h2></div>
    <div class="trending__grid">{trending}
    </div>
  </section>"""

def _render_block_ranking_spotlight(block, ctx):
    return render_ranking_spotlight()

def _render_block_profiles_homepage(block, ctx):
    return render_profiles_homepage_block()

def _render_block_community_homepage(block, ctx):
    return render_community_homepage_block()

def _render_block_series_grid(block, ctx):
    if not SERIES:
        return ""
    cells = ""
    for s in SERIES:
        cells += f"""
      <a class="series-cell" href="{series_url(s['slug'])}">
        <span class="series-cell__code">{s['code']} · {s['num']}</span>
        <h3>{s['name']}</h3>
        <p>{s['desc']}</p>
      </a>"""
    return f"""
  <section class="series-band js-reveal">
    <div class="container">
      <div class="section-head">
        <h2>Series</h2>
        <a class="more" href="all-series.html">{len(SERIES)} tuyến nội dung — bản đồ tri thức TNC</a>
      </div>
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>"""

def _render_block_homepage_ad(block, ctx):
    return render_homepage_ad_block()

def _render_block_latest_articles(block, ctx):
    """"Bài viết mới" — khối cờ đầu, cấu hình đầy đủ theo config_schema
    (migrate_rev17): nguồn dữ liệu/số lượng/cột/hiển thị ảnh-mô tả-ngày.
    Config rỗng (mặc định seed) tái tạo ĐÚNG hành vi "Mới đăng" cũ — đã
    verify bằng build.py qua mock PostgREST (xem báo cáo Rev 17)."""
    cfg = block.get("config") or {}
    # Mặc định "Mới đăng" — ĐÚNG tiêu đề khối này đang hiện trên production
    # (khác "Bài viết mới", chỉ là label của block TYPE trong Danh mục Khối/
    # "Thêm Khối", xem migrate_rev17_layout_builder.sql — 2 chuỗi khác mục
    # đích, không được lẫn) — đảm bảo config rỗng (seed mặc định) render y
    # hệt "Mới đăng" cũ, không đổi tiêu đề ngoài ý muốn.
    title = (cfg.get("title") or "Mới đăng").strip()
    data_source = cfg.get("data_source") or "latest"
    try:
        limit = max(1, int(cfg.get("limit") or 6))
    except (TypeError, ValueError):
        limit = 6
    try:
        columns_desktop = max(1, int(cfg.get("columns_desktop") or 3))
    except (TypeError, ValueError):
        columns_desktop = 3
    try:
        columns_mobile = max(1, int(cfg.get("columns_mobile") or 1))
    except (TypeError, ValueError):
        columns_mobile = 1
    show_image = cfg.get("show_image", True)
    show_excerpt = cfg.get("show_excerpt", False)
    show_date = cfg.get("show_date", True)

    exclude_slug = ctx["feat"]["slug"] if ctx.get("feat") else None
    pool = [a for a in ARTICLES if a["slug"] != exclude_slug]

    if data_source == "manual":
        by_slug = {a["slug"]: a for a in pool}
        picked = [by_slug[s] for s in (cfg.get("manual_slugs") or []) if s in by_slug][:limit]
    elif data_source == "by_series":
        series_slug = cfg.get("series_slug") or ""
        picked = sorted(
            (a for a in pool if a["series"] == series_slug),
            key=lambda a: _parse_vn_date(a["date"]), reverse=True,
        )[:limit]
    elif data_source == "by_category":
        category_slug = cfg.get("category_slug") or ""
        picked = sorted(
            (a for a in pool if a["category"] == category_slug),
            key=lambda a: _parse_vn_date(a["date"]), reverse=True,
        )[:limit]
    elif data_source == "by_tag":
        tag = (cfg.get("tag") or "").strip().lower()
        picked = sorted(
            (a for a in pool if tag and tag in [t.lower() for t in a.get("tags", [])]),
            key=lambda a: _parse_vn_date(a["date"]), reverse=True,
        )[:limit] if tag else []
    elif data_source == "random":
        import random
        picked = random.sample(pool, min(limit, len(pool))) if pool else []
    elif data_source == "most_viewed":
        # "Xem nhiều" cần cột view_count (Phase 6, CHƯA triển khai) — tạm
        # fallback về "Mới nhất" cho tới khi có, không bịa số liệu giả.
        picked = sorted(pool, key=lambda a: _parse_vn_date(a["date"]), reverse=True)[:limit]
    else:  # "latest" (mặc định)
        picked = sorted(pool, key=lambda a: _parse_vn_date(a["date"]), reverse=True)[:limit]

    if not picked:
        return ""

    cards = ""
    for a in picked:
        s = SERIES_BY_SLUG[a["series"]]
        # media_line/excerpt_line: chỉ chèn dòng riêng khi field bật — để
        # trống khi tắt (thay vì luôn có 1 dòng rỗng ở đúng vị trí) mới khớp
        # byte-for-byte với "Mới đăng" cũ lúc show_image=true/show_excerpt=false
        # (mặc định) — đã verify bằng build.py qua mock PostgREST.
        media_line = (
            f'\n        <div class="media media--3-2">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>'
            if show_image else ""
        )
        excerpt_line = f'\n        <p class="card__excerpt">{_esc(a["dek"])}</p>' if show_excerpt else ""
        byline = f'{a["author"]} · {a["date"]}' if show_date else a["author"]
        cards += f"""
      <a class="card" href="{article_url(a['slug'])}">{media_line}
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{_esc(a['title'])}</h3>{excerpt_line}
        <span class="byline">{byline}</span>
      </a>"""

    # columns_desktop=3/columns_mobile=1 (mặc định) -> tái dùng NGUYÊN class
    # .grid-3 cũ (parity byte-for-byte với "Mới đăng" trước đây); chỉ khi
    # biên tập viên đổi số cột mới cần cơ chế CSS biến số tổng quát
    # (.layout-grid-cols, xem style.css) — 2 giá trị .grid-3/.grid-4 hardcode
    # trước đây không có sẵn cho số cột tuỳ ý.
    if columns_desktop == 3 and columns_mobile == 1:
        grid_attrs = ' class="grid grid-3"'
    else:
        grid_attrs = f' class="grid layout-grid-cols" style="--lb-cols-desktop:{columns_desktop};--lb-cols-mobile:{columns_mobile};"'

    return f"""
  <section class="section container js-reveal">
    <div class="section-head"><h2>{_esc(title)}</h2><a class="more" href="archive.html">Xem thêm →</a></div>
    <div{grid_attrs}>{cards}
    </div>
  </section>"""

def _render_block_custom_html(block, ctx):
    """HTML tùy chỉnh — in THẲNG, không escape (đây là mục đích của khối:
    nhúng iframe/widget tuỳ ý). Ranh giới an toàn nằm ở RLS: chỉ tài khoản có
    quyền 'layout.edit'/'layout.create' (managing_editor/editor/admin) mới
    ghi được vào layout_blocks.config — cùng mức tin cậy đã áp dụng cho
    Spotify/YouTube embed trong nội dung bài viết, KHÔNG áp dụng cho input
    công khai nào."""
    cfg = block.get("config") or {}
    raw = (cfg.get("html") or "").strip()
    if not raw:
        return ""
    return f"""
  <section class="container layout-custom-block js-reveal">{raw}
  </section>"""

def _render_block_custom_markdown(block, ctx):
    """Markdown tùy chỉnh — tái dùng NGUYÊN VẸN _md_body_to_blocks()/
    render_body_blocks() đã có cho nội dung bài viết, không viết lại
    converter thứ 2."""
    cfg = block.get("config") or {}
    raw = (cfg.get("markdown") or "").strip()
    if not raw:
        return ""
    inner = render_body_blocks(_md_body_to_blocks(raw))
    if not inner.strip():
        return ""
    return f"""
  <section class="container layout-custom-block js-reveal">
    {inner}
  </section>"""

BLOCK_RENDERERS = {
    "gif_hero": _render_block_gif_hero,
    "spotify": _render_block_spotify,
    "hero": _render_block_hero,
    "featured_story": _render_block_featured_story,
    "magazine": _render_block_magazine,
    "trending": _render_block_trending,
    "ranking_spotlight": _render_block_ranking_spotlight,
    "profiles_homepage": _render_block_profiles_homepage,
    "community_homepage": _render_block_community_homepage,
    "series_grid": _render_block_series_grid,
    "homepage_ad": _render_block_homepage_ad,
    "latest_articles": _render_block_latest_articles,
    "custom_html": _render_block_custom_html,
    "custom_markdown": _render_block_custom_markdown,
}

def load_page_layout(page_key):
    """Đọc 1 page_layout đang active + toàn bộ layout_blocks is_enabled=true
    (chưa xoá), sắp theo sort_order rồi priority giảm dần (tie-break khi
    trùng sort_order — xem ghi chú cột priority trong migration). Trả về:
      - None  nếu CHƯA CÓ page_layouts active nào cho page_key (site mới/
        CSDL chưa chạy Rev 17, hoặc bảng tạm lỗi) -> nơi gọi PHẢI fallback
        về render hardcode, đúng yêu cầu bắt buộc "chưa có dữ liệu thì
        render giống hệt production hiện tại".
      - []    nếu page_layout tồn tại nhưng biên tập viên đã chủ động xoá
        hết khối — tôn trọng lựa chọn đó, KHÔNG fallback (khác "chưa có dữ
        liệu"), main sẽ trống thay vì hiện lại bố cục cũ ngoài ý muốn.
      - list các dict layout_blocks nếu có dữ liệu thật."""
    try:
        layouts = _supabase_get(
            "page_layouts",
            f"select=id&page_key=eq.{page_key}&is_active=eq.true&deleted_at=is.null&limit=1"
        )
    except RuntimeError as e:
        print(f"  ! Không tải được page_layouts (Rev 17) cho '{page_key}' — dùng bố cục mặc định: {e}")
        return None
    if not layouts:
        return None
    layout_id = layouts[0]["id"]
    try:
        blocks = _supabase_get(
            "layout_blocks",
            "select=id,block_type_key,sort_order,priority,visibility,visibility_condition,starts_at,ends_at,config"
            f"&page_layout_id=eq.{layout_id}&is_enabled=eq.true&deleted_at=is.null"
            "&order=sort_order.asc,priority.desc"
        )
    except RuntimeError as e:
        print(f"  ! Không tải được layout_blocks (Rev 17) cho '{page_key}' — dùng bố cục mặc định: {e}")
        return None
    return blocks

def _block_condition_met(block):
    """'date_range': so sánh thời gian build (UTC) với starts_at/ends_at.
    Các điều kiện còn lại ('always'/'manual_toggle'/'has_content'/
    'has_promotion'/'has_magazine_issue'/'has_membership') không cần nhánh
    riêng — MỌI hàm _render_block_* (và các render_* nó gọi) đã tự trả ""
    khi thiếu dữ liệu (nguyên tắc "render only if data exists" toàn bộ
    codebase); render_homepage_blocks() bỏ qua khối có kết quả rỗng, nên 4
    điều kiện "has_*" tự động đúng nghĩa mà không cần code riêng cho từng cái."""
    if (block.get("visibility_condition") or "always") != "date_range":
        return True
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    starts_at = block.get("starts_at")
    ends_at = block.get("ends_at")
    if starts_at and now < datetime.datetime.fromisoformat(starts_at.replace("Z", "+00:00")):
        return False
    if ends_at and now > datetime.datetime.fromisoformat(ends_at.replace("Z", "+00:00")):
        return False
    return True

def _wrap_block_visibility(html, visibility, block_type_key):
    """'desktop'/'mobile': website tĩnh không thể render 2 bản HTML khác
    nhau theo thiết bị lúc build — bọc div + class CSS ẩn theo @media (xem
    .layout-block--desktop-only/--mobile-only trong style.css) thay vì lược
    bỏ HTML, đã xác nhận không có CSS/JS nào phụ thuộc vị trí lồng của các
    khối (không có selector 'main > ...')."""
    if not html:
        return ""
    if visibility == "hidden":
        return ""
    if visibility == "desktop":
        return f'\n  <div class="layout-block layout-block--desktop-only" data-block="{block_type_key}">{html}\n  </div>'
    if visibility == "mobile":
        return f'\n  <div class="layout-block layout-block--mobile-only" data-block="{block_type_key}">{html}\n  </div>'
    return html

def render_homepage_blocks(ctx):
    """Dispatcher (Rev 17): Đọc Bố cục -> Đọc Danh sách Khối -> Sắp xếp (đã
    ORDER BY ở load_page_layout) -> Dispatcher (BLOCK_RENDERERS) -> Render.
    Trả None nếu chưa có Layout Builder data (nơi gọi tự fallback hardcode);
    trả chuỗi HTML (có thể rỗng) nếu đã có page_layout active."""
    blocks = load_page_layout("homepage")
    if blocks is None:
        return None
    parts = []
    for block in blocks:
        key = block.get("block_type_key")
        renderer = BLOCK_RENDERERS.get(key)
        if not renderer:
            # block_type_key có trong registry (Dashboard) nhưng chưa có hàm
            # render Python tương ứng (chưa deploy) -> bỏ qua an toàn, không
            # crash toàn bộ trang chủ vì 1 khối chưa hỗ trợ.
            continue
        if not _block_condition_met(block):
            continue
        html = renderer(block, ctx)
        parts.append(_wrap_block_visibility(html, block.get("visibility") or "all", key))
    return "<main>\n" + "".join(parts) + "\n</main>\n" if parts else "<main></main>\n"


def render_index():
    ctx = _compute_homepage_ctx()
    html = head("The New Culture - Tạp chí âm nhạc đương đại đầu tiên tại Việt Nam", append_site_name=False) + masthead()

    body = render_homepage_blocks(ctx)
    if body is None:
        body = _render_hardcoded_homepage_body(ctx)
    html += body

    html += newsletter() + footer()
    return html

# -----------------------------------------------------------------
# RENDER: SERIES PAGE
# -----------------------------------------------------------------
def influence_tier(influence):
    """Xác định cấp độ hiệu ứng phát sáng dựa trên độ ảnh hưởng (0-100).
    Trả về slug cấp độ dùng làm data-attribute cho CSS xử lý hiệu ứng."""
    if influence >= 95:
        return "legendary"   # Huyền thoại — hào quang vàng kim rực, có nhấp nháy
    if influence >= 80:
        return "elite"       # Xuất sắc — viền vàng đậm, phát sáng rõ
    if influence >= 50:
        return "notable"     # Nổi bật — viền vàng nhạt, phát sáng nhẹ
    return "standard"        # Thường — không hiệu ứng

def top_profiles_for_homepage(limit=10):
    """Lọc hồ sơ đủ điều kiện hiển thị trên trang chủ: chỉ từ cấp Nổi bật
    (độ ảnh hưởng >= 50) trở lên, sắp xếp giảm dần theo độ ảnh hưởng,
    giới hạn tối đa `limit` hồ sơ đầu tiên."""
    eligible = [p for p in PROFILES if p["influence"] >= 50]
    eligible.sort(key=lambda p: p["influence"], reverse=True)
    return eligible[:limit]

def top_community_posters_for_homepage(limit=10):
    """Lọc bài viết TNC Community đã có ảnh poster, sắp theo thứ tự order
    (mới nhất trước — nhất quán với cách sắp xếp bài viết toàn hệ thống),
    giới hạn tối đa `limit` bài đầu tiên."""
    eligible = [a for a in ARTICLES_BY_SERIES.get("tnc-community", []) if is_community_poster(a)]
    return eligible[:limit]

def render_community_homepage_block():
    """Khối 'TNC Community' cố định trên trang chủ: carousel cuộn ngang
    hiển thị tối đa 10 poster sự kiện/hoạt động mới nhất. Tự ẩn hoàn toàn
    nếu chưa có bài viết Community nào có ảnh poster."""
    top_posters = top_community_posters_for_homepage(limit=10)
    if not top_posters:
        return ""
    cards_html = "".join(render_poster_card(a) for a in top_posters)
    return f"""
  <section class="profiles-spotlight js-reveal">
    <div class="container">
      <div class="section-head">
        <h2>TNC Community</h2>
        <a class="more" href="series-tnc-community.html">Xem toàn bộ hoạt động →</a>
      </div>
      <div class="profiles-spotlight__scroll">
        <div class="profiles-spotlight__track poster-spotlight__track">{cards_html}
        </div>
      </div>
    </div>
  </section>
"""

def render_profiles_homepage_block():
    """Khối 'TNC Profiles' cố định trên trang chủ: dải thẻ tự động trôi liên
    tục từ phải sang trái (marquee), vòng lặp vô tận. Người dùng có thể vuốt
    (di động) hoặc kéo chuột (desktop) để chủ động lướt nhanh/chậm; chuyển
    động tự động tạm dừng khi đang chạm/kéo. Hiển thị tối đa 10 hồ sơ có độ
    ảnh hưởng cao nhất (từ cấp Nổi bật trở lên). Tự ẩn hoàn toàn nếu không
    có hồ sơ nào đủ điều kiện."""
    top_profiles = top_profiles_for_homepage(limit=10)
    if not top_profiles:
        return ""
    # Nhân đôi danh sách thẻ: khi bản sao đầu trôi hết, bản sao thứ hai đã
    # nối liền ngay sau, tạo cảm giác trôi vô tận không đứt đoạn. Bản sao thứ
    # hai chỉ phục vụ hiệu ứng thị giác nên bị ẩn khỏi trình đọc màn hình và
    # thứ tự Tab (inert) để không đọc/lặp lại 10 hồ sơ hai lần.
    single_set_html = "".join(render_profile_card(p) for p in top_profiles)
    cards_html = single_set_html + f'<div class="profiles-spotlight__dup" aria-hidden="true" inert>{single_set_html}</div>'
    return f"""
  <section class="profiles-spotlight profiles-spotlight--marquee">
    <div class="container">
      <div class="section-head">
        <h2>TNC Profiles</h2>
        <a class="more" href="series-tnc-profiles.html">Xem toàn bộ hồ sơ →</a>
      </div>
      <div class="profiles-spotlight__scroll" data-marquee data-marquee-speed="40">        <div class="profiles-spotlight__track">{cards_html}
        </div>
      </div>
    </div>
  </section>
"""

def render_badges_html(badges, context="card"):
    """Sinh HTML cho nhóm badge thành tích (không bao gồm GOAT — badge đó
    được xử lý riêng để đặt cạnh tên theo đúng thiết kế 'hiệu ứng bốc lửa').
    context: 'card' (thẻ bài) hoặc 'hero' (trang chi tiết) — điều chỉnh kích cỡ."""
    others = [b for b in badges if b != "goat"]
    if not others:
        return ""
    size_cls = " badge--lg" if context == "hero" else ""
    items = "".join(
        f'<span class="badge badge--{key}{size_cls}" title="{PROFILE_BADGES[key]["desc"]}">{PROFILE_BADGES[key]["label"]}</span>'
        for key in others
    )
    return f'<div class="profile-badges profile-badges--{context}">{items}</div>'

def render_goat_name_html(name, has_goat):
    """Sinh HTML tên hồ sơ, kèm hiệu ứng GOAT nếu có: tên 'bốc lửa' bằng CSS
    gradient + animation, cộng badge 'GOAT' đỏ phát sáng đặt bên phải tên."""
    if not has_goat:
        return name
    goat_badge = '<span class="badge badge--goat" title="Đỉnh cao mọi thời đại">GOAT</span>'
    return f'<span class="profile-name--goat">{name}</span> {goat_badge}'

def render_profile_card(p, reveal=False):
    """Sinh HTML một 'thẻ tướng' cho lưới danh mục TNC Profiles.
    `reveal=True` gắn thêm .js-reveal để mỗi thẻ tự fade/slide-in độc lập khi
    cuộn tới (dùng cho lưới danh mục — render_profiles_series_page). Mặc định
    False: giữ nguyên hành vi cho marquee trang chủ (render_profiles_homepage_block),
    vốn cần opacity:1 cố định, không tham gia hệ thống scroll-reveal."""
    ptype = PROFILE_TYPES[p["type"]]
    tier = influence_tier(p["influence"])
    has_goat = "goat" in p["badges"]
    avatar_html = (f'<img src="{p["avatar"]}" alt="{p["name"]}" loading="lazy">'
                   if p["avatar"] else '<div class="profile-card__ph"></div>')
    name_html = render_goat_name_html(p["name"], has_goat)
    badges_html = render_badges_html(p["badges"], context="card")
    card_class = "profile-card js-reveal" if reveal else "profile-card"
    return f"""
      <a class="{card_class}" href="{profile_url(p['slug'])}" data-type="{p['type']}" data-tier="{tier}">
        <div class="profile-card__media">{avatar_html}
          <span class="profile-card__type eyebrow eyebrow{ptype['accent']}">{ptype['label']}</span>
        </div>
        <div class="profile-card__body">
          <h3 class="profile-card__name">{name_html}</h3>
          <span class="profile-card__role">{p['role']}</span>
          {badges_html}
          <div class="profile-card__influence">
            <div class="profile-card__influence-bar"><span style="width:{p['influence']}%"></span></div>
            <span class="profile-card__influence-num js-count" data-count="{p['influence']}">0</span>
          </div>
        </div>
      </a>"""

def render_profiles_series_page(s):
    """Trang danh mục chuyên biệt cho series TNC Profiles: lưới 'thẻ tướng'
    thay vì danh sách bài viết chuẩn. Được gọi thay cho render_series_page()
    khi phát hiện đúng slug 'tnc-profiles'."""
    cards_html = "".join(render_profile_card(p, reveal=True) for p in PROFILES)
    if not PROFILES:
        cards_html = """
      <div style="grid-column:1/-1;padding:var(--s-8);text-align:center;border:1px dashed var(--c-line);">
        <p style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);text-transform:uppercase;letter-spacing:0.06em;">Chưa có hồ sơ nào được thêm</p>
        <p style="color:var(--c-ink-3);margin-top:var(--s-2);font-size:var(--t-sm);">Hồ sơ nhân vật và đơn vị trong ngành đang được biên tập.</p>
      </div>"""

    filter_buttons = '<button class="profile-filter is-active" data-filter-type="all">Tất cả</button>'
    for key, meta in PROFILE_TYPES.items():
        filter_buttons += f'<button class="profile-filter" data-filter-type="{key}">{meta["label"]}</button>'

    others = ""
    for o in SERIES:
        if o["slug"] == s["slug"]: continue
        others += f"""
        <a class="series-cell" href="{series_url(o['slug'])}">
          <span class="series-cell__code">{o['code']} · {o['num']}</span>
          <h3>{o['name']}</h3>
        </a>"""

    html = head(s["name"], s["desc"]) + masthead(active=s["slug"])
    html += f"""
<main>
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="all-series.html">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-6);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / {len(SERIES)}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;max-width:18ch;">{s['name']}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;">{s['desc']}</p>
      <div class="byline" style="margin-top:var(--s-4);display:flex;gap:var(--s-5);flex-wrap:wrap;">
        <span>{len(PROFILES)} hồ sơ trong hệ thống</span>
        <span>Editorial Content System — TNCOS</span>
      </div>
    </div>

    <div class="profile-filters">{filter_buttons}</div>

    <div class="profile-grid" id="profileGrid">{cards_html}
    </div>
  </section>

  <section class="series-band js-reveal" style="margin-top:var(--s-9);">
    <div class="container">
      <div class="section-head"><h2>Series khác</h2></div>
      <div class="series-grid">
        {others}
      </div>
    </div>
  </section>
</main>
<script>
(function(){{
  var buttons=document.querySelectorAll('.profile-filter');
  var cards=document.querySelectorAll('.profile-card');
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  buttons.forEach(function(btn){{
    btn.addEventListener('click',function(){{
      buttons.forEach(function(b){{b.classList.remove('is-active');}});
      btn.classList.add('is-active');
      var type=btn.getAttribute('data-filter-type');

      if(reduceMotion){{
        cards.forEach(function(card){{
          var match=(type==='all')||(card.getAttribute('data-type')===type);
          card.style.display=match?'':'none';
        }});
        return;
      }}

      // FLIP: ghi vị trí First, đổi trạng thái Last, tính Invert, rồi Play
      var first=new Map();
      cards.forEach(function(card){{
        if(card.style.display!=='none')first.set(card,card.getBoundingClientRect());
      }});

      cards.forEach(function(card){{
        var match=(type==='all')||(card.getAttribute('data-type')===type);
        card.style.display=match?'':'none';
      }});

      cards.forEach(function(card){{
        if(card.style.display==='none')return;
        var last=card.getBoundingClientRect();
        var prev=first.get(card);
        if(!prev)return;
        var dx=prev.left-last.left,dy=prev.top-last.top;
        if(dx===0&&dy===0)return;
        card.style.transform='translate('+dx+'px,'+dy+'px)';
        card.style.transition='none';
        requestAnimationFrame(function(){{
          card.style.transition='transform var(--dur-slow) var(--ease)';
          card.style.transform='';
        }});
      }});
    }});
  }});
}})();
</script>
"""
    html += footer()
    return html

def render_spotify_artist_block(p):
    """Spotify Artist Player — chỉ hiển thị trên trang Profile khi trường
    spotify_artist là link Spotify Artist hợp lệ. Iframe tĩnh, không
    JavaScript. Trả "" (không render gì) khi thiếu trường hoặc link không
    hợp lệ — build tiếp tục bình thường, không cảnh báo."""
    artist_id = _spotify_artist_id(p.get("spotify_artist") or "")
    if not artist_id:
        return ""
    return f"""
<section class="spotify-artist">
    <h2>Nghe nghệ sĩ trên Spotify</h2>

    <iframe
        src="https://open.spotify.com/embed/artist/{artist_id}"
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        allowfullscreen>
    </iframe>
</section>"""

def render_profile_page(p):
    """Trang chi tiết đầy đủ thông tin một hồ sơ nhân vật/đơn vị."""
    ptype = PROFILE_TYPES[p["type"]]
    tier = influence_tier(p["influence"])
    has_goat = "goat" in p["badges"]
    avatar_html = (f'<img src="{p["avatar"]}" alt="{p["name"]}" class="profile-hero__avatar" data-tier="{tier}">'
                   if p["avatar"] else f'<div class="profile-hero__avatar" data-tier="{tier}"></div>')
    body_html = render_body_blocks(p["body"])
    name_html = render_goat_name_html(p["name"], has_goat)
    badges_html = render_badges_html(p["badges"], context="hero")
    path = profile_url(p["slug"])
    spotify_artist_html = render_spotify_artist_block(p)
    spotify_artist_block = (
        f'\n  <div class="container" style="max-width:720px;">{spotify_artist_html}\n  </div>\n'
        if spotify_artist_html else ""
    )

    # Artist Knowledge Graph V1: bài viết liên quan tự build từ tag khớp
    # tên/alias Profile (PROFILE_ARTICLES) — không nhập tay, không trùng
    # lặp, đã sắp xếp mới nhất trước. Ẩn hẳn khối nếu chưa có bài nào.
    related_articles = PROFILE_ARTICLES.get(p["slug"], [])
    related_section = ""
    if related_articles:
        cards = ""
        for r in related_articles:
            rs = SERIES_BY_SLUG[r["series"]]
            cards += f"""
      <a class="card" href="{article_url(r['slug'])}">
        <div class="media media--3-2">{zoom(r)}<span class="archive-code">{art_code(r)}</span></div>
        <span class="eyebrow eyebrow{rs['accent']}">{rs['name']}</span>
        <h3>{r['title']}</h3>
        <span class="byline">{rs['name']} · {r['date']}</span>
      </a>"""
        related_section = f"""
  <section class="section container js-reveal">
    <div class="section-head"><h2>Bài viết liên quan</h2></div>
    <div class="grid grid-3">{cards}
    </div>
  </section>"""

    html = head(p["name"], p["short_desc"], path=path) + masthead(active="tnc-profiles")
    html += f"""
<main>
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="series-tnc-profiles.html">TNC Profiles</a> / {p['name']}
    </nav>
    <div class="profile-hero">
      {avatar_html}
      <div>
        <span class="eyebrow eyebrow{ptype['accent']}">{ptype['label']}</span>
        <h1>{name_html}</h1>
        <p class="profile-hero__role">{p['role']}</p>
        {badges_html}
        <div class="profile-hero__influence">
          <span class="profile-hero__influence-label">Độ ảnh hưởng</span>
          <div class="profile-card__influence-bar profile-hero__bar"><span style="width:{p['influence']}%"></span></div>
          <span class="profile-card__influence-num js-count" data-count="{p['influence']}">0</span>
        </div>
      </div>
    </div>
    <div class="article-body" style="max-width:720px;font-size:var(--t-md);line-height:1.8;margin-top:var(--s-7);">
{body_html}
    </div>
  </section>
{spotify_artist_block + related_section}
</main>
"""
    html += footer()
    return html

def render_community_series_page(s):
    """Trang danh mục chuyên biệt cho series TNC Community: lưới poster dọc
    thay vì danh sách bài viết chuẩn. Được gọi thay cho render_series_page()
    khi phát hiện đúng slug 'tnc-community'. Bài chưa có ảnh poster vẫn
    hiển thị dạng thẻ chuẩn (fallback), không bị loại khỏi danh mục."""
    arts = ARTICLES_BY_SERIES.get(s["slug"], [])
    cards_html = ""
    if arts:
        for a in arts:
            if is_community_poster(a):
                cards_html += render_poster_card(a)
            else:
                cards_html += f"""
      <a class="card" href="{article_url(a['slug'])}">
        <div class="media media--3-2">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{_esc(a['title'])}</h3>
        <span class="byline">{a['author']} · {a['date']}</span>
      </a>"""
        grid_class = "poster-grid"
    else:
        cards_html = """
      <div style="grid-column:1/-1;padding:var(--s-8);text-align:center;border:1px dashed var(--c-line);">
        <p style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);text-transform:uppercase;letter-spacing:0.06em;">Chưa có bài viết xuất bản</p>
        <p style="color:var(--c-ink-3);margin-top:var(--s-2);font-size:var(--t-sm);">Nội dung đầu tiên của tuyến này đang được biên tập.</p>
      </div>"""
        grid_class = "poster-grid"

    others = ""
    for o in SERIES:
        if o["slug"] == s["slug"]: continue
        others += f"""
        <a class="series-cell" href="{series_url(o['slug'])}">
          <span class="series-cell__code">{o['code']} · {o['num']}</span>
          <h3>{o['name']}</h3>
        </a>"""

    html = head(s["name"], s["desc"]) + masthead(active=s["slug"])
    html += f"""
<main>
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="all-series.html">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / {len(SERIES)}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;max-width:18ch;">{s['name']}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;">{s['desc']}</p>
      <div class="byline" style="margin-top:var(--s-4);display:flex;gap:var(--s-5);flex-wrap:wrap;">
        <span>{len(arts)} bài viết đã xuất bản</span>
        <span>Editorial Content System — TNCOS</span>
      </div>
    </div>

    <div class="{grid_class} js-reveal">{cards_html}
    </div>
  </section>

  <section class="series-band js-reveal" style="margin-top:var(--s-9);">
    <div class="container">
      <div class="section-head"><h2>Series khác</h2></div>
      <div class="series-grid">{others}
      </div>
    </div>
  </section>
</main>
"""
    html += footer()
    return html

def render_premium_landing_page(s):
    """TNC Premium (Rev 18) — landing page bán dịch vụ, thay cho trang series
    mặc định. Được gọi thay cho render_series_page() khi phát hiện đúng slug
    'tnc-premium' — CÙNG PATTERN đã có sẵn cho tnc-profiles/tnc-community,
    không phát minh cơ chế mới. Toàn bộ nội dung tĩnh (không đọc bảng nào
    khác ngoài chính series 'tnc-premium' cho title/meta) — đây là 1 trang
    bán hàng, không có CRUD/Dashboard/CSDL riêng theo đúng yêu cầu."""
    placements = [
        ("Hero", "Vị trí banner đầu trang chủ — điểm chạm đầu tiên của mọi độc giả."),
        ("Sidebar", "Đồng hành cùng nội dung biên tập xuyên suốt các trang bài viết."),
        ("Promotion", "Banner chiến dịch theo lịch, hiển thị đúng khung thời gian chiến dịch cần."),
        ("Announcement", "Thanh thông báo đầu trang, ưu tiên hiển thị cao nhất trên toàn site."),
        ("Homepage Feature", "Vị trí nổi bật ngay trên trang chủ, cạnh nội dung biên tập được chọn lọc."),
        ("Sponsored Block", "Khối nội dung được gắn nhãn rõ ràng, vẫn giữ đúng chuẩn biên tập của TNC."),
    ]
    placements_html = "".join(f"""
      <div class="premium-placement" tabindex="0">
        <span class="premium-placement__label">{label}</span>
        <span class="premium-placement__desc">{desc}</span>
      </div>""" for label, desc in placements)

    packages = [
        ("Launch", "Ra mắt sản phẩm âm nhạc mới — giới thiệu đến đúng cộng đồng ngay từ ngày đầu."),
        ("Promotion", "Chiến dịch quảng bá ngắn hạn, tối ưu độ phủ trong khung thời gian trọng điểm."),
        ("Campaign", "Chiến dịch dài hạn, kết hợp nhiều định dạng nội dung và vị trí hiển thị."),
        ("Enterprise", "Giải pháp riêng cho label và thương hiệu cần đồng hành lâu dài trên nhiều mặt trận."),
    ]
    packages_html = "".join(f"""
      <div class="premium-package">
        <h3>{name}</h3>
        <p>{desc}</p>
        <a href="lien-he.html" class="premium-btn premium-btn--ghost premium-btn--sm">Liên hệ để nhận báo giá</a>
      </div>""" for name, desc in packages)

    workflow = [
        ("01", "Trao đổi", "Lắng nghe mục tiêu và bối cảnh dự án của bạn."),
        ("02", "Đề xuất", "Xây dựng đề xuất nội dung và vị trí phù hợp nhất."),
        ("03", "Triển khai", "Sản xuất nội dung, chuẩn bị tài sản theo đúng tiêu chuẩn biên tập."),
        ("04", "Xuất bản", "Đăng tải đúng lịch, đúng vị trí đã thống nhất."),
        ("05", "Báo cáo", "Tổng kết hiệu quả và đề xuất bước tiếp theo."),
    ]
    workflow_html = "".join(f"""
      <div class="premium-step">
        <span class="premium-step__num">{num}</span>
        <h3>{label}</h3>
        <p>{desc}</p>
      </div>""" for num, label, desc in workflow)

    html = head(
        "TNC Premium — Premium Media Solutions for the Music Industry",
        s["desc"] or "Giải pháp truyền thông cao cấp dành cho ngành công nghiệp âm nhạc.",
        path=series_url("tnc-premium"),
    ) + masthead(active="tnc-premium")

    html += f"""
<main class="premium-page">
  <section class="premium-hero">
    <div class="premium-hero__bg" aria-hidden="true">
      <span class="premium-particle p1"></span>
      <span class="premium-particle p2"></span>
      <span class="premium-particle p3"></span>
      <span class="premium-particle p4"></span>
      <span class="premium-particle p5"></span>
    </div>
    <div class="container premium-hero__inner">
      <span class="premium-eyebrow js-reveal">The New Culture</span>
      <h1 class="premium-hero__title js-reveal">TNC Premium</h1>
      <p class="premium-hero__subtitle js-reveal">Premium Media Solutions for the Music Industry</p>
      <div class="premium-hero__actions js-reveal">
        <a href="#dich-vu" class="premium-btn premium-btn--solid">Khám phá dịch vụ</a>
        <a href="lien-he.html" class="premium-btn premium-btn--ghost">Liên hệ</a>
      </div>
    </div>
  </section>

  <section class="premium-section container js-reveal">
    <p class="premium-kicker">Giới thiệu</p>
    <h2>Uy tín biên tập, trở thành lợi thế chiến lược</h2>
    <p class="premium-lead">Trong hơn một thập kỷ, The New Culture xây dựng niềm tin với độc giả bằng sự chính xác, độc lập và chiều sâu biên tập. TNC Premium là nơi niềm tin đó trở thành một nguồn lực chiến lược cho nghệ sĩ, label và thương hiệu đang tìm kiếm đúng khán giả, đúng bối cảnh và đúng thời điểm.</p>
    <p class="premium-lead">Chúng tôi không bán vị trí quảng cáo. Chúng tôi đồng hành cùng bạn kể một câu chuyện xứng đáng với sự chú ý của cộng đồng underground Việt Nam.</p>
  </section>

  <section id="dich-vu" class="premium-section container js-reveal">
    <p class="premium-kicker">Dịch vụ</p>
    <h2>Bốn nhóm giải pháp</h2>
    <div class="premium-groups">
      <div class="premium-group">
        <span class="premium-group__index">01</span>
        <h3>Quảng cáo</h3>
        <ul><li>Hero</li><li>Promotion</li><li>Announcement</li><li>Sidebar</li><li>Homepage Feature</li><li>Sponsored Block</li></ul>
      </div>
      <div class="premium-group">
        <span class="premium-group__index">02</span>
        <h3>Nội dung quảng bá</h3>
        <ul><li>Press Release</li><li>Advertorial</li><li>Artist Feature</li><li>Interview</li><li>Album Review</li></ul>
      </div>
      <div class="premium-group">
        <span class="premium-group__index">03</span>
        <h3>Bán vé</h3>
        <ul><li>Landing Page</li><li>Ticketing</li><li>Commission</li></ul>
      </div>
      <div class="premium-group">
        <span class="premium-group__index">04</span>
        <h3>Premium Combo</h3>
        <ul><li>Album Launch</li><li>Campaign</li><li>Event Promotion</li></ul>
      </div>
    </div>
  </section>

  <section class="premium-section container js-reveal">
    <p class="premium-kicker">Sơ đồ hiển thị</p>
    <h2>Advertising Placement</h2>
    <p class="premium-lead">Di chuột hoặc chạm vào từng vị trí để xem mô tả.</p>
    <div class="premium-placements">{placements_html}
    </div>
  </section>

  <section class="premium-section container js-reveal">
    <p class="premium-kicker">Gói dịch vụ</p>
    <h2>Premium Packages</h2>
    <div class="premium-packages">{packages_html}
    </div>
  </section>

  <section class="premium-section container js-reveal">
    <p class="premium-kicker">Quy trình</p>
    <h2>Workflow</h2>
    <div class="premium-workflow">{workflow_html}
    </div>
  </section>

  <section class="premium-cta container js-reveal">
    <h2>Ready to launch your next campaign?</h2>
    <p>Liên hệ với TNC Premium để bắt đầu.</p>
    <a href="lien-he.html" class="premium-btn premium-btn--solid">Liên hệ với TNC Premium</a>
    <p class="premium-cta__email">hoặc gửi email tới <a href="mailto:thenewculture.universe@gmail.com">thenewculture.universe@gmail.com</a></p>
  </section>
</main>
"""
    html += footer()
    return html

def render_series_page(s):
    arts = ARTICLES_BY_SERIES.get(s["slug"], [])
    rows = ""
    if arts:
        for idx, a in enumerate(arts):
            hidden_attr = ' style="display:none;"' if idx >= 8 else ""
            rows += f"""
      <a class="card js-infinite-item" data-idx="{idx}"{hidden_attr} href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 260px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{_esc(a['dek'])}</p>
          <span class="byline">{a['author']} · {a['date']} · {a['read_time']}</span>
        </div>
      </a>"""
    else:
        rows = """
      <div style="grid-column:1/-1;padding:var(--s-8);text-align:center;border:1px dashed var(--c-line);">
        <p style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);text-transform:uppercase;letter-spacing:0.06em;">Chưa có bài viết xuất bản</p>
        <p style="color:var(--c-ink-3);margin-top:var(--s-2);font-size:var(--t-sm);">Nội dung đầu tiên của tuyến này đang được biên tập.</p>
      </div>"""

    others = ""
    for o in SERIES:
        if o["slug"] == s["slug"]: continue
        others += f"""
        <a class="series-cell" href="{series_url(o['slug'])}">
          <span class="series-cell__code">{o['code']} · {o['num']}</span>
          <h3>{o['name']}</h3>
        </a>"""

    html = head(s["name"], s["desc"]) + masthead(active=s["slug"])
    html += f"""
<main>
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="all-series.html">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / {len(SERIES)}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;max-width:18ch;">{s['name']}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;">{s['desc']}</p>
      <div class="byline" style="margin-top:var(--s-4);display:flex;gap:var(--s-5);flex-wrap:wrap;">
        <span>{len(arts)} bài viết đã xuất bản</span>
        <span>Editorial Content System — TNCOS</span>
      </div>
    </div>

    <div class="grid js-infinite-list js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
    <div class="js-infinite-sentinel" style="height:1px;"></div>
  </section>

  <section class="series-band js-reveal" style="margin-top:var(--s-9);">
    <div class="container">
      <div class="section-head"><h2>Series khác</h2></div>
      <div class="series-grid">{others}
      </div>
    </div>
  </section>
</main>
"""
    html += footer()
    return html

# -----------------------------------------------------------------
# RENDER: ARTICLE PAGE
# -----------------------------------------------------------------
def render_ranking(items):
    """Sinh HTML bảng xếp hạng ca khúc: thứ hạng lớn, ảnh, nghệ sĩ, bình luận, nhúng YouTube."""
    import html as _html
    if not items:
        return ""
    rows = []
    for it in items:
        song = _html.escape(it["song"])
        artist = _html.escape(it["artist"])
        note = _inline_md(it["note"]) if it["note"] else ""
        # ảnh mục: ưu tiên cover; nếu không có nhưng có youtube thì dùng thumbnail YouTube
        if it["cover"]:
            media = f'<img src="{it["cover"]}" alt="" loading="lazy">'
        elif it["youtube"]:
            media = f'<img src="https://img.youtube.com/vi/{it["youtube"]}/hqdefault.jpg" alt="" loading="lazy">'
        else:
            media = '<div class="rank-item__ph"></div>'
        video = ""
        if it["youtube"]:
            video = (f'<div class="rank-item__video"><iframe src="https://www.youtube.com/embed/{it["youtube"]}" '
                     f'title="{song}" loading="lazy" frameborder="0" '
                     f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
                     f'allowfullscreen></iframe></div>')
        note_html = f'<p class="rank-item__note">{note}</p>' if note else ""
        artist_html = f'<span class="rank-item__artist">{artist}</span>' if artist else ""
        rows.append(f"""
      <li class="rank-item">
        <div class="rank-item__num">{it['rank']:02d}</div>
        <div class="rank-item__media">{media}</div>
        <div class="rank-item__body">
          <h3 class="rank-item__song">{song}</h3>
          {artist_html}
          {note_html}
          {video}
        </div>
      </li>""")
    return ('\n    <ol class="ranking">' + "".join(rows) + "\n    </ol>")

def render_body_blocks(blocks):
    out = []
    for kind, payload in blocks:
        if kind == "p":
            out.append(f"      <p>{payload}</p>")
        elif kind == "h2":
            out.append(f"      <h2>{payload}</h2>")
        elif kind == "h3":
            out.append(f"      <h3 class=\"body-h3\">{payload}</h3>")
        elif kind == "blockquote":
            out.append(f"      <blockquote>{payload}</blockquote>")
        elif kind == "list":
            items = "".join(f"<li>{it}</li>" for it in payload)
            out.append(f"      <ul class=\"body-list\">{items}</ul>")
        elif kind == "ordered_list":
            items = "".join(f"<li>{it}</li>" for it in payload)
            out.append(f"      <ol class=\"body-list body-list--ordered\">{items}</ol>")
        elif kind == "image":
            src = payload["src"]; alt = payload.get("alt", ""); cap = payload.get("caption", "")
            cap_html = f'<figcaption>{cap}</figcaption>' if cap else ''
            out.append(
                f'      <figure class="body-figure">'
                f'<img src="{src}" alt="{alt}" loading="lazy">{cap_html}</figure>'
            )
        elif kind == "youtube":
            out.append(
                f'      <div class="body-video"><iframe src="https://www.youtube.com/embed/{payload}" '
                f'title="Video" frameborder="0" loading="lazy" '
                f'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" '
                f'allowfullscreen></iframe></div>'
            )
        elif kind == "spotify":
            sp_kind, sp_id = payload["kind"], payload["id"]
            height = 152 if sp_kind == "track" else 352
            out.append(
                f'      <div class="body-embed"><iframe src="https://open.spotify.com/embed/{sp_kind}/{sp_id}" '
                f'width="100%" height="{height}" frameborder="0" loading="lazy" '
                f'allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" '
                f'title="Spotify player"></iframe></div>'
            )
        elif kind == "soundcloud":
            import urllib.parse as _urlparse
            height = 300 if "/sets/" in payload else 166
            encoded = _urlparse.quote(payload, safe='')
            out.append(
                f'      <div class="body-embed"><iframe src="https://w.soundcloud.com/player/?url={encoded}'
                f'&color=%23e11d0f&auto_play=false&show_teaser=true" '
                f'width="100%" height="{height}" frameborder="0" loading="lazy" '
                f'title="SoundCloud player"></iframe></div>'
            )
    return "\n".join(out)

def article_schema_json(a, s, path):
    """JSON-LD Article schema cho SEO rich snippet."""
    import json as _json
    img = a.get("cover", "")
    img_url = img if img.startswith("http") else f"{SITE_URL}/{img.lstrip('/')}" if img else f"{SITE_URL}/og-default.png"
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": a["title"],
        "description": a["dek"],
        "image": [img_url],
        "datePublished": a["date"],
        "author": {"@type": "Person", "name": a["author"]},
        "publisher": {"@type": "Organization", "name": SITE_SETTINGS["site_name"],
                       "logo": {"@type": "ImageObject", "url": f"{SITE_URL}{SITE_SETTINGS['favicon_image']}"}},
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE_URL}/{path}"},
        "articleSection": s["name"],
        "keywords": ", ".join(a.get("tags", [])),
    }
    # Bug fix (production audit): json.dumps() không tự escape chuỗi
    # "</script>" bên trong giá trị string — nếu title/dek chứa literal
    # "</script><script>...", thẻ script JSON-LD này bị đóng sớm và
    # HTML/script phía sau chèn thẳng vào <head>, thực thi cho mọi khách
    # truy cập (stored XSS độc lập với việc escape HTML ở _esc()). "<\/"
    # vẫn là JSON hợp lệ (JSON cho phép escape "/" thành "\/") nhưng phá
    # đúng chuỗi "</script" mà trình duyệt/HTML parser tìm để đóng thẻ.
    safe_json = _json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json">{safe_json}</script>'

def render_series_pager(a):
    """Điều hướng 'Bài trước / Bài sau' trong cùng series, theo đúng thứ tự
    lưu trữ (order/slug) đã dùng cho toàn hệ thống. Tự ẩn nếu bài là bài
    duy nhất của series đó."""
    lst = ARTICLES_BY_SERIES.get(a["series"], [])
    idx = lst.index(a)
    prev_a = lst[idx + 1] if idx + 1 < len(lst) else None
    next_a = lst[idx - 1] if idx - 1 >= 0 else None
    if not prev_a and not next_a:
        return ""
    s = SERIES_BY_SLUG[a["series"]]

    def _link(art, direction):
        label = f"← Bài trước · {s['name']}" if direction == "prev" else f"Bài sau · {s['name']} →"
        return (f'<a class="series-pager__link series-pager__link--{direction}" href="{article_url(art["slug"])}">'
                f'<span class="series-pager__label">{label}</span>'
                f'<span class="series-pager__title">{art["title"]}</span></a>')

    prev_html = _link(prev_a, "prev") if prev_a else '<span class="series-pager__link series-pager__link--empty"></span>'
    next_html = _link(next_a, "next") if next_a else '<span class="series-pager__link series-pager__link--empty"></span>'
    return f"""
    <nav class="container series-pager" aria-label="Điều hướng bài viết trong series {s['name']}">
      {prev_html}
      {next_html}
    </nav>"""

def render_article_page(a):
    s = SERIES_BY_SLUG[a["series"]]
    # Artist Knowledge Graph V1: tự chèn internal link tới TNC Profile khi
    # tên/alias nghệ sĩ xuất hiện trong thân bài — chỉ áp dụng cho Article,
    # không áp dụng cho bio của chính Profile (tránh tự link tới chính nó).
    body = linkify_entities(render_body_blocks(a["body"]))

    # related — chấm điểm theo số tag trùng, ưu tiên cùng series khi hòa điểm
    def _score(x):
        shared = len(set(x["tags"]) & set(a["tags"]))
        same_series = 1 if x["series"] == a["series"] else 0
        return (shared, same_series)
    candidates = [x for x in ARTICLES if x["slug"] != a["slug"]]
    related = sorted(candidates, key=_score, reverse=True)[:3]
    rel = ""
    for r in related:
        rs = SERIES_BY_SLUG[r["series"]]
        rel += f"""
      <a class="card" href="{article_url(r['slug'])}">
        <div class="media media--3-2">{zoom(r)}<span class="archive-code">{art_code(r)}</span></div>
        <span class="eyebrow eyebrow{rs['accent']}">{rs['name']}</span>
        <h3>{r['title']}</h3>
        <span class="byline">{rs['name']} · {r['date']}</span>
      </a>"""

    tags = "".join(f'<a href="{tag_url(slugify(t))}" class="tag">{_esc(t)}</a>' for t in a["tags"])

    _path = article_url(a["slug"])
    schema = article_schema_json(a, s, _path)
    html = head(a["title"], a["dek"], path=_path, image=a.get("cover",""), og_type="article", schema_json=schema) + masthead(active=a["series"])
    html += f"""
<main>
  {render_sticky_ads_sidebar()}
  <article>
    <div class="container" style="max-width:760px;padding-top:var(--s-6);">
      <nav class="byline" style="margin-bottom:var(--s-5);" aria-label="breadcrumb">
        <a href="index.html">Trang chủ</a> / <a href="{series_url(s['slug'])}">{s['name']}</a>
        <button class="reader-mode-toggle" type="button" aria-label="Chế độ đọc" title="Chế độ đọc">Chế độ đọc</button>
      </nav>
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['name']} · {art_code(a)}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-4) 0;">{_esc(a['title'])}</h1>
      <p style="font-size:var(--t-lg);color:var(--c-ink-2);line-height:1.4;margin-bottom:var(--s-5);">{_esc(a['dek'])}</p>
      {author_byline_html(a['author'])}
          <div class="byline">{a['date']} · {a['read_time']}</div>
        </div>
      </div>
    </div>

    <div class="container" style="max-width:1100px;margin-block:var(--s-6);">
      <div class="media media--16-9">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
      <p class="byline" style="text-align:right;margin-top:var(--s-2);">{a.get('cover_credit') or 'Ảnh minh họa — TNC Archive'}</p>
    </div>

    <div class="container article-body" style="max-width:680px;font-size:var(--t-md);line-height:1.8;">
{body}
    </div>

    <div class="container ranking-wrap">{render_ranking(a.get('ranking'))}
    </div>

    <div class="container" style="max-width:680px;margin-top:var(--s-6);display:flex;gap:var(--s-2);flex-wrap:wrap;">
      {tags}
    </div>
{render_article_magazine_notice(a)}
    <div class="container" style="max-width:680px;">{share_bar(a, _path)}
    </div>
{author_bio_box_html(a['author'])}
{render_series_pager(a)}
{render_inline_ad_mobile()}
  </article>

  <section class="section container js-reveal">
    <div class="section-head"><h2>Bài viết liên quan</h2></div>
    <div class="grid grid-3">{rel}
    </div>
  </section>
</main>
"""
    html += newsletter() + footer()
    return html

# -----------------------------------------------------------------
# ARTICLE BODY styling bổ sung (inject vào cuối CSS khi copy)
# -----------------------------------------------------------------
ARTICLE_CSS = """
/* ----- ARTICLE BODY ----- */
.article-body p{margin-bottom:1.4em;}
.article-body h2{font-size:var(--t-lg);margin:1.6em 0 0.6em;}
.article-body .body-h3{font-size:var(--t-md);font-weight:800;margin:1.4em 0 0.5em;}
.article-body blockquote{border-left:3px solid var(--c-red);padding-left:var(--s-5);margin:1.6em 0;font-size:var(--t-lg);font-style:italic;color:var(--c-ink);line-height:1.4;}
.article-body strong{font-weight:800;}
.article-body em{font-style:italic;}
.article-body a{color:var(--c-red);text-decoration:underline;text-underline-offset:2px;}
.article-body code{font-family:var(--f-mono);font-size:0.85em;background:var(--c-bg-subtle);padding:2px 6px;border-radius:3px;}
.article-body .body-list{margin:0 0 1.4em 1.2em;padding:0;}
.article-body .body-list li{margin-bottom:0.5em;padding-left:0.3em;list-style:disc;}
.article-body .body-list--ordered li{list-style:decimal;}
/* Ảnh trong bài */
.article-body .body-figure{margin:2em 0;}
.article-body .body-figure img{width:100%;height:auto;display:block;border:1px solid var(--c-line);}
.article-body .body-figure figcaption{font-family:var(--f-mono);font-size:var(--t-xs);color:var(--c-ink-3);margin-top:var(--s-2);text-align:center;}
/* Video nhúng YouTube (tỉ lệ 16:9 co giãn) */
.article-body .body-video{position:relative;width:100%;aspect-ratio:16/9;margin:2em 0;background:#000;}
.article-body .body-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
/* Nhúng Spotify/SoundCloud — chiều cao cố định theo chuẩn nhà cung cấp, không dùng tỉ lệ 16:9 */
.article-body .body-embed{margin:2em 0;}
.article-body .body-embed iframe{width:100%;border:0;display:block;}
/* Ảnh bìa hiển thị đè lên placeholder */
.media__zoom{width:100%;height:100%;object-fit:cover;}
img.media__zoom{position:absolute;inset:0;z-index:1;}

/* ----- SPOTIFY ARTIST EMBED (chỉ hiển thị ở trang Profile) ----- */
.spotify-artist{margin:2em 0;}
.spotify-artist h2{font-size:var(--t-lg);margin:0 0 0.6em;}
.spotify-artist iframe{width:100%;height:370px;border:1px solid var(--c-line);border-radius:var(--r-md);display:block;}

/* ----- BẢNG XẾP HẠNG (Listicle) ----- */
.ranking-wrap{max-width:820px;}
.ranking{list-style:none;margin:var(--s-6) 0 0;padding:0;counter-reset:rank;}
.rank-item{display:grid;grid-template-columns:auto 200px 1fr;gap:var(--s-5);align-items:start;padding:var(--s-6) 0;border-top:2px solid var(--c-line-strong);}
.rank-item:first-child{border-top-width:3px;}
.rank-item__num{font-family:var(--f-display);font-weight:900;font-size:clamp(2.5rem,6vw,4rem);line-height:0.9;color:var(--c-red);letter-spacing:-0.03em;}
.rank-item__media{position:relative;aspect-ratio:1/1;background:var(--c-bg-subtle);overflow:hidden;border:1px solid var(--c-line);}
.rank-item__media img{width:100%;height:100%;object-fit:cover;display:block;}
.rank-item__ph{position:absolute;inset:0;background:linear-gradient(135deg,#232323,#0e0e0e);}
.rank-item__song{font-family:var(--f-display);font-weight:800;font-size:var(--t-lg);line-height:1.15;margin:0 0 var(--s-1);}
.rank-item__artist{display:block;font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);margin-bottom:var(--s-3);letter-spacing:0.02em;}
.rank-item__note{font-size:var(--t-base);line-height:1.65;color:var(--c-ink-2);margin-bottom:var(--s-4);}
.rank-item__video{position:relative;width:100%;aspect-ratio:16/9;background:#000;}
.rank-item__video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
@media (max-width:680px){
  .rank-item{grid-template-columns:auto 1fr;gap:var(--s-4);}
  .rank-item__media{grid-column:2;max-width:160px;}
  .rank-item__body{grid-column:1 / -1;}
}
"""

# -----------------------------------------------------------------
# RENDER: TRANG PHỤ
# -----------------------------------------------------------------
def page_wrap(title, desc, inner, path="", image="", og_type="website", schema_json=""):
    return head(title, desc, path=path, image=image, og_type=og_type, schema_json=schema_json) + masthead() + f"<main>\n{inner}\n</main>\n" + newsletter() + footer()

def render_search_page():
    """Trang tìm kiếm — tải search-index.json và lọc bằng JS trên trình duyệt."""
    inner = """
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--blue">Tìm kiếm</span>
      <h1>Tìm trong Archive</h1>
      <p>Nhập từ khóa để tìm bài viết theo tiêu đề, tóm tắt hoặc chuyên mục.</p>
    </div>
    <input type="search" id="searchInput" class="search-input" placeholder="Nhập từ khóa..." autofocus aria-label="Từ khóa tìm kiếm">
    <p id="searchMeta" class="byline" style="margin:var(--s-4) 0;"></p>
    <div id="searchResults" class="grid" style="grid-template-columns:1fr;gap:var(--s-5);"></div>
  </section>
  <script>
  (function(){
    var input=document.getElementById('searchInput');
    var results=document.getElementById('searchResults');
    var meta=document.getElementById('searchMeta');
    var DATA=[];
    fetch('search-index.json').then(function(r){return r.json();}).then(function(d){
      DATA=d; var q=new URLSearchParams(location.search).get('q');
      if(q){input.value=q; run(q);}
    }).catch(function(){meta.textContent='Không tải được dữ liệu tìm kiếm.';});
    function esc(s){return (s||'').replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];});}
    function run(q){
      q=(q||'').trim().toLowerCase();
      if(!q){results.innerHTML='';meta.textContent='';return;}
      var hits=DATA.filter(function(a){
        return (a.title+' '+a.dek+' '+a.series_name+' '+(a.author||'')+' '+(a.tags||[]).join(' ')).toLowerCase().indexOf(q)>-1;
      });
      meta.textContent=hits.length+' kết quả cho "'+q+'"';
      results.innerHTML=hits.map(function(a){
        var media=a.cover?'<img class="media__zoom" src="'+esc(a.cover)+'" alt="" loading="lazy">':'<div class="media__zoom"></div>';
        return '<a class="card" href="'+a.url+'" style="flex-direction:row;gap:24px;align-items:center;">'+
          '<div class="media media--3-2" style="flex:0 0 200px;">'+media+'</div>'+
          '<div><span class="eyebrow">'+esc(a.series_name)+'</span>'+
          '<h3 style="font-size:1.375rem;margin:8px 0;">'+esc(a.title)+'</h3>'+
          '<p style="color:var(--c-ink-2);font-size:0.8125rem;">'+esc(a.dek)+'</p></div></a>';
      }).join('');
    }
    input.addEventListener('input',function(){run(input.value);});
  })();
  </script>
"""
    return page_wrap("Tìm kiếm", "Tìm bài viết trong Archive của The New Culture.", inner, path="search.html")

def build_search_index():
    """Sinh file JSON chứa dữ liệu tối giản của mọi bài để tìm kiếm phía trình duyệt."""
    import json
    data = []
    for a in ARTICLES:
        s = SERIES_BY_SLUG[a["series"]]
        data.append({
            "title": a["title"], "dek": a["dek"],
            "series_name": s["name"], "tags": a.get("tags", []),
            "author": a["author"], "cover": a.get("cover", ""),
            "url": article_url(a["slug"]),
        })
    return json.dumps(data, ensure_ascii=False)

def build_sitemap():
    """Sinh sitemap.xml liệt kê mọi trang chính cho SEO."""
    urls = [SITE_URL + "/"]
    for s in SERIES:
        urls.append(f"{SITE_URL}/{series_url(s['slug'])}")
    for c in CATEGORIES:
        urls.append(f"{SITE_URL}/{category_url(c['slug'])}")
    for a in ARTICLES:
        urls.append(f"{SITE_URL}/{article_url(a['slug'])}")
    for tslug in TAGS_BY_SLUG:
        urls.append(f"{SITE_URL}/{tag_url(tslug)}")
    for issue in MAGAZINE_ISSUES:
        urls.append(f"{SITE_URL}/{magazine.issue_url(issue)}")
    for extra in ["all-series.html","all-categories.html","all-tags.html","archive.html","magazine-archive.html","video.html","search.html","su-kien.html",
                  "ve-tnc.html","lien-he.html","hop-tac.html","tuyen-dung.html","tnc-sessions.html"]:
        urls.append(f"{SITE_URL}/{extra}")
    items = "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>'

def _slim_article(a):
    """Bản rút gọn của 1 article, đủ dùng để tham chiếu trong Editorial
    Intelligence (JSON) — không mang theo toàn bộ `body` (block nội dung)
    để tránh lặp dữ liệu nặng, không cần thiết cho các danh sách tham chiếu."""
    if not a:
        return None
    return {"slug": a["slug"], "title": a["title"], "date": a["date"], "series": a["series"]}

def compute_editor_intelligence(name, arts):
    """Editorial Intelligence (PR3, chuẩn hóa kiến trúc ở PR3.1): mọi chỉ số
    + danh sách bên dưới được suy ra 100% từ dữ liệu build-time đã có
    (ARTICLES/SERIES/tags) — không thêm trường CMS mới, không tính bằng
    JavaScript ở client. Toàn bộ scan/aggregate/sort/rank chỉ chạy Ở ĐÂY,
    một lần duy nhất mỗi editor — template chỉ được render, không được tính
    lại/lọc/sắp xếp bất cứ collection nào trong kết quả trả về.

    Diễn giải đã công bố (do hệ dữ liệu hiện tại không có taxonomy "category"
    tách biệt khỏi "tag"): "categories" ở đây dùng chính `tags` sẵn có của
    bài viết, không phát minh trường dữ liệu mới.

    Trả về MỘT object chuẩn hóa (dict thuần Python, JSON-serializable), theo
    đúng data model PR3.1 — mọi chỉ số nằm trong `metrics`, mỗi danh sách là
    một khóa riêng ngang hàng:
        {
          "metrics": {article_count, series_count, category_count,
                      first_article, latest_article, active_years,
                      published_since},
          "featured_articles": [...],
          "recent_articles": [...],
          "series": [...],       # full SERIES dict, đúng thứ tự chuẩn — sẵn
                                  # sàng để template render thẳng, không cần
                                  # tra cứu/lọc lại SERIES lần nữa.
          "categories": [...],
          "timeline": [...],
        }
    `related_editors` được main() gắn thêm vào object này sau (cần dữ liệu
    chéo giữa các editor, xem compute_related_editors)."""
    import datetime
    dated = sorted(arts, key=lambda a: _parse_vn_date(a["date"]))
    real_dates = [d for a in arts if (d := _parse_vn_date(a["date"])) != datetime.date.min]
    years = sorted({d.year for d in real_dates})
    series_slugs = {a["series"] for a in arts}
    categories = sorted({t for a in arts for t in a.get("tags", [])})

    # Featured Articles: ưu tiên 1) featured=true, 2) hero_priority=true,
    # 3) mới nhất — tối đa 3, không trùng bài (tái dùng cách sắp xếp
    # "mới nhất trước" của select_hero_articles, không phát minh lại).
    chosen, seen = [], set()
    for pred in (lambda a: a.get("featured"), lambda a: a.get("hero_priority")):
        for a in sorted((x for x in arts if pred(x) and x["slug"] not in seen),
                         key=lambda a: _parse_vn_date(a["date"]), reverse=True):
            if len(chosen) >= 3:
                break
            chosen.append(a); seen.add(a["slug"])
    for a in sorted((x for x in arts if x["slug"] not in seen),
                     key=lambda a: _parse_vn_date(a["date"]), reverse=True):
        if len(chosen) >= 3:
            break
        chosen.append(a); seen.add(a["slug"])

    recent_articles = sorted(arts, key=lambda a: _parse_vn_date(a["date"]), reverse=True)[:5]
    series_collection = [s for s in SERIES if s["slug"] in series_slugs]

    timeline = []
    for y in years:
        y_arts = sorted((a for a in arts if _parse_vn_date(a["date"]).year == y),
                         key=lambda a: _parse_vn_date(a["date"]))
        timeline.append({
            "year": y, "count": len(y_arts),
            "articles": [_slim_article(a) for a in y_arts],
        })

    metrics = {
        "article_count": len(arts),
        "series_count": len(series_slugs),
        "category_count": len(categories),
        "first_article": _slim_article(dated[0]) if dated else None,
        "latest_article": _slim_article(dated[-1]) if dated else None,
        "active_years": len(years),
        "published_since": years[0] if years else None,
    }
    return {
        "metrics": metrics,
        "featured_articles": [_slim_article(a) for a in chosen],
        "recent_articles": [_slim_article(a) for a in recent_articles],
        "series": series_collection,
        "categories": categories,
        "timeline": timeline,
    }

def compute_related_editors(name, arts, editors_arts):
    """Related Editors (PR3): xếp hạng theo mức độ tương đồng, ưu tiên Series
    trước rồi đến Tags — không bao giờ random (tie-break cuối cùng theo tên,
    ổn định/xác định). Ghi chú: hệ dữ liệu không có taxonomy "Category" tách
    biệt khỏi "Tags" (xem compute_editor_intelligence), nên bậc "Category" mà
    đề bài yêu cầu trùng với bậc "Tags" ở implementation này — không phát
    minh thêm một trường tương đồng giả để lấp cho đủ 3 bậc."""
    my_series = {a["series"] for a in arts}
    my_tags = {t for a in arts for t in a.get("tags", [])}
    scored = []
    for other_name, other_arts in editors_arts.items():
        if other_name == name:
            continue
        o_series = {a["series"] for a in other_arts}
        o_tags = {t for a in other_arts for t in a.get("tags", [])}
        shared_series = len(my_series & o_series)
        shared_tags = len(my_tags & o_tags)
        if shared_series == 0 and shared_tags == 0:
            continue
        scored.append((other_name, shared_series, shared_tags))
    scored.sort(key=lambda t: (-t[1], -t[2], t[0]))
    return [{"name": n, "shared_series": ss, "shared_tags": st} for n, ss, st in scored]

def compute_featured_series(arts, series_collection, limit=5):
    """PR4 (Discovery): xếp hạng series theo số bài viết (nhiều nhất trước),
    dùng cho khối 'Featured Series'. KHÔNG đổi/không nhân bản editor.series
    của PR3 — chỉ suy ra một thứ tự xếp hạng mới từ cùng `arts` đã có sẵn.
    Tie-break ổn định theo đúng thứ tự SERIES chuẩn (không random)."""
    counts = {}
    for a in arts:
        counts[a["series"]] = counts.get(a["series"], 0) + 1
    ranked = sorted(series_collection, key=lambda s: -counts.get(s["slug"], 0))
    return [dict(s, article_count=counts.get(s["slug"], 0)) for s in ranked[:limit]]

def compute_frequent_categories(arts, limit=8):
    """PR4 (Discovery): xếp hạng tag/category theo tần suất xuất hiện (nhiều
    nhất trước), tie-break theo tên (a-z, ổn định/không random). Dùng cho
    khối 'Chuyên mục đóng góp nhiều nhất'."""
    counts = {}
    for a in arts:
        for t in a.get("tags", []):
            counts[t] = counts.get(t, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"name": t, "count": c} for t, c in ranked[:limit]]

def render_editor_card(name):
    """EditorCard (PR4) — component thẻ biên tập viên compact tái sử dụng
    được (avatar, tên, RoleChip, số bài viết): dùng cho Related Editors ở
    PR4, sẵn sàng tái dùng cho Team/Search/các tính năng tương lai. Chỉ đọc
    dữ liệu đã tính sẵn (EDITORS + EDITOR_INTELLIGENCE) — không tính toán gì
    mới, không phá vỡ nguyên tắc 'template chỉ render'."""
    ed = EDITORS.get(name, {})
    metrics = EDITOR_INTELLIGENCE.get(name, {}).get("metrics", {})
    avatar = ed.get("avatar", "")
    avatar_html = (f'<img src="{avatar}" alt="" class="editor-card__avatar">' if avatar
                   else '<span class="editor-card__avatar" aria-hidden="true"></span>')
    role_html = render_role_chip(ed.get("role_id") or "bien-tap-vien")
    count = metrics.get("article_count", 0)
    return f"""
      <a class="editor-card" href="{author_url(name)}">
        {avatar_html}
        <span class="editor-card__name">{name}</span>
        <span class="editor-card__role">{role_html}</span>
        <span class="editor-card__stat">{count} bài viết</span>
      </a>"""

def render_editor_pager(prev_name, next_name):
    """Previous Editor / Next Editor (PR4) — điều hướng xác định (không
    random), thứ tự lấy từ EDITOR_ORDER (main()). Tái dùng nguyên component
    CSS .series-pager (đã có sẵn cho điều hướng bài-trước/bài-sau), không
    tạo CSS mới cho cùng một khuôn mẫu điều hướng trước/sau."""
    if not prev_name and not next_name:
        return ""

    def _link(other_name, direction):
        label = "← Biên tập viên trước" if direction == "prev" else "Biên tập viên sau →"
        return (f'<a class="series-pager__link series-pager__link--{direction}" href="{author_url(other_name)}">'
                f'<span class="series-pager__label">{label}</span>'
                f'<span class="series-pager__title">{other_name}</span></a>')

    prev_html = _link(prev_name, "prev") if prev_name else '<span class="series-pager__link series-pager__link--empty"></span>'
    next_html = _link(next_name, "next") if next_name else '<span class="series-pager__link series-pager__link--empty"></span>'
    return f"""
    <nav class="container series-pager" aria-label="Điều hướng biên tập viên">
      {prev_html}
      {next_html}
    </nav>"""

def editor_schema_json(name, ed, intel):
    """JSON-LD Person schema cho SEO rich snippet (PR4) — cùng khuôn mẫu với
    article_schema_json, dùng dữ liệu đã có sẵn (EDITORS + intel.metrics),
    không thêm trường CMS mới."""
    import json as _json
    avatar = ed.get("avatar", "")
    img_url = avatar if avatar.startswith("http") else f"{SITE_URL}/{avatar.lstrip('/')}" if avatar else f"{SITE_URL}/og-default.png"
    role_label = EDITOR_ROLES.get(ed.get("role_id") or "", "Biên tập viên")
    data = {
        "@context": "https://schema.org",
        "@type": "Person",
        "name": name,
        "description": ed.get("bio", ""),
        "image": img_url,
        "url": f"{SITE_URL}/{author_url(name)}",
        "jobTitle": role_label,
        "worksFor": {"@type": "Organization", "name": SITE_SETTINGS["site_name"]},
    }
    # Bug fix (production audit): xem giải thích ở article_schema_json() —
    # cùng lỗi script-tag breakout, name/bio cũng do editor tự nhập.
    safe_json = _json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json">{safe_json}</script>'

def render_author_page(name, arts, intel, nav_editors=(None, None)):
    """Trang hồ sơ biên tập viên: identity page căn giữa (không phải trang bài
    viết) — ảnh, tên, RoleChip, thống kê, tổ chức, Honors, Badges, quote/giới
    thiệu (Editor Identity System, PR2), rồi tới bài viết + series của họ,
    và (PR4) quick nav + bộ lọc + Chuyên mục/Dòng thời gian/Khám phá/điều
    hướng Biên tập viên trước-sau + SEO tự sinh. Chỉ được gọi khi tác giả đã
    có hồ sơ trong EDITORS (kiểm tra ở nơi gọi trong main()). Quote/Giới
    thiệu tái dùng đúng trường bio sẵn có; Social Links chưa có nguồn dữ liệu
    trong CMS nên không render gì (đúng nguyên tắc "chỉ hiện khi đã có dữ liệu").

    `intel`: object Editorial Intelligence đã tính sẵn ở build.py (PR3/PR3.1)
    — hàm này CHỈ render, không tính/lọc/sắp xếp lại collection nào của intel
    (dùng thẳng intel["series"]/intel["categories"]/intel["timeline"]/
    intel["related_editors"]). Riêng khối "Bài viết gần đây" cố tình vẫn lặp
    trực tiếp qua `arts` (thứ tự `order` thủ công có từ PR1) thay vì dùng
    intel["recent_articles"] (top-5 theo ngày thật) — để giữ nguyên hành vi
    đã có từ PR1/PR3.1; PR4 chỉ thêm data-attribute lọc lên đúng các hàng đó,
    không đổi nội dung/thứ tự hiển thị.

    `nav_editors`: tuple (prev_name, next_name) — thứ tự xác định (EDITOR_ORDER
    ở main()), dùng cho Previous/Next Editor."""
    ed = EDITORS.get(name, {})
    avatar = ed.get("avatar", "")
    bio = ed.get("bio", "")
    avatar_html = (f'<img src="{avatar}" alt="{name}" class="author-hero__avatar js-reveal">'
                   if avatar else '<div class="author-hero__avatar js-reveal"></div>')
    quote_html = f'<p class="author-hero__quote js-reveal">{bio}</p>' if bio else ""

    # Editor Identity System (PR2): role_id không có/không hợp lệ -> mặc định
    # "Biên tập viên" (vai trò phổ biến nhất) thay vì để trống, đúng nguyên
    # tắc "Missing IDs handled safely" — không crash, không để trống Hero.
    role_id = ed.get("role_id") or "bien-tap-vien"
    role_chip_html = render_role_chip(role_id)
    honors_html = "".join(render_honor_chip(h) for h in ed.get("honor_ids", []))
    honors_section = f'<div class="editor-honors">{honors_html}</div>' if honors_html else ""
    badges_html = "".join(render_badge_chip(b) for b in ed.get("badge_ids", []))
    badges_section = f'<div class="editor-badges">{badges_html}</div>' if badges_html else ""
    # Huân chương (Rev 16): cùng khối "Thành tựu" với Honors/Badges — nhỏ/
    # tinh gọn, không redesign Hero hiện có.
    medals_html = render_medals_html(ed.get("medals", []))
    medals_section = f'<div class="editor-medals">{medals_html}</div>' if medals_html else ""
    # PR4: bọc chung Honors+Badges (nguyên markup/CSS PR2, không đổi) trong 1
    # khối có id="thanh-tuu" để mục điều hướng nhanh "Thành tựu" có nơi nhảy tới.
    achievements_section = (f'<div id="thanh-tuu" tabindex="-1">{honors_section}{badges_section}{medals_section}</div>'
                             if (honors_section or badges_section or medals_section) else "")

    # Bài viết gần đây: giữ nguyên vòng lặp qua `arts` — chỉ thêm data-* cho
    # bộ lọc PR4 (Series/Chuyên mục/Năm), không đổi nội dung/thứ tự hiển thị.
    rows = ""
    for a in arts:
        s = SERIES_BY_SLUG[a["series"]]
        year = _parse_vn_date(a["date"]).year
        cats_attr = "|".join(a.get("tags", []))
        rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;" data-series="{s['slug']}" data-year="{year}" data-categories="{cats_attr}">
        <div class="media media--3-2" style="flex:0 0 220px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{_esc(a['dek'])}</p>
          <span class="byline">{a['date']} · {a['read_time']}</span>
        </div>
      </a>"""

    # Bộ lọc bài viết (PR4): chỉ hiện khi có > 1 bài. Options lấy thẳng từ
    # intel["series"]/intel["categories"]/intel["timeline"] (đã tính sẵn ở
    # PR3) — không tính lại danh sách distinct ở đây. Lọc chạy bằng JS thuần
    # ẩn/hiện DOM theo data-attribute có sẵn — không tính toán số liệu.
    filter_html = ""
    if len(arts) > 1:
        series_opts = "".join(f'<option value="{s["slug"]}">{s["name"]}</option>' for s in intel["series"])
        cat_opts = "".join(f'<option value="{c}">{c}</option>' for c in intel["categories"])
        year_opts = "".join(f'<option value="{t["year"]}">{t["year"]}</option>' for t in intel["timeline"])
        filter_html = f"""
    <div class="editor-filter" role="group" aria-label="Lọc bài viết">
      <label class="editor-filter__field"><span>Series</span>
        <select data-filter="series" aria-label="Lọc theo Series"><option value="">Tất cả Series</option>{series_opts}</select>
      </label>
      <label class="editor-filter__field"><span>Chuyên mục</span>
        <select data-filter="categories" aria-label="Lọc theo Chuyên mục"><option value="">Tất cả Chuyên mục</option>{cat_opts}</select>
      </label>
      <label class="editor-filter__field"><span>Năm</span>
        <select data-filter="year" aria-label="Lọc theo Năm xuất bản"><option value="">Tất cả các năm</option>{year_opts}</select>
      </label>
    </div>"""

    # Series: intel["series"] (PR3.1) đã được build.py tính sẵn — đúng những
    # series tác giả thực sự có bài, theo thứ tự SERIES chuẩn. Template chỉ
    # render, không tính/lọc lại. Tái dùng nguyên component
    # .series-band/.series-grid/.series-cell.
    series_cells = ""
    for s in intel["series"]:
        series_cells += f"""
      <a class="series-cell" href="{series_url(s['slug'])}">
        <span class="series-cell__code">{s['code']} · {s['num']}</span>
        <h3>{s['name']}</h3>
      </a>"""
    series_section = f"""
  <section id="series" tabindex="-1" class="series-band author-series js-reveal">
    <div class="container">
      <div class="section-head"><h2>Series</h2></div>
      <div class="series-grid">{series_cells}
      </div>
    </div>
  </section>""" if series_cells else ""

    # Chuyên mục (PR4): danh sách đầy đủ intel["categories"] (đã có sẵn từ
    # PR3), liên kết tới trang tag đã tồn tại — không thêm dữ liệu mới.
    category_links = "".join(f'<a href="{tag_url(slugify(c))}" class="tag">{_esc(c)}</a>' for c in intel["categories"])
    categories_section = f"""
  <section id="chuyen-muc" tabindex="-1" class="container author-categories js-reveal">
    <div class="section-head"><h2>Chuyên mục</h2></div>
    <div class="author-categories__list">{category_links}
    </div>
  </section>""" if intel["categories"] else ""

    # Dòng thời gian (PR4): render trực tiếp intel["timeline"] (PR3), mới
    # nhất trước — khớp thói quen "gần đây trước" của các khối khác.
    timeline_years = ""
    for year_block in reversed(intel["timeline"]):
        items = "".join(
            f'<li><a href="{article_url(a["slug"])}">{_esc(a["title"])}</a> <span class="byline">{a["date"]}</span></li>'
            for a in year_block["articles"]
        )
        timeline_years += f"""
      <div class="editor-timeline__year">
        <h3>{year_block['year']} <span class="byline">· {year_block['count']} bài</span></h3>
        <ul>{items}</ul>
      </div>"""
    timeline_section = f"""
  <section id="dong-thoi-gian" tabindex="-1" class="container author-timeline js-reveal">
    <div class="section-head"><h2>Dòng thời gian</h2></div>
    <div class="editor-timeline">{timeline_years}
    </div>
  </section>""" if intel["timeline"] else ""

    # Khám phá (PR4): Related Editors (EditorCard, dùng intel["related_editors"]
    # đã xếp hạng sẵn ở PR3 — không xếp lại), Featured Series + Chuyên mục
    # đóng góp nhiều nhất (2 hàm PR4 mới, không đụng vào hàm/data model PR3).
    related_cards = "".join(render_editor_card(r["name"]) for r in intel.get("related_editors", []))
    related_block = f"""
      <div class="discovery-block">
        <h3>Biên tập viên liên quan</h3>
        <div class="editor-card-grid">{related_cards}
        </div>
      </div>""" if related_cards else ""

    featured_series = compute_featured_series(arts, intel["series"])
    featured_series_cells = "".join(
        f'<a class="series-cell" href="{series_url(s["slug"])}">'
        f'<span class="series-cell__code">{s["code"]} · {s["num"]}</span><h3>{s["name"]}</h3>'
        f'<span class="byline">{s["article_count"]} bài</span></a>'
        for s in featured_series
    )
    featured_series_block = f"""
      <div class="discovery-block">
        <h3>Series nổi bật</h3>
        <div class="series-grid">{featured_series_cells}
        </div>
      </div>""" if featured_series_cells else ""

    frequent_categories = compute_frequent_categories(arts)
    frequent_cat_links = "".join(
        f'<a href="{tag_url(slugify(c["name"]))}" class="tag">{_esc(c["name"])} <span class="tag-count">{c["count"]}</span></a>'
        for c in frequent_categories
    )
    frequent_cat_block = f"""
      <div class="discovery-block">
        <h3>Chuyên mục đóng góp nhiều nhất</h3>
        <div class="author-categories__list">{frequent_cat_links}
        </div>
      </div>""" if frequent_cat_links else ""

    discovery_section = f"""
  <section class="container author-discovery js-reveal">
    <div class="section-head"><h2>Khám phá</h2></div>
    {related_block}
    {featured_series_block}
    {frequent_cat_block}
  </section>""" if (related_block or featured_series_block or frequent_cat_block) else ""

    # Điều hướng nhanh (PR4): chỉ liệt kê mục có section thực sự tồn tại trên
    # trang — đúng nguyên tắc "render only if data exists".
    nav_targets = [
        ("bai-viet", "Bài viết", True),
        ("series", "Series", bool(series_section)),
        ("chuyen-muc", "Chuyên mục", bool(categories_section)),
        ("dong-thoi-gian", "Dòng thời gian", bool(timeline_section)),
        ("thanh-tuu", "Thành tựu", bool(achievements_section)),
    ]
    quicknav_items = "".join(f'<li><a href="#{anchor}">{label}</a></li>' for anchor, label, show in nav_targets if show)
    quicknav_section = f"""
  <nav class="container editor-quicknav" aria-label="Điều hướng nhanh hồ sơ">
    <ul>{quicknav_items}
    </ul>
  </nav>""" if quicknav_items else ""

    pager_section = render_editor_pager(*nav_editors)

    # SEO (PR4): meta title/description tự sinh từ dữ liệu đã có (role +
    # bio + editor.metrics) — không thêm trường CMS mới. JSON-LD Person cùng
    # khuôn mẫu article_schema_json. og_type="profile" thay vì "website" mặc
    # định của page_wrap.
    role_label = EDITOR_ROLES.get(role_id, "Biên tập viên")
    m = intel["metrics"]
    seo_title = f"{name} — {role_label}"
    seo_desc = bio or (f"{name} — {role_label} tại {SITE_SETTINGS['site_name']}. "
                        f"{m['article_count']} bài viết đã xuất bản trên {m['series_count']} series.")
    schema = editor_schema_json(name, ed, intel)

    inner = f"""
  <section class="container author-hero js-reveal">
    <nav class="byline author-hero__breadcrumb" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / Biên tập viên
    </nav>
    <span class="eyebrow">Biên Tập Viên</span>
    {avatar_html}
    <h1 class="author-hero__name">{name}</h1>
    <div class="author-hero__role">{role_chip_html}</div>
    <p class="author-hero__stat">{len(arts)} bài viết đã xuất bản</p>
    <p class="author-hero__org">{SITE_SETTINGS['site_name']}</p>
    {achievements_section}
    {quote_html}
  </section>
{quicknav_section}
  <section id="bai-viet" tabindex="-1" class="container author-articles">
    <div class="section-head"><h2>Bài viết gần đây</h2></div>
    {filter_html}
    <div class="grid js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
  </section>
{series_section}
{categories_section}
{timeline_section}
{discovery_section}
{pager_section}
"""
    return page_wrap(seo_title, seo_desc, inner, path=author_url(name), image=avatar, og_type="profile", schema_json=schema)

def render_tag_page(tslug, tag_name, arts):
    """Trang lọc theo từ khóa: liệt kê mọi bài viết gắn thẻ này, không giới hạn
    trong một series. Tái sử dụng nguyên khuôn card + page_wrap của trang tác giả."""
    # Chuẩn hoá hiển thị "#tag": tag trong content đã có sẵn dấu # (quy ước
    # hiện tại của CMS) — tránh nhân đôi thành "##tag" nếu dữ liệu có/không có #.
    display_tag = "#" + tag_name.lstrip("#")
    rows = ""
    for a in arts:
        s = SERIES_BY_SLUG[a["series"]]
        rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 220px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{_esc(a['dek'])}</p>
          <span class="byline">{a['author']} · {a['date']} · {a['read_time']}</span>
        </div>
      </a>"""
    inner = f"""
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="all-tags.html">Chủ đề</a>
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow" style="font-size:var(--t-sm);">{display_tag}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;">Chủ đề: {display_tag}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);">{len(arts)} bài viết được gắn thẻ "{display_tag}".</p>
    </div>
    <div class="grid js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
  </section>
"""
    return page_wrap(display_tag, f'Tất cả bài viết về chủ đề "{display_tag}" trên The New Culture.', inner, path=tag_url(tslug))

def render_category_page(c):
    """Trang lọc theo chuyên mục (category) — liệt kê mọi bài viết được gán
    category này. Tái sử dụng nguyên khuôn card của render_tag_page(), không
    tạo component/CSS mới (Phase 2A: giữ nguyên thiết kế hiện có)."""
    arts = ARTICLES_BY_CATEGORY.get(c["slug"], [])
    rows = ""
    for a in arts:
        s = SERIES_BY_SLUG[a["series"]]
        rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 220px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{_esc(a['dek'])}</p>
          <span class="byline">{a['author']} · {a['date']} · {a['read_time']}</span>
        </div>
      </a>"""
    if not rows:
        rows = """
      <div style="grid-column:1/-1;padding:var(--s-8);text-align:center;border:1px dashed var(--c-line);">
        <p style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);text-transform:uppercase;letter-spacing:0.06em;">Chưa có bài viết nào</p>
        <p style="color:var(--c-ink-3);margin-top:var(--s-2);font-size:var(--t-sm);">Chuyên mục này đang chờ nội dung đầu tiên.</p>
      </div>"""
    desc_html = f'<p style="font-size:var(--t-md);color:var(--c-ink-2);">{c["desc"]}</p>' if c["desc"] else ""
    inner = f"""
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="all-categories.html">Chuyên mục</a>
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow" style="font-size:var(--t-sm);">Chuyên mục</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;">{c['name']}</h1>
      {desc_html}
      <p style="font-size:var(--t-md);color:var(--c-ink-2);margin-top:var(--s-2);">{len(arts)} bài viết trong chuyên mục này.</p>
    </div>
    <div class="grid js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
  </section>
"""
    return page_wrap(c["name"], c["desc"] or f'Chuyên mục {c["name"]} trên The New Culture.', inner, path=category_url(c["slug"]))

def render_all_categories():
    """Trang hub liệt kê toàn bộ chuyên mục — tái dùng nguyên khuôn
    .page-hero/.series-band/.series-cell của render_all_series()/
    render_all_tags(), không tạo component mới."""
    cells = ""
    for c in CATEGORIES:
        arts = ARTICLES_BY_CATEGORY.get(c["slug"], [])
        cells += f"""
      <a class="series-cell" href="{category_url(c['slug'])}">
        <h3>{c['name']}</h3>
        <span class="series-cell__code" style="margin-top:var(--s-3);color:var(--c-red);">{len(arts)} bài viết →</span>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--blue">Khám phá theo chuyên mục</span>
      <h1>Tất cả chuyên mục</h1>
      <p>Duyệt nội dung The New Culture theo chuyên mục biên tập.</p>
    </div>
  </section>
  <section class="series-band js-reveal" style="margin-top:0;">
    <div class="container">
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>
"""
    return page_wrap("Tất cả chuyên mục", "Duyệt tất cả chuyên mục trên The New Culture.", inner, path="all-categories.html")

def render_all_tags():
    """Trang hub liệt kê toàn bộ chủ đề (tag) đang có bài viết — điểm vào để
    duyệt Tag, tái dùng nguyên khuôn .page-hero/.series-band/.series-cell
    của render_all_series(), không tạo component mới."""
    cells = ""
    for tslug in sorted(TAGS_BY_SLUG, key=lambda k: TAGS_BY_SLUG[k]["name"].lower()):
        data = TAGS_BY_SLUG[tslug]
        display = "#" + data["name"].lstrip("#")
        cells += f"""
      <a class="series-cell" href="{tag_url(tslug)}">
        <h3>{display}</h3>
        <span class="series-cell__code" style="margin-top:var(--s-3);color:var(--c-red);">{len(data['articles'])} bài viết →</span>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--blue">Khám phá theo chủ đề</span>
      <h1>Tất cả chủ đề</h1>
      <p>Duyệt toàn bộ từ khóa (tag) đang được gắn trên các bài viết của The New Culture.</p>
    </div>
  </section>
  <section class="series-band js-reveal" style="margin-top:0;">
    <div class="container">
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>
"""
    return page_wrap("Tất cả chủ đề", "Duyệt tất cả tag/chủ đề trên The New Culture.", inner, path="all-tags.html")

def render_all_series():
    cells = ""
    for s in SERIES:
        arts = ARTICLES_BY_SERIES.get(s["slug"], [])
        cells += f"""
      <a class="series-cell" href="{series_url(s['slug'])}">
        <span class="series-cell__code">{s['code']} · {s['num']}</span>
        <h3>{s['name']}</h3>
        <p>{s['desc']}</p>
        <span class="series-cell__code" style="margin-top:var(--s-3);color:var(--c-red);">{len(arts)} bài viết →</span>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">Bản đồ tri thức — TNCOS</span>
      <h1>{len(SERIES)} Series của The New Culture</h1>
      <p>Toàn bộ hệ thống tuyến nội dung của TNC. Mỗi series là một vùng tích lũy tri thức và lưu trữ riêng biệt về văn hóa hip-hop underground Việt Nam.</p>
    </div>
  </section>
  <section class="series-band js-reveal" style="margin-top:0;">
    <div class="container">
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>
"""
    return page_wrap("Tất cả Series", f"{len(SERIES)} tuyến nội dung của The New Culture", inner)

def render_archive_page():
    """Trang hub 'Toàn bộ bài viết' — danh sách phẳng mọi bài viết, không lọc
    theo series/tag/tác giả. Tái dùng nguyên khuôn card-list của trang series
    (kể cả cơ chế infinite scroll .js-infinite-item/.js-infinite-sentinel đã
    có sẵn), không tạo component hay cơ chế phân trang mới."""
    rows = ""
    for idx, a in enumerate(ARTICLES):
        s = SERIES_BY_SLUG[a["series"]]
        hidden_attr = ' style="display:none;"' if idx >= 8 else ""
        rows += f"""
      <a class="card js-infinite-item" data-idx="{idx}"{hidden_attr} href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 260px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{_esc(a['dek'])}</p>
          <span class="byline">{a['author']} · {a['date']} · {a['read_time']}</span>
        </div>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">Archive — TNCOS</span>
      <h1>Toàn bộ bài viết</h1>
      <p>Danh sách đầy đủ mọi bài viết đã xuất bản trên The New Culture, không giới hạn theo series hay chủ đề — xếp theo thứ tự ưu tiên/mới nhất.</p>
    </div>
    <div class="grid js-infinite-list js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
    <div class="js-infinite-sentinel" style="height:1px;"></div>
  </section>
"""
    return page_wrap("Toàn bộ bài viết", "Danh sách đầy đủ mọi bài viết đã xuất bản trên The New Culture.", inner, path="archive.html")

def render_video_page():
    _d = ["38:12","24:50","45:03","31:20","18:44","52:10"]
    vids = [(ARTICLES[i], _d[i]) for i in range(min(6, len(ARTICLES)))]
    cards = ""
    for a,dur in vids:
        s = SERIES_BY_SLUG[a["series"]]
        cards += f"""
      <a class="video-card" href="{article_url(a['slug'])}">
        <div class="media media--16-9"><div class="media__zoom"></div><div class="play"><span></span></div><span class="dur">{dur}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{_esc(a['title'])}</h3>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">Video</span>
      <h1>TNC Video</h1>
      <p>Toàn bộ nội dung video của The New Culture — phỏng vấn dài kỳ, hậu trường sản xuất và các buổi bàn tròn. Định dạng phỏng vấn dài là trọng tâm.</p>
    </div>
    <div class="video-row" style="grid-template-columns:repeat(3,1fr);">{cards}
    </div>
  </section>
"""
    return page_wrap("Video", "Toàn bộ video của The New Culture", inner)

def render_events_page():
    events = [
        ("15.07.2026","Cypher đường phố Sài Gòn","Quận 1, TP.HCM","Đêm cypher mở, tự do tham gia — do cộng đồng tổ chức."),
        ("22.07.2026","TNC Sessions Live #15","Hà Nội","Buổi ghi hình phỏng vấn công khai với khách mời là một producer kỳ cựu."),
        ("05.08.2026","Workshop sản xuất beat","Đà Nẵng","Buổi chia sẻ kiến thức mở cho nghệ sĩ trẻ khu vực miền Trung."),
        ("19.08.2026","Showcase nghệ sĩ mới","TP.HCM","Đêm giới thiệu các dự án mới thuộc tuyến TNC Discovery."),
    ]
    rows = ""
    for date,title,loc,desc in events:
        rows += f"""
      <a class="card" href="su-kien.html" style="flex-direction:row;gap:var(--s-5);align-items:center;border-bottom:1px solid var(--c-line);padding-bottom:var(--s-5);">
        <div style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-red);min-width:110px;font-weight:600;">{date}</div>
        <div>
          <h3 style="font-size:var(--t-lg);margin-bottom:var(--s-1);">{title}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-1);">{desc}</p>
          <span class="byline">{loc}</span>
        </div>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--green">Sự kiện</span>
      <h1>Sự kiện cộng đồng</h1>
      <p>Lịch các sự kiện, workshop, cypher và showcase mà TNC theo dõi và đồng hành cùng cộng đồng underground.</p>
    </div>
    <div class="grid" style="grid-template-columns:1fr;gap:var(--s-5);">{rows}
    </div>
  </section>
"""
    return page_wrap("Sự kiện", "Lịch sự kiện cộng đồng underground", inner)

def render_about_page():
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">Về chúng tôi</span>
      <h1>The New Culture</h1>
      <p>Nền tảng truyền thông độc lập tài liệu hóa, phân tích và hệ thống hóa văn hóa hip-hop underground Việt Nam đương đại.</p>
    </div>
    <div class="prose">
      <p>The New Culture (TNC) ra đời từ một niềm tin đơn giản: văn hóa underground Việt Nam đang vận động mỗi ngày, nhưng phần lớn giá trị của nó không được ghi lại một cách có hệ thống. Khi những nhân chứng và tác phẩm của một thời kỳ biến mất, cả một thế hệ sau phải bắt đầu lại từ đầu.</p>
      <p>TNC tồn tại để giải quyết khoảng trống đó — không chỉ đưa tin, mà xây dựng một kho lưu trữ sống (Archive) về con người, tác phẩm, cột mốc và tư tưởng đã và đang định hình scene.</p>
      <h2>Cách chúng tôi làm việc</h2>
      <p>Toàn bộ nội dung được tổ chức theo {len(SERIES)} tuyến series, mỗi tuyến là một vùng tri thức chuyên biệt — từ hồ sơ nghệ sĩ, phân tích tác phẩm, đến ghi chép văn hóa và phỏng vấn chuyên sâu. Đây là cách chúng tôi biến thông tin rời rạc thành tài sản tri thức có cấu trúc.</p>
      <h2>Nguyên tắc biên tập</h2>
      <p>Chính xác, độc lập và tôn trọng đối tượng được phản ánh. Chúng tôi ưu tiên chiều sâu hơn tốc độ, và bối cảnh hơn giật gân.</p>
    </div>
    <div class="info-cards">
      <div class="info-card"><div class="k">Định dạng</div><h3>Đa nền tảng</h3><p>Facebook, Instagram, YouTube và TikTok — mỗi nền tảng một vai trò riêng.</p></div>
      <div class="info-card"><div class="k">Nội dung</div><h3>{len(SERIES)} Series</h3><p>Hệ thống tuyến nội dung bao phủ toàn bộ hệ sinh thái underground.</p></div>
      <div class="info-card"><div class="k">Sứ mệnh</div><h3>Archive</h3><p>Lưu giữ giá trị văn hóa để không thế hệ nào phải bắt đầu lại từ đầu.</p></div>
    </div>
  </section>
"""
    return page_wrap("Về TNC", "Về The New Culture", inner)

def render_contact_page():
    inner = """
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--blue">Liên hệ</span>
      <h1>Liên hệ tòa soạn</h1>
      <p>Có câu chuyện muốn kể, thông tin muốn chia sẻ, hoặc đề xuất hợp tác? Chúng tôi luôn lắng nghe.</p>
    </div>
    <form class="contact-grid" action="lien-he.html" method="get">
      <label>Họ tên<input type="text" name="name" required></label>
      <label>Email<input type="email" name="email" required></label>
      <label class="full">Chủ đề<input type="text" name="subject"></label>
      <label class="full">Nội dung<textarea name="message"></textarea></label>
      <div class="full"><button type="submit" class="btn btn--solid">Gửi liên hệ</button></div>
    </form>
    <div class="prose" style="margin-top:var(--s-8);">
      <h2>Kênh trực tiếp</h2>
      <p>Email biên tập: <a href="mailto:thenewculture.universe@gmail.com" style="color:var(--c-red);">thenewculture.universe@gmail.com</a><br>Hợp tác &amp; thương mại: <a href="mailto:thenewculture.universe@gmail.com" style="color:var(--c-red);">thenewculture.universe@gmail.com</a></p>
    </div>
  </section>
"""
    return page_wrap("Liên hệ", "Liên hệ tòa soạn The New Culture", inner)

def render_partner_page():
    inner = """
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--amber">Hợp tác</span>
      <h1>Hợp tác cùng TNC</h1>
      <p>Chúng tôi hợp tác với nghệ sĩ, label, thương hiệu và nhà tổ chức chia sẻ cam kết với văn hóa underground.</p>
    </div>
    <div class="info-cards">
      <div class="info-card"><div class="k">01</div><h3>Nội dung tài trợ</h3><p>Bài viết, phỏng vấn và series được sản xuất theo tiêu chuẩn biên tập của TNC.</p></div>
      <div class="info-card"><div class="k">02</div><h3>Đồng tổ chức sự kiện</h3><p>Cypher, workshop, showcase — đồng hành cùng cộng đồng.</p></div>
      <div class="info-card"><div class="k">03</div><h3>Dự án Archive</h3><p>Hợp tác tài liệu hóa dài hạn về một nghệ sĩ, label hoặc giai đoạn.</p></div>
    </div>
    <div class="prose" style="margin-top:var(--s-8);">
      <p>Để bắt đầu, gửi đề xuất tới <a href="mailto:thenewculture.universe@gmail.com" style="color:var(--c-red);"><strong>thenewculture.universe@gmail.com</strong></a> hoặc qua <a href="lien-he.html" style="color:var(--c-red);">trang liên hệ</a>.</p>
    </div>
  </section>
"""
    return page_wrap("Hợp tác", "Cơ hội hợp tác cùng The New Culture", inner)

def render_careers_page():
    roles = [
        ("Biên tập viên","Toàn thời gian · Hà Nội","Viết và biên tập nội dung cho các tuyến series, phỏng vấn nhân vật trong ngành."),
        ("Nhà sản xuất video","Toàn thời gian · TP.HCM","Sản xuất nội dung video phỏng vấn dài kỳ và hậu trường."),
        ("Cộng tác viên","Linh hoạt · Từ xa","Đóng góp bài viết theo chủ đề cho các tuyến nội dung phù hợp."),
    ]
    rows = ""
    for title,meta,desc in roles:
        rows += f"""
      <div class="card" style="border-bottom:1px solid var(--c-line);padding-bottom:var(--s-5);">
        <h3 style="font-size:var(--t-lg);margin-bottom:var(--s-1);">{title}</h3>
        <span class="byline" style="margin-bottom:var(--s-2);display:block;">{meta}</span>
        <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-3);">{desc}</p>
        <a class="btn btn--ghost" href="lien-he.html">Ứng tuyển</a>
      </div>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--purple">Tuyển dụng</span>
      <h1>Gia nhập TNC</h1>
      <p>Chúng tôi tìm những người tin vào giá trị của việc ghi lại và hệ thống hóa văn hóa underground.</p>
    </div>
    <div class="grid" style="grid-template-columns:1fr;gap:var(--s-5);">{rows}
    </div>
  </section>
"""
    return page_wrap("Tuyển dụng", "Cơ hội nghề nghiệp tại The New Culture", inner)

def render_subscribe_page(title, desc, eyebrow):
    socials = active_socials()
    if socials:
        links_html = ", ".join(
            f'<a href="{url}" target="_blank" rel="noopener" style="color:var(--c-red);">{label}</a>'
            for label, url in socials
        )
        social_line = f'<p>Bạn cũng có thể theo dõi TNC trên các nền tảng: {links_html}.</p>'
    else:
        social_line = ""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{desc}</p>
    </div>
    <form class="contact-grid" action="{'newsletter.html'}" method="get" style="max-width:480px;">
      <label class="full">Email<input type="email" name="email" required placeholder="email@example.com"></label>
      <div class="full"><button type="submit" class="btn btn--solid">Đăng ký nhận</button></div>
    </form>
    <div class="prose" style="margin-top:var(--s-7);">
      {social_line}
    </div>
  </section>
"""
    return page_wrap(title, desc, inner)

def render_sessions_page():
    _sd = ["38:12","31:20","52:10"]
    eps = [(ARTICLES[i], _sd[i]) for i in range(min(3, len(ARTICLES)))]
    cards = ""
    for a,dur in eps:
        s = SERIES_BY_SLUG[a["series"]]
        cards += f"""
      <a class="video-card" href="{article_url(a['slug'])}">
        <div class="media media--16-9"><div class="media__zoom"></div><div class="play"><span></span></div><span class="dur">{dur}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">TNC Sessions</span>
        <h3>{_esc(a['title'])}</h3>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow">Chương trình</span>
      <h1>TNC Sessions</h1>
      <p>Series phỏng vấn dài kỳ đặc trưng của TNC — những cuộc trò chuyện chuyên sâu với nghệ sĩ, producer và những người đứng sau ngành.</p>
    </div>
    <div class="video-row" style="grid-template-columns:repeat(3,1fr);">{cards}
    </div>
  </section>
"""
    return page_wrap("TNC Sessions", "Series phỏng vấn dài kỳ của The New Culture", inner)


def _compute_sw_cache_version():
    """Sinh cache version cho Service Worker từ hash nội dung nguồn, KHÔNG
    dùng timestamp/thời gian hiện tại. Trước đây build_ts=str(int(time.time()))
    khiến public/sw.js đổi ở MỌI lần build dù nội dung không hề thay đổi —
    gây commit thừa và merge conflict giữa các branch chỉ vì build lại.
    Hash phần content/ CÒN THẬT SỰ ảnh hưởng output (settings, profiles,
    campaigns, magazine — articles/authors/series/categories/tags giờ đọc từ
    Supabase, KHÔNG còn là file, xem load_articles()/load_series()/
    load_categories()/load_editors() — cố ý KHÔNG đưa vào hash này) cộng với
    chính build.py và style.css (logic hiển thị/giao diện cũng quyết định
    output, không chỉ nội dung) -> build lại trên đúng cùng một nguồn luôn ra
    đúng 1 version giống hệt (không tạo diff), nhưng vẫn tự đổi — tự
    invalidate cache cũ — ngay khi có bất kỳ thay đổi thật sự nào.

    LƯU Ý: hash này chỉ ảnh hưởng cache-busting cho TÀI NGUYÊN TĨNH (CSS/JS/
    ảnh, chiến lược cache-first trong sw.js) — điều hướng trang (HTML) luôn
    fetch mạng trước (network-first, xem 'fetch' handler bên dưới), nên bài
    viết/category mới từ Supabase luôn hiển thị đúng ngay cả khi hash này
    không đổi. Giữ nguyên hành vi cache invalidation, không đụng logic
    runtime của Service Worker."""
    import hashlib
    h = hashlib.sha256()
    src_files = []
    # Rev "Phase 2A cleanup": content/articles/ và content/editors/ không còn
    # được đọc (dữ liệu đã ở Supabase, 2 thư mục này chỉ còn là bản lưu trữ
    # lịch sử — xem content/articles/LEGACY.md, content/editors/LEGACY.md) —
    # loại khỏi vòng lặp hash để sửa nội dung cũ ở đó (nếu có) không còn kích
    # hoạt build/cache-bust giả (trước đây os.walk(content/) quét luôn cả 2
    # thư mục chết này).
    for sub in ("settings", "profiles", "campaigns", "magazine"):
        sub_dir = os.path.join(REPO_ROOT, "content", sub)
        for root, _dirs, files in os.walk(sub_dir):
            for fn in files:
                src_files.append(os.path.join(root, fn))
    src_files.append(os.path.abspath(__file__))
    src_files.append(os.path.join(os.path.dirname(__file__), "style.css"))
    src_files.append(os.path.join(os.path.dirname(__file__), "magazine.py"))
    for path in sorted(src_files):
        h.update(os.path.relpath(path, REPO_ROOT).encode("utf-8"))
        with open(path, "rb") as f:
            h.update(f.read())
    return h.hexdigest()[:12]

# -----------------------------------------------------------------
# TNC MAGAZINE (Monthly Digital Magazine) — RENDER
# Chỉ render danh sách/liên kết tới Article đã có (article_url, zoom,
# art_code...) — không render lại toàn bộ nội dung bài viết, không tạo
# bản sao dữ liệu. Logic "issue nào chứa bài nào / số báo bao nhiêu" nằm
# hoàn toàn trong scripts/magazine.py (Issue Builder); các hàm dưới đây
# chỉ lo phần trình bày HTML, tái dùng đúng component/class đã có.
# -----------------------------------------------------------------
def render_magazine_toc(issue):
    """Contents — phong cách tạp chí in: không đánh số, không card lớn,
    chỉ tên series nhỏ phía trên tiêu đề (xem .magazine-toc trong style.css)."""
    items = ""
    for a in issue["articles"]:
        s = SERIES_BY_SLUG[a["series"]]
        items += f"""
      <a href="{article_url(a['slug'])}">
        <span class="magazine-toc__series">{s['name']}</span>
        <span class="magazine-toc__title">{_esc(a['title'])}</span>
      </a>"""
    return f"""
    <div class="magazine-toc">{items}
    </div>"""

def render_magazine_article_list(issue):
    """Danh sách bài đầy đủ của Issue: Title/Series/Author/Time/Thumbnail/
    Read Article — tái dùng đúng khuôn .card hàng ngang đã dùng cho Series/
    Archive/Tag/Author, không tạo component thẻ bài mới. Bao gồm cả bài
    Cover Story (không loại trừ) — đây là trùng lặp TRÌNH BÀY (highlight
    thêm 1 lần), không phải trùng lặp DỮ LIỆU."""
    rows = ""
    for a in issue["articles"]:
        s = SERIES_BY_SLUG[a["series"]]
        rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 220px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{_esc(a['title'])}</h3>
          <span class="byline">{a['author']} · {a['read_time']}</span>
        </div>
      </a>"""
    return f"""
    <div class="grid js-reveal" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>"""

def render_magazine_cover_story(a):
    """Khối Cover Story nổi bật — dùng chung ở cả trang Issue và khối Trang
    chủ (xem .magazine-coverstory trong style.css), chỉ render nếu Issue
    đã resolve được Cover Story thành 1 Article thật (magazine.py trả về
    None nếu editor chưa chọn hoặc chọn slug không khớp bài nào)."""
    if not a:
        return ""
    s = SERIES_BY_SLUG[a["series"]]
    return f"""
      <a class="magazine-coverstory" href="{article_url(a['slug'])}">
        <div class="media media--3-2">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow--red">Cover Story</span>
          <h3 style="font-size:var(--t-2xl);margin:var(--s-3) 0;">{_esc(a['title'])}</h3>
          <span class="byline">{a['author']} · {a['date']}</span>
          <span class="btn btn--ghost" style="margin-top:var(--s-4);">Read Article →</span>
        </div>
      </a>"""

def render_magazine_issue_page(issue):
    path = magazine.issue_url(issue)
    title = f"TNC Magazine — Issue #{issue['number_display']}"
    month_vn = magazine.format_month_year_vn(issue["month"], issue["year"])
    desc = issue["editors_note"] or f"Số báo {issue['number_display']} của TNC Magazine, {month_vn} — {len(issue['articles'])} bài viết."
    cover_html = (f'<img src="{issue["cover_image"]}" alt="Issue #{issue["number_display"]}" loading="eager">'
                  if issue["cover_image"] else "")
    note_html = (f'<p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;margin-top:var(--s-4);">{issue["editors_note"]}</p>'
                 if issue["editors_note"] else "")
    cover_story_html = render_magazine_cover_story(issue["cover_story"])
    cover_story_section = (f"""
    <div class="js-reveal" style="margin-bottom:var(--s-8);">
      <div class="section-head"><h2>Cover Story</h2></div>
      {cover_story_html}
    </div>""" if cover_story_html else "")

    html = head(title, desc, path=path, image=issue["cover_image"], og_type="article") + masthead()
    html += f"""
<main>
  <section class="container" style="padding-top:var(--s-6);">
    <nav class="byline" style="margin-bottom:var(--s-6);" aria-label="breadcrumb">
      <a href="index.html">Trang chủ</a> / <a href="magazine-archive.html">TNC Magazine</a> / Issue #{issue['number_display']}
    </nav>

    <div class="magazine-hero">
      <div class="media">{cover_html}</div>
      <div>
        <span class="eyebrow eyebrow--red">TNC Magazine</span>
        <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;">Issue #{issue['number_display']}</h1>
        <p class="byline" style="font-size:var(--t-md);">{month_vn} · {len(issue['articles'])} bài viết</p>
        {note_html}
      </div>
    </div>
    {cover_story_section}
    <div class="js-reveal" style="margin-bottom:var(--s-8);">
      <div class="section-head"><h2>Contents</h2></div>
      {render_magazine_toc(issue)}
    </div>

    <div>
      <div class="section-head"><h2>Trong số này</h2></div>
      {render_magazine_article_list(issue)}
    </div>
  </section>
</main>
"""
    html += newsletter() + footer()
    return html

def render_magazine_issue_card(issue):
    """Thẻ bìa cho Magazine Archive — tái dùng nguyên .poster-card (đã có
    sẵn cho TNC Community), không tạo component thẻ mới."""
    month_vn = magazine.format_month_year_vn(issue["month"], issue["year"])
    img = (f'<img src="{issue["cover_image"]}" alt="Issue #{issue["number_display"]}" loading="lazy">'
           if issue["cover_image"] else "")
    return f"""
      <a class="poster-card" href="{magazine.issue_url(issue)}">
        <div class="poster-card__media">
          {img}
          <span class="poster-card__archive">Issue {issue['number_display']}</span>
        </div>
        <div class="poster-card__body">
          <h3 class="poster-card__title">Issue #{issue['number_display']}</h3>
          <span class="poster-card__meta">{month_vn} · {len(issue['articles'])} bài viết</span>
        </div>
      </a>"""

def render_magazine_archive_page():
    """Magazine Archive — toàn bộ số báo đã xuất bản, mới nhất trước."""
    ordered = sorted(MAGAZINE_ISSUES, key=lambda i: i["number"], reverse=True)
    cards = "".join(render_magazine_issue_card(i) for i in ordered)
    if not cards:
        cards = """
      <div style="grid-column:1/-1;padding:var(--s-8);text-align:center;border:1px dashed var(--c-line);">
        <p style="font-family:var(--f-mono);font-size:var(--t-sm);color:var(--c-ink-3);text-transform:uppercase;letter-spacing:0.06em;">Chưa có số báo nào</p>
        <p style="color:var(--c-ink-3);margin-top:var(--s-2);font-size:var(--t-sm);">Số báo đầu tiên của TNC Magazine đang được biên tập.</p>
      </div>"""
    inner = f"""
  <section class="container">
    <div class="page-hero">
      <span class="eyebrow eyebrow--red">TNC Magazine</span>
      <h1>Magazine Archive</h1>
      <p>Toàn bộ số báo TNC Magazine — mỗi số tự động tổng hợp các bài viết xuất bản trong cùng một tháng trên The New Culture.</p>
    </div>
    <div class="poster-grid js-reveal">{cards}
    </div>
  </section>
"""
    return page_wrap("Magazine Archive", "Toàn bộ số báo TNC Magazine.", inner, path="magazine-archive.html")

def render_homepage_magazine_block():
    """Khối 'TNC Magazine' trên Trang chủ — bố cục editorial spread 2 cột
    (~1/3 bìa / ~2/3 panel biên tập), như 1 cuốn tạp chí thật đặt trên
    bàn: chỉ typography + whitespace, không card/border/shadow/bo góc
    (xem .magazine-spread trong style.css). Panel bên phải đúng thứ tự
    Issue Number -> Month -> Cover Story (khối riêng, không nằm trong
    Contents) -> Contents (nhóm theo Series) -> Read Issue. Luôn hiện số
    mới nhất theo Issue Number, tự ẩn hoàn toàn nếu chưa có số báo đã
    xuất bản nào.

    Bìa LUÔN hiển thị đủ 100%, không crop/zoom/stretch: object-fit:contain
    + width/height thật của ảnh (đọc bằng image_dimensions(), không
    hardcode) để trình duyệt tự tính đúng aspect-ratio và không bị Layout
    Shift khi ảnh chưa tải xong."""
    issue = magazine.latest_issue(MAGAZINE_ISSUES)
    if not issue:
        return ""
    cover_html = ""
    cover_ratio_style = ""
    if issue["cover_image"]:
        dims = image_dimensions(os.path.join(REPO_ROOT, "public", issue["cover_image"].lstrip("/")))
        w, h = dims if dims else (3, 4)  # fallback hợp lý nếu không đọc được kích thước thật
        cover_ratio_style = f' style="aspect-ratio:{w}/{h};"'
        cover_html = (f'<img src="{issue["cover_image"]}" alt="Issue #{issue["number_display"]}" '
                      f'width="{w}" height="{h}" fetchpriority="high" decoding="async">')
    month_vn = magazine.format_month_year_vn(issue["month"], issue["year"])
    cover_story = issue["cover_story"]
    cover_story_html = (f"""
      <div class="magazine-spread__coverstory">
        <span class="eyebrow eyebrow--red">Cover Story</span>
        <h3><a href="{article_url(cover_story['slug'])}">{cover_story['title']}</a></h3>
      </div>""" if cover_story else "")

    # Contents: nhóm theo Series (thứ tự chuẩn của SERIES), loại trừ Cover
    # Story — bài đó đã có khối riêng ngay phía trên, không lặp lại ở đây.
    contents_articles = [a for a in issue["articles"]
                          if not cover_story or a["slug"] != cover_story["slug"]]
    by_series = {}
    for a in contents_articles:
        by_series.setdefault(a["series"], []).append(a)
    groups_html = ""
    for s in SERIES:
        group = by_series.get(s["slug"])
        if not group:
            continue
        items = "".join(f'<li><a href="{article_url(a["slug"])}">{_esc(a["title"])}</a></li>' for a in group)
        groups_html += f"""
        <div class="magazine-spread__group">
          <span class="magazine-spread__group-label">{s['name']}</span>
          <ul class="magazine-spread__group-list">{items}
          </ul>
        </div>"""

    return f"""
  <section class="section container js-reveal">
    <div class="section-head"><h2>TNC Magazine</h2><a class="more" href="magazine-archive.html">Xem toàn bộ số báo →</a></div>
    <div class="magazine-spread">
      <a href="{magazine.issue_url(issue)}" class="magazine-spread__cover" aria-label="Đọc Issue #{issue['number_display']}"{cover_ratio_style}>{cover_html}</a>
      <div class="magazine-spread__panel">
        <span class="eyebrow eyebrow--red">Issue #{issue['number_display']}</span>
        <p class="magazine-spread__month">{month_vn} · {len(issue['articles'])} bài viết</p>
        {cover_story_html}
        <div class="magazine-spread__contents">
          <h3 class="magazine-spread__contents-title">Contents</h3>
          {groups_html}
        </div>
        <a href="{magazine.issue_url(issue)}" class="magazine-spread__cta">Read Issue →</a>
      </div>
    </div>
  </section>
"""

def render_article_magazine_notice(a):
    """'Published in TNC Magazine' — chỉ hiện nếu bài viết này thực sự
    thuộc một Issue đã xuất bản (tính lại mỗi build, không lưu quan hệ
    này ở đâu trong dữ liệu bài viết)."""
    issue = magazine.issue_for_article(MAGAZINE_ISSUES, a["slug"])
    if not issue:
        return ""
    month_vn = magazine.format_month_year_vn(issue["month"], issue["year"])
    return f"""
    <div class="container" style="max-width:680px;">
      <div class="magazine-notice">
        <div>
          <span class="magazine-notice__label">Published in</span><br>
          <span class="magazine-notice__issue">TNC Magazine — Issue #{issue['number_display']}</span><br>
          <span class="magazine-notice__issue" style="font-weight:600;">{month_vn}</span>
        </div>
        <a class="btn btn--ghost" href="{magazine.issue_url(issue)}" style="margin-left:auto;">View Issue</a>
      </div>
    </div>"""

def main():
    import shutil, glob as _glob
    os.makedirs(OUT, exist_ok=True)

    # Dọn các trang cũ trước khi build lại: xóa mọi .html và style.css cũ trong public
    # (giữ nguyên thư mục uploads chứa ảnh; admin sẽ được copy lại bên dưới)
    for old in _glob.glob(os.path.join(OUT, "*.html")):
        os.remove(old)
    old_css = os.path.join(OUT, "style.css")
    if os.path.exists(old_css):
        os.remove(old_css)

    src_css = os.path.join(os.path.dirname(__file__), "style.css")
    dst_css = os.path.join(OUT, "style.css")
    shutil.copy(src_css, dst_css)
    with open(dst_css, "a", encoding="utf-8") as f:
        f.write(ARTICLE_CSS)

    # Trang 404 tùy chỉnh
    page_404 = head("Không tìm thấy trang", "Trang bạn tìm không tồn tại hoặc đã bị di chuyển.", path="404.html", append_site_name=True) + masthead()
    page_404 += """
<main>
  <section class="container page-404">
    <div class="page-404__code">404</div>
    <h1 class="page-404__title">Trang này đã lạc trong underground.</h1>
    <p class="page-404__desc">Đường dẫn không tồn tại hoặc đã bị gỡ. Quay lại trang chủ để tiếp tục khám phá.</p>
    <a href="/" class="btn btn--solid">Về trang chủ</a>
  </section>
</main>
""" + footer()
    with open(os.path.join(OUT, "404.html"), "w", encoding="utf-8") as f:
        f.write(page_404)

    # PWA: manifest.json + service worker cơ bản (cache-first cho tài nguyên tĩnh)
    manifest = {
        "name": SITE_SETTINGS["site_name"], "short_name": "TNC",
        "start_url": "/", "display": "standalone",
        "background_color": "#FFFFFF", "theme_color": "#E11D0F",
        "icons": [
            {"src": SITE_SETTINGS["favicon_image"], "sizes": "192x192", "type": "image/png"},
            {"src": SITE_SETTINGS["favicon_image"], "sizes": "512x512", "type": "image/png"},
            {"src": SITE_SETTINGS["favicon_image"], "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        import json as _json
        _json.dump(manifest, f, ensure_ascii=False)
    cache_version = _compute_sw_cache_version()
    with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as f:
        f.write("""const CACHE='tnc-""" + cache_version + """';
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  // Khu vực quản trị CMS (/admin/) — không can thiệp. Sveltia CMS cần luôn
  // lấy config.yml và mọi tài nguyên trực tiếp từ mạng; để service worker
  // cache khu vực này có thể khiến CMS đọc phải bản cấu hình cũ hoặc báo lỗi
  // "không lấy được cấu hình" khi cache trống mà mạng gặp trục trặc thoáng qua.
  if(new URL(e.request.url).pathname.startsWith('/admin/'))return;
  // Điều hướng trang (HTML) — luôn ưu tiên bản mới nhất từ mạng, tránh
  // hiển thị bản cache cũ khi đã có nội dung mới trên server.
  if(e.request.mode==='navigate'){
    e.respondWith(
      fetch(e.request).then(res=>{
        caches.open(CACHE).then(c=>c.put(e.request,res.clone()));
        return res;
      }).catch(()=>caches.match(e.request))
    );
    return;
  }
  // Tài nguyên tĩnh (ảnh, CSS) — cache-first cho tốc độ, vẫn cập nhật nền.
  // Nếu vừa không có trong cache vừa mất mạng, trả thẳng kết quả fetch (kể
  // cả lỗi) thay vì "cached" (undefined) — tránh respondWith nhận giá trị
  // không hợp lệ khiến trình duyệt báo lỗi mạng chung chung, khó chẩn đoán.
  e.respondWith(
    caches.match(e.request).then(cached=>{
      if(cached)return cached;
      return fetch(e.request).then(res=>{
        if(res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));
        return res;
      });
    })
  );
});""")

    # Copy giao diện quản trị (admin) vào public để Cloudflare phục vụ
    admin_src = os.path.join(REPO_ROOT, "admin")
    admin_dst = os.path.join(OUT, "admin")
    if os.path.isdir(admin_src):
        if os.path.isdir(admin_dst):
            shutil.rmtree(admin_dst)
        shutil.copytree(admin_src, admin_dst)

    # Giữ nguyên thư mục ảnh uploads nếu đã có (không xóa khi build lại)
    os.makedirs(os.path.join(OUT, "uploads"), exist_ok=True)

    with open(os.path.join(OUT,"index.html"),"w",encoding="utf-8") as f:
        f.write(render_index())
    for s in SERIES:
        with open(os.path.join(OUT, series_url(s["slug"])),"w",encoding="utf-8") as f:
            if s["slug"] == "tnc-profiles":
                f.write(render_profiles_series_page(s))
            elif s["slug"] == "tnc-community":
                f.write(render_community_series_page(s))
            elif s["slug"] == "tnc-premium":
                f.write(render_premium_landing_page(s))
            else:
                f.write(render_series_page(s))
    for a in ARTICLES:
        with open(os.path.join(OUT, article_url(a["slug"])),"w",encoding="utf-8") as f:
            f.write(render_article_page(a))

    # Phase 2A: trang chuyên mục (Category) — lần đầu category có trang công khai
    for c in CATEGORIES:
        with open(os.path.join(OUT, category_url(c["slug"])),"w",encoding="utf-8") as f:
            f.write(render_category_page(c))

    # Trang chi tiết hồ sơ nhân vật/đơn vị (TNC Profiles)
    for p in PROFILES:
        with open(os.path.join(OUT, profile_url(p["slug"])),"w",encoding="utf-8") as f:
            f.write(render_profile_page(p))

    # TNC Magazine (Monthly Digital Magazine) — mỗi Issue đã xuất bản 1 trang riêng
    for issue in MAGAZINE_ISSUES:
        with open(os.path.join(OUT, magazine.issue_url(issue)),"w",encoding="utf-8") as f:
            f.write(render_magazine_issue_page(issue))

    # trang phụ
    extra = {
        "all-series.html": render_all_series(),
        "all-categories.html": render_all_categories(),
        "all-tags.html": render_all_tags(),
        "archive.html": render_archive_page(),
        "magazine-archive.html": render_magazine_archive_page(),
        "video.html": render_video_page(),
        "search.html": render_search_page(),
        "su-kien.html": render_events_page(),
        "ve-tnc.html": render_about_page(),
        "lien-he.html": render_contact_page(),
        "hop-tac.html": render_partner_page(),
        "tuyen-dung.html": render_careers_page(),
        "tnc-sessions.html": render_sessions_page(),
        "newsletter.html": render_subscribe_page("Newsletter", "Nhận tóm tắt tin tức, phỏng vấn và nghiên cứu underground mỗi tuần — thẳng vào hộp thư.", "Newsletter"),
        "theo-doi.html": render_subscribe_page("Theo dõi TNC", "Đăng ký để không bỏ lỡ nội dung mới từ The New Culture trên mọi nền tảng.", "Theo dõi"),
    }
    for fname, content in extra.items():
        with open(os.path.join(OUT, fname),"w",encoding="utf-8") as f:
            f.write(content)

    # Trang tác giả — CHỈ sinh cho tác giả có role_id THẬT trong bảng
    # public.authors trên Supabase (xem load_editors()); tránh trang trống
    # cho các tên chuyên mục như "TNC Editorial", "TNC SELECTAS"
    authors = {}
    for a in ARTICLES:
        authors.setdefault(a["author"], []).append(a)

    # Editorial Intelligence (PR3; chuẩn hóa kiến trúc PR3.1) — chỉ số +
    # collection tự sinh cho mỗi biên tập viên đã có trang, tính MỘT LẦN ở
    # đây (build.py) rồi tái dùng cho cả trang tác giả lẫn file JSON — không
    # quét/tính lại ARTICLES lần thứ hai cho cùng một editor.
    editors_arts = {n: a for n, a in authors.items() if n in EDITORS}
    editor_intelligence = {n: compute_editor_intelligence(n, a) for n, a in editors_arts.items()}
    for n, a in editors_arts.items():
        editor_intelligence[n]["related_editors"] = compute_related_editors(n, a, editors_arts)
    # PR4: xuất bản kết quả ra global dùng chung (EDITOR_INTELLIGENCE) trước
    # khi render bất kỳ trang tác giả nào, để EditorCard/Related Editors có
    # thể tra cứu dữ liệu của BẤT KỲ editor nào. EDITOR_ORDER: thứ tự xác
    # định (a-z theo tên) cho Previous/Next Editor — không random.
    EDITOR_INTELLIGENCE.update(editor_intelligence)
    EDITOR_ORDER[:] = sorted(editors_arts.keys())

    skipped_authors = []
    for name, arts in authors.items():
        if name not in EDITORS:
            skipped_authors.append(name)
            continue
        idx = EDITOR_ORDER.index(name)
        prev_name = EDITOR_ORDER[idx - 1] if idx > 0 else None
        next_name = EDITOR_ORDER[idx + 1] if idx + 1 < len(EDITOR_ORDER) else None
        with open(os.path.join(OUT, author_url(name)),"w",encoding="utf-8") as f:
            f.write(render_author_page(name, arts, editor_intelligence[name], nav_editors=(prev_name, next_name)))
    if skipped_authors:
        print(f"  (Chưa có trang tác giả cho: {', '.join(skipped_authors)} — chưa có role_id biên tập thật trong Supabase)")

    import json as _json
    with open(os.path.join(OUT, "editor-intelligence.json"), "w", encoding="utf-8") as f:
        _json.dump(editor_intelligence, f, ensure_ascii=False, indent=2)

    # Trang lọc theo Tag — mỗi từ khóa xuất hiện ở ít nhất 1 bài viết
    for tslug, data in TAGS_BY_SLUG.items():
        with open(os.path.join(OUT, tag_url(tslug)),"w",encoding="utf-8") as f:
            f.write(render_tag_page(tslug, data["name"], data["articles"]))

    # Chỉ mục tìm kiếm + sitemap + robots
    with open(os.path.join(OUT,"search-index.json"),"w",encoding="utf-8") as f:
        f.write(build_search_index())
    with open(os.path.join(OUT,"sitemap.xml"),"w",encoding="utf-8") as f:
        f.write(build_sitemap())
    # Rev 12: Site Settings đã có field "Robots directives" từ Rev 7 nhưng
    # build.py chưa từng đọc — robots.txt luôn hardcode "Allow: /". Nối thêm
    # dòng tuỳ chỉnh nếu editor đã điền; để trống thì robots.txt y hệt hiện tại.
    robots_extra = SITE_SETTINGS["robots_directives"]
    robots_txt = f"User-agent: *\nAllow: /\n"
    if robots_extra:
        robots_txt += f"{robots_extra}\n"
    robots_txt += f"Sitemap: {SITE_URL}/sitemap.xml\n"
    with open(os.path.join(OUT,"robots.txt"),"w",encoding="utf-8") as f:
        f.write(robots_txt)

    generated_authors = len(authors) - len(skipped_authors)
    print(f"Build v3 xong: 1 index + {len(SERIES)} series + {len(ARTICLES)} article + {len(extra)} trang phụ + {generated_authors} trang tác giả + {len(TAGS_BY_SLUG)} trang tag")
    print(f"Output: {OUT}")

if __name__ == "__main__":
    main()
