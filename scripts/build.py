# -*- coding: utf-8 -*-
"""
TNC Site Builder
Sinh toàn bộ hệ thống trang tĩnh: index, 16 trang series, bài viết chi tiết.
Dữ liệu trung tâm -> đảm bảo nhất quán tuyệt đối giữa các trang.
"""
import os

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
# DỮ LIỆU TRUNG TÂM: 16 SERIES (đúng nguyên văn do Lamar cung cấp)
# ---------------------------------------------------------------
SERIES = [
    {"slug":"tnc-origins","num":"01","name":"TNC Origins",
     "desc":"Những con người, tập thể và cột mốc đặt nền móng cho underground Việt Nam.",
     "tag_color":"red"},
    {"slug":"tnc-profiles","num":"02","name":"TNC Profiles",
     "desc":"Hồ sơ chi tiết về nghệ sĩ, producer, label, collective và các nhân vật trong ngành.",
     "tag_color":"gold"},
    {"slug":"tnc-records","num":"03","name":"TNC Records",
     "desc":"Phân tích và lưu trữ những album, EP, mixtape có giá trị.",
     "tag_color":"red"},
    {"slug":"tnc-tracks","num":"04","name":"TNC Tracks",
     "desc":"Phân tích các ca khúc nổi bật, từ âm nhạc, ca từ đến bối cảnh ra đời và sức ảnh hưởng.",
     "tag_color":"gold"},
    {"slug":"tnc-breakdown","num":"05","name":"TNC Breakdown",
     "desc":"Phân tích chuyên sâu về hiện tượng, xu hướng, sản phẩm và các vấn đề trong công nghiệp âm nhạc.",
     "tag_color":"red"},
    {"slug":"tnc-editorial","num":"06","name":"TNC Editorial",
     "desc":"Góc nhìn, quan điểm và bài bình luận của ban biên tập về những chủ đề đáng quan tâm.",
     "tag_color":"gold"},
    {"slug":"tnc-reviews","num":"07","name":"TNC Reviews",
     "desc":"Đánh giá album, EP, MV, concert, showcase, festival và các sản phẩm âm nhạc.",
     "tag_color":"red"},
    {"slug":"tnc-timeline","num":"08","name":"TNC Timeline",
     "desc":"Dòng thời gian về lịch sử underground Việt Nam và các cột mốc quan trọng.",
     "tag_color":"gold"},
    {"slug":"tnc-culture","num":"09","name":"TNC Culture",
     "desc":"Khai thác văn hóa hip hop và underground: graffiti, DJ, breakdance, thời trang, lifestyle, cộng đồng...",
     "tag_color":"red"},
    {"slug":"inside-the-culture","num":"10","name":"Inside The Culture",
     "desc":"Series phỏng vấn các nghệ sĩ, producer, đạo diễn, photographer, designer, nhà tổ chức và những người đứng sau ngành.",
     "tag_color":"gold"},
    {"slug":"tnc-community","num":"11","name":"TNC Community",
     "desc":"Phản ánh hoạt động của cộng đồng, sự kiện, workshop, cypher, showcase và các dự án đáng chú ý.",
     "tag_color":"red"},
    {"slug":"tnc-radar","num":"12","name":"TNC Radar",
     "desc":"Cập nhật những xu hướng, nghệ sĩ, sản phẩm và chuyển động mới trong underground.",
     "tag_color":"gold"},
    {"slug":"tnc-discovery","num":"13","name":"TNC Discovery",
     "desc":"Giới thiệu những nghệ sĩ, producer, nhóm nhạc, label và dự án mới đầy tiềm năng.",
     "tag_color":"red"},
    {"slug":"tnc-music-101","num":"14","name":"TNC Music 101",
     "desc":"Chia sẻ kiến thức về rap, hip hop, sản xuất âm nhạc và công nghiệp âm nhạc theo cách dễ tiếp cận.",
     "tag_color":"gold"},
    {"slug":"tnc-selects","num":"15","name":"TNC Selects",
     "desc":"Tuyển chọn playlist, album, ca khúc và các gợi ý nghe nhạc theo từng chủ đề.",
     "tag_color":"red"},
    {"slug":"behind-the-culture","num":"16","name":"Behind The Culture",
     "desc":"Hậu trường của The New Culture, quy trình làm báo, hành trình xây dựng tạp chí và những câu chuyện phía sau mỗi bài viết.",
     "tag_color":"gold"},
]
SERIES_BY_SLUG = {s["slug"]: s for s in SERIES}

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
# LOADER: đọc bài viết từ các file Markdown trong content/articles/
# ---------------------------------------------------------------
import glob, re
import yaml

# Thư mục nội dung (tương đối so với gốc repo)
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(REPO_ROOT, "content", "articles")

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

def _md_body_to_blocks(md):
    """Chuyển markdown thành list block (kind, payload) để render.
    Hỗ trợ: h2, blockquote, ảnh, video YouTube, danh sách, đoạn văn (có định dạng inline)."""
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

        # Link YouTube đứng riêng -> nhúng video
        if re.match(r'^https?://\S+$', para):
            yid = _youtube_id(para)
            if yid:
                blocks.append(("youtube", yid))
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

        # Đoạn văn thường
        text = " ".join(line.strip() for line in para.split('\n'))
        blocks.append(("p", _inline_md(text)))
    return blocks

def _estimate_read_time(md):
    """Ước tính thời gian đọc theo số từ (trung bình ~200 từ/phút cho tiếng Việt)."""
    words = len(re.findall(r'\S+', md))
    minutes = max(1, round(words / 200))
    return f"{minutes} phút đọc"

def slugify(text):
    """Chuẩn hóa chuỗi thành slug an toàn cho URL: bỏ dấu, chỉ giữ chữ/số/gạch ngang."""
    import unicodedata
    s = unicodedata.normalize('NFD', text).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()
    return s or "bai-viet"

def load_articles():
    """Đọc tất cả file .md, trả về list article dict, sắp theo 'order' rồi 'date'."""
    articles = []
    seen_slugs = set()
    files = sorted(glob.glob(os.path.join(ARTICLES_DIR, "*.md")))
    for path in files:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, body_md = _parse_frontmatter(raw)
        if not meta.get("title") or not meta.get("series"):
            print(f"  ! Bỏ qua {os.path.basename(path)} (thiếu title/series)")
            continue
        slug = slugify(os.path.splitext(os.path.basename(path))[0])
        if slug in seen_slugs:
            print(f"  ! CẢNH BÁO: slug '{slug}' trùng lặp (từ {os.path.basename(path)}), tự thêm hậu tố")
            base_slug, i = slug, 2
            while slug in seen_slugs:
                slug = f"{base_slug}-{i}"
                i += 1
        seen_slugs.add(slug)
        # Thời gian đọc: ưu tiên giá trị nhập tay, nếu trống thì tự ước tính
        read_time = meta.get("read_time") or _estimate_read_time(body_md)
        # Ngày đăng: ưu tiên giá trị nhập tay; nếu trống, tự sinh theo ngày sửa file
        date_val = meta.get("date")
        if not date_val:
            import datetime
            mtime = datetime.datetime.fromtimestamp(os.path.getmtime(path))
            thang = mtime.month
            date_val = f"{mtime.day} Tháng {thang}, {mtime.year}"
        articles.append({
            "slug": slug,
            "series": meta["series"],
            "title": meta["title"],
            "dek": meta.get("dek", ""),
            "author": meta.get("author", "TNC Editorial"),
            "date": date_val,
            "read_time": read_time,
            "cover": meta.get("cover", "") or "",
            "poster": meta.get("poster", "") or "",
            "featured": bool(meta.get("featured", False)),
            "order": int(meta.get("order", 999)),
            "tags": meta.get("tags", []) or [],
            "ranking": _normalize_ranking(meta.get("ranking")),
            "body": _md_body_to_blocks(body_md),
        })
    # sắp xếp: order tăng dần (order nhỏ = ưu tiên/mới), fallback theo slug
    articles.sort(key=lambda a: (a["order"], a["slug"]))
    return articles

def _normalize_ranking(raw):
    """Chuẩn hóa danh sách mục xếp hạng từ frontmatter.
    Mỗi mục: {rank, song, artist, cover, youtube, note}. Bỏ qua mục thiếu tên ca khúc."""
    if not raw or not isinstance(raw, list):
        return []
    items = []
    for it in raw:
        if not isinstance(it, dict):
            continue
        song = (it.get("song") or "").strip()
        if not song:
            continue
        items.append({
            "song": song,
            "artist": (it.get("artist") or "").strip(),
            "cover": (it.get("cover") or "").strip(),
            "youtube": _youtube_id(it.get("youtube") or "") or "",
            "note": (it.get("note") or "").strip(),
        })
    # xếp #1 trên cùng: tôn trọng thứ tự nhập; gán số hạng tăng dần
    for i, it in enumerate(items, 1):
        it["rank"] = i
    return items

ARTICLES = load_articles()

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
# HỒ SƠ BIÊN TẬP VIÊN — đọc từ content/editors/*.md
# Chỉ tác giả có hồ sơ tại đây mới được sinh trang tác giả và hiện link
# trong bài viết. Tên trong trường "name" phải khớp chính xác (kể cả
# hoa/thường và khoảng trắng) với trường "author" trong bài viết.
# -----------------------------------------------------------------
def load_editors():
    editors_dir = os.path.join(REPO_ROOT, "content", "editors")
    editors = {}
    if not os.path.isdir(editors_dir):
        return editors
    for path in sorted(glob.glob(os.path.join(editors_dir, "*.md"))):
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, _ = _parse_frontmatter(raw)
        name = (meta.get("name") or "").strip()
        if not name:
            print(f"  ! Bỏ qua hồ sơ {os.path.basename(path)} (thiếu tên)")
            continue
        editors[name] = {
            "name": name,
            "avatar": (meta.get("avatar") or "").strip(),
            "bio": (meta.get("bio") or "").strip(),
            "slug": os.path.splitext(os.path.basename(path))[0],
        }
    return editors

EDITORS = load_editors()

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

        profiles.append({
            "slug": os.path.splitext(os.path.basename(path))[0],
            "name": name,
            "type": ptype,
            "role": (meta.get("role") or "").strip(),
            "influence": influence,
            "avatar": (meta.get("avatar") or "").strip(),
            "short_desc": (meta.get("short_desc") or "").strip(),
            "badges": ordered_badges,
            "body": _md_body_to_blocks(body_md),
        })
    return profiles

PROFILES = load_profiles()


# Bảo hiểm: nếu chưa có bài nào, tạo 1 bài chào mừng tạm để trang chủ không lỗi
if not ARTICLES:
    ARTICLES = [{
        "slug": "chao-mung",
        "series": SERIES[0]["slug"],
        "title": "Chào mừng đến với The New Culture",
        "dek": "Chưa có bài viết nào. Hãy thêm bài đầu tiên qua trang quản trị /admin/.",
        "author": "TNC Editorial",
        "date": "",
        "read_time": "1 phút đọc",
        "cover": "",
        "poster": "",
        "featured": True,
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

print(f"Đã nạp {len(SERIES)} series, {len(ARTICLES)} bài viết từ Markdown.")
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
    desc = desc or SITE_DESC
    desc_short = (desc[:157] + "…") if len(desc) > 158 else desc
    canonical = f"{SITE_URL}/{path}" if path else SITE_URL + "/"
    if image:
        og_image = image if image.startswith("http") else f"{SITE_URL}/{image.lstrip('/')}"
    else:
        og_image = f"{SITE_URL}/og-default.png"
    full_title = f"{title} — {SITE_NAME}" if append_site_name else title
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
<!-- Open Graph -->
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="{SITE_NAME}">
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

def render_ad_block(vertical_key, horizontal_key, link_key, extra_class=""):
    """Sinh một khối quảng cáo hoàn chỉnh, áp dụng logic dự phòng: ưu tiên
    ảnh/video DỌC nếu có (dùng cho hai bên hông desktop); nếu thiếu dọc, tự
    động dùng bản NGANG thay thế. Nếu có link, cả khối trở thành liên kết
    bấm được; nếu không, chỉ là khối trưng bày tĩnh. Tự ẩn hoàn toàn nếu
    không có bất kỳ media nào được cấu hình cho vị trí này."""
    vertical = SETTINGS.get(vertical_key, "")
    horizontal = SETTINGS.get(horizontal_key, "")
    link = SETTINGS.get(link_key, "")

    src = vertical or horizontal
    if not src:
        return ""
    orientation_cls = "ad-block--vertical" if src == vertical else "ad-block--horizontal-fallback"
    media_html = _ad_media_tag(src)

    if link:
        return (f'<a href="{link}" target="_blank" rel="noopener sponsored" '
                 f'class="ad-block {orientation_cls} {extra_class}">{media_html}</a>')
    return f'<div class="ad-block {orientation_cls} {extra_class}">{media_html}</div>'

def render_ad_block_horizontal_only(horizontal_key, link_key, extra_class=""):
    """Sinh khối quảng cáo NGANG thuần túy — dùng cho trang chủ và mọi vị
    trí trên di động, luôn ưu tiên bản ngang bất kể có bản dọc hay không."""
    horizontal = SETTINGS.get(horizontal_key, "")
    link = SETTINGS.get(link_key, "")
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
    left = render_ad_block("ad_left_vertical", "ad_left_horizontal", "ad_left_link", "ad-block--sidebar-left")
    right = render_ad_block("ad_right_vertical", "ad_right_horizontal", "ad_right_link", "ad-block--sidebar-right")
    if not left and not right:
        return ""
    return f"""
  <div class="ad-sidebar ad-sidebar--left">{left}</div>
  <div class="ad-sidebar ad-sidebar--right">{right}</div>
"""

def render_inline_ad_mobile():
    """Khối quảng cáo ngang thay thế cho mobile/màn hẹp (dưới 1400px), nơi
    sidebar bị ẩn. Chèn trong nội dung bài viết, dùng ảnh ngang."""
    left = render_ad_block_horizontal_only("ad_left_horizontal", "ad_left_link")
    right = render_ad_block_horizontal_only("ad_right_horizontal", "ad_right_link")
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
    left = render_ad_block_horizontal_only("ad_left_horizontal", "ad_left_link")
    right = render_ad_block_horizontal_only("ad_right_horizontal", "ad_right_link")
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
    if SETTINGS.get("logo_image"):
        alt = "The New Culture"
        cls = "wordmark wordmark--img" + (" wordmark--lead" if variant == "lead" else "")
        return f'<a href="index.html" class="{cls}" aria-label="The New Culture — trang chủ"><img src="{SETTINGS["logo_image"]}" alt="{alt}"></a>'
    if variant == "lead":
        return ('<a href="index.html" class="wordmark wordmark--lead" aria-label="The New Culture — trang chủ">'
                '<span class="wordmark__owner">Lamar\'s</span>'
                '<span class="wordmark__title">THE NEW CULTURE</span></a>')
    return '<a href="index.html" class="wordmark"><span class="wordmark__title">THE NEW CULTURE</span></a>'

def active_socials():
    """Trả về danh sách (nhãn, url) cho các nền tảng đã được điền link trong CMS.
    Nền tảng nào để trống sẽ không xuất hiện trong danh sách — tránh hiện link chết."""
    platforms = [
        ("Facebook", SETTINGS.get("social_facebook", "")),
        ("Instagram", SETTINGS.get("social_instagram", "")),
        ("YouTube", SETTINGS.get("social_youtube", "")),
        ("TikTok", SETTINGS.get("social_tiktok", "")),
    ]
    return [(label, url) for label, url in platforms if url]

def follow_button_url():
    """Nút 'Theo dõi' ở đầu trang: dẫn thẳng tới Facebook nếu đã cấu hình,
    ngược lại tạm thời dẫn về trang Theo dõi nội bộ của site."""
    fb = SETTINGS.get("social_facebook", "")
    return fb if fb else "theo-doi.html"

def masthead(active=None):
    nav_links = ""
    for slug, label in NAV_ITEMS:
        cls = ' class="is-active"' if slug == active else ""
        nav_links += f'<a href="series-{slug}.html"{cls}>{label}</a>'

    # overlay: đủ 16 series + link phụ
    menu_series = ""
    for s in SERIES:
        menu_series += f'<a href="{series_url(s["slug"])}"><span class="menu-code">{s["code"]} · {s["num"]}</span>{s["name"]}</a>'

    return f"""
<header class="masthead">
  <div class="masthead__util">
    <div class="container">
      <span>{TODAY_VN} · Sài Gòn</span>
      <div class="u-links">
        <a href="all-series.html">Series</a>
        <a href="tnc-sessions.html">TNC Sessions</a>
        <a href="hop-tac.html">Hợp tác</a>
      </div>
    </div>
  </div>
  <div class="masthead__main{' masthead__main--has-bg' if SETTINGS.get('header_bg_image') else ''}"{f' style="background-image:url(\'{SETTINGS["header_bg_image"]}\')"' if SETTINGS.get('header_bg_image') else ''}>
    <div class="container">
      {wordmark_html('lead')}
      <div class="masthead__actions">
        <a href="search.html" class="icon-btn" aria-label="Tìm kiếm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
        </a>
        <a href="{follow_button_url()}"{' target="_blank" rel="noopener"' if SETTINGS.get('social_facebook') else ''} class="btn btn--solid">Theo dõi</a>
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
      <h4>16 Series</h4>
      <div class="menu-series">{menu_series}</div>
    </div>
    <div class="menu-col">
      <h4>Khám phá</h4>
      <a href="all-series.html">Tất cả Series</a>
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
    </div>
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
    """Cloudflare Web Analytics — chỉ render khi đã cấu hình token qua CMS."""
    token = SETTINGS.get("cloudflare_analytics_token", "")
    if not token:
        return ""
    return (f'<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
            f'data-cf-beacon=\'{{"token": "{token}"}}\'></script>')

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
    return f"""
<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__brand">
        {wordmark_html('plain')}
        <p>Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam. Lưu giữ để không giá trị nào bị lãng quên.</p>
        <div class="footer__social">
          {social_icons_html}
        </div>
      </div>
      <div class="footer__col"><h4>Khám phá</h4><ul>
        <li><a href="all-series.html">Toàn bộ Series</a></li>
        <li><a href="video.html">Video</a></li>
        <li><a href="su-kien.html">Sự kiện</a></li>
        <li><a href="newsletter.html">Newsletter</a></li>
      </ul></div>
      <div class="footer__col"><h4>Series chính</h4><ul>
        <li><a href="series-tnc-origins.html">TNC Origins</a></li>
        <li><a href="series-tnc-profiles.html">TNC Profiles</a></li>
        <li><a href="series-inside-the-culture.html">Inside The Culture</a></li>
        <li><a href="series-tnc-radar.html">TNC Radar</a></li>
      </ul></div>
      <div class="footer__col"><h4>Nền tảng</h4><ul>
        {social_list_html}
      </ul></div>
      <div class="footer__col"><h4>Tổ chức</h4><ul>
        <li><a href="ve-tnc.html">Về TNC</a></li>
        <li><a href="hop-tac.html">Hợp tác</a></li>
        <li><a href="lien-he.html">Liên hệ</a></li>
        <li><a href="tuyen-dung.html">Tuyển dụng</a></li>
      </ul></div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 The New Culture — Bản demo</span>
      <span>Founder &amp; Editor-in-Chief · Lamar</span>
    </div>
  </div>
</footer>
""" + """<script>
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

  function goTo(index){
    slides[current].classList.remove('is-active');
    current=(index+slides.length)%slides.length;
    slides[current].classList.add('is-active');
  }
  function next(){goTo(current+1);}
  function prev(){goTo(current-1);}
  function startAuto(){
    stopAuto();
    timer=setInterval(next,intervalMs);
  }
  function stopAuto(){
    if(timer){clearInterval(timer);timer=null;}
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
  function update(){
    var docH=document.documentElement.scrollHeight-window.innerHeight;
    var scrolled=window.scrollY;
    var pct=docH>0?(scrolled/docH*100):0;
    bar.style.width=Math.min(Math.max(pct,0),100)+'%';
  }
  window.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',update);
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

// 8. Parallax nhẹ cho ảnh hero khi cuộn
(function(){
  var media=document.querySelector('.hero-full__media img, .hero-full__media .media__zoom');
  if(!media||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  window.addEventListener('scroll',function(){
    var y=window.scrollY;
    if(y<window.innerHeight){media.style.transform='translateY('+(y*0.25)+'px)';}
  },{passive:true});
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
  var hidden=document.querySelectorAll('.js-infinite-item[style*="display: none"]');
  if(!hidden.length)return;
  var io=new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        var next=document.querySelectorAll('.js-infinite-item[style*="display: none"]');
        for(var i=0;i<Math.min(8,next.length);i++){next[i].style.display='';}
        if(document.querySelectorAll('.js-infinite-item[style*="display: none"]').length===0){
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
</script>
""" + analytics_script_tag() + """
</body>
</html>"""

def article_url(slug): return f"article-{slug}.html"
def series_url(slug): return f"series-{slug}.html"

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
          <img src="{a['poster']}" alt="{a['title']}" loading="lazy">
          <span class="poster-card__archive">{art_code(a)}</span>
        </div>
        <div class="poster-card__body">
          <h3 class="poster-card__title">{a['title']}</h3>
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
    ảnh đại diện cỡ lớn, tên (dạng liên kết tới trang hồ sơ), và trọn vẹn
    tiểu sử. Chỉ hiển thị khi tác giả đã có hồ sơ đầy đủ trong CMS
    (content/editors/) — tự ẩn hoàn toàn nếu thiếu, tránh khung trống
    hoặc thông tin không đầy đủ."""
    ed = EDITORS.get(author_name)
    if not ed or not ed.get("bio"):
        return ""
    avatar_html = (f'<img src="{ed["avatar"]}" alt="{author_name}" class="author-box__avatar">'
                   if ed["avatar"] else '<div class="author-box__avatar"></div>')
    return f"""
    <div class="container" style="max-width:680px;">
      <div class="author-box">
        {avatar_html}
        <div class="author-box__body">
          <span class="author-box__label">Về tác giả</span>
          <a href="{author_url(author_name)}" class="author-box__name">{author_name}</a>
          <p class="author-box__bio">{ed['bio']}</p>
        </div>
      </div>
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
      <button class="share-btn share-native" data-url="{url}" data-title="{a['title']}" type="button" hidden>Chia sẻ...</button>
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
      <h1 class="hero-full__title js-scramble"><a href="{article_url(a['slug'])}">{a['title']}</a></h1>
      <p class="hero-full__dek">{a['dek']}</p>
      <a href="{article_url(a['slug'])}" class="hero-full__cta">Đọc bài</a>
    </div>
  </section>"""

    slides_html = ""
    for i, a in enumerate(slides):
        s = SERIES_BY_SLUG[a["series"]]
        active_cls = " is-active" if i == 0 else ""
        scramble_cls = " js-scramble" if i == 0 else ""
        slides_html += f"""
      <div class="hero-full-slide{active_cls}" data-slide-index="{i}">
        <div class="hero-full__media">{zoom(a, eager=(i==0))}<div class="hero-full__scrim"></div></div>
        <div class="hero-full__content">
          <span class="hero-full__eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h1 class="hero-full__title{scramble_cls}"><a href="{article_url(a['slug'])}">{a['title']}</a></h1>
          <p class="hero-full__dek">{a['dek']}</p>
          <a href="{article_url(a['slug'])}" class="hero-full__cta">Đọc bài</a>
        </div>
      </div>"""

    return f"""
  <section class="hero-full hero-slideshow" data-slideshow data-slide-interval="5000">
    <div class="hero-slideshow__track">{slides_html}
    </div>
  </section>"""

def render_gif_hero():
    """Khung GIF lớn đầu trang chủ: ảnh động tự chạy + thumbnail/thông tin bài hát.
    Không phát âm thanh — chỉ là khối trình diễn hình ảnh. Ẩn hoàn toàn nếu chưa cấu hình."""
    gif = SETTINGS.get("hero_gif")
    if not gif:
        return ""
    title = SETTINGS.get("hero_gif_song_title", "")
    artist = SETTINGS.get("hero_gif_song_artist", "")
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
    url = SETTINGS.get("spotify_embed_url")
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
  <section class="ranking-spotlight">
    <div class="container">
      <div class="section-head">
        <h2>Bảng Xếp Hạng — {s['name']}</h2>
        <a class="more" href="{article_url(a['slug'])}">Xem toàn bộ →</a>
      </div>
      <a class="ranking-spotlight__title-link" href="{article_url(a['slug'])}">{a['title']}</a>
      <div class="spot-rows">{rows}
      </div>
      {more_note}
    </div>
  </section>
"""

def render_index():
    if not ARTICLES:
        # Không có bài nào: vẫn dựng trang chủ với phần Series, bỏ phần bài viết
        hero = None
    else:
        hero = ARTICLES[0]

    def _get(i):
        # lấy bài thứ i an toàn: nếu thiếu thì quay vòng, nếu rỗng trả None
        if not ARTICLES:
            return None
        return ARTICLES[i % len(ARTICLES)]

    hs = SERIES_BY_SLUG[hero["series"]] if hero else None
    s2 = _get(1); s2s = SERIES_BY_SLUG[s2["series"]] if s2 else None
    s3 = _get(2); s3s = SERIES_BY_SLUG[s3["series"]] if s3 else None
    feat = _get(4); fs = SERIES_BY_SLUG[feat["series"]] if feat else None

    # Khung hero trái giờ là slideshow chứa 3 bài mới nhất: hero (0), s2 (1), s3 (2)
    slide_articles = [a for a in (hero, s2, s3) if a]
    # loại trùng slug nếu ARTICLES có ít hơn 3 bài (đã quay vòng ở _get)
    seen_slides = set()
    slides_unique = []
    for a in slide_articles:
        if a["slug"] not in seen_slides:
            seen_slides.add(a["slug"])
            slides_unique.append(a)
    slide_articles = slides_unique

    # Cột phải: 5 bài viết tiếp theo, không trùng với các bài đã dùng cho slide
    side = ""
    seen = set(a["slug"] for a in slide_articles)
    side_count = 0
    i = 0
    while side_count < 5 and i < len(ARTICLES) + 5:
        a = _get(3 + i)  # bắt đầu từ vị trí sau các bài dùng cho slide
        i += 1
        if not a or a["slug"] in seen:
            continue
        seen.add(a["slug"])
        side_count += 1
        s = SERIES_BY_SLUG[a["series"]]
        side += f"""
        <a class="side-item" href="{article_url(a['slug'])}">
          <div class="media media--1-1">{zoom(a)}</div>
          <div>
            <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
            <h3>{a['title']}</h3>
          </div>
        </a>"""
        if side_count >= len(ARTICLES) - len(slide_articles):
            break  # đã liệt kê hết bài có thể dùng, tránh vòng lặp vô hạn khi kho bài ít

    # trending: 6 bài
    trending = ""
    for i, a in enumerate(ARTICLES[:6], 1):
        s = SERIES_BY_SLUG[a["series"]]
        trending += f"""
      <a class="trending__item" href="{article_url(a['slug'])}">
        <span class="trending__num">{i:02d}</span>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h4>{a['title']}</h4>
        </div>
      </a>"""

    # series grid (16 cells)
    cells = ""
    for s in SERIES:
        cells += f"""
      <a class="series-cell" href="{series_url(s['slug'])}">
        <span class="series-cell__code">{s['code']} · {s['num']}</span>
        <h3>{s['name']}</h3>
        <p>{s['desc']}</p>
      </a>"""

    # latest grid (6 bài)
    latest = ""
    for a in ARTICLES[:6]:
        s = SERIES_BY_SLUG[a["series"]]
        latest += f"""
      <a class="card" href="{article_url(a['slug'])}">
        <div class="media media--3-2">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{a['title']}</h3>
        <span class="byline">{a['author']} · {a['date']}</span>
      </a>"""

    # video (tối đa 3, an toàn khi ít bài)
    _durs = ["38:12", "24:50", "45:03"]
    vids = [(_get(i), _durs[i], None) for i in range(min(3, len(ARTICLES)))]
    video_html = ""
    for a, dur, _ in vids:
        if not a:
            continue
        s = SERIES_BY_SLUG[a["series"]]
        video_html += f"""
      <a class="video-card" href="{article_url(a['slug'])}">
        <div class="media media--16-9">
          <div class="media__zoom"></div>
          <div class="play"><span></span></div>
          <span class="dur">{dur}</span>
        </div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{a['title']}</h3>
      </a>"""

    html = head("The New Culture - Tạp chí âm nhạc đương đại đầu tiên tại Việt Nam", append_site_name=False) + masthead()
    html += render_gif_hero()
    html += render_spotify_block()
    html += f"""
{render_hero_slideshow(slide_articles)}
<main>
  <section class="hero-side-strip container">
    <div class="section-head"><h2>Mới cập nhật</h2></div>
    <div class="hero-side-strip__grid">{side}
    </div>
  </section>

  <section class="trending container">
    <div class="section-head"><h2>Đang được quan tâm</h2></div>
    <div class="trending__grid">{trending}
    </div>
  </section>
{render_ranking_spotlight()}
{render_profiles_homepage_block()}
{render_community_homepage_block()}
  <section class="series-band">
    <div class="container">
      <div class="section-head">
        <h2>Series</h2>
        <a class="more" href="all-series.html">16 tuyến nội dung — bản đồ tri thức TNC</a>
      </div>
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>

  <section class="section container">
    <div class="section-head"><h2>Câu chuyện nổi bật</h2></div>
    <div class="feature">
      <a href="{article_url(feat['slug'])}">
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
{render_homepage_ad_block()}
  <section class="section container">
    <div class="section-head"><h2>Video</h2><a class="more" href="video.html" id="video">Tất cả tập →</a></div>
    <div class="video-row">{video_html}
    </div>
  </section>

  <section class="section container">
    <div class="section-head"><h2>Mới đăng</h2><a class="more" href="all-series.html">Xem thêm →</a></div>
    <div class="grid grid-3">{latest}
    </div>
  </section>
</main>
"""
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
  <section class="profiles-spotlight">
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
    # nối liền ngay sau, tạo cảm giác trôi vô tận không đứt đoạn.
    single_set_html = "".join(render_profile_card(p) for p in top_profiles)
    cards_html = single_set_html + single_set_html
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

def render_profile_card(p):
    """Sinh HTML một 'thẻ tướng' cho lưới danh mục TNC Profiles."""
    ptype = PROFILE_TYPES[p["type"]]
    tier = influence_tier(p["influence"])
    has_goat = "goat" in p["badges"]
    avatar_html = (f'<img src="{p["avatar"]}" alt="{p["name"]}" loading="lazy">'
                   if p["avatar"] else '<div class="profile-card__ph"></div>')
    name_html = render_goat_name_html(p["name"], has_goat)
    badges_html = render_badges_html(p["badges"], context="card")
    return f"""
      <a class="profile-card" href="{profile_url(p['slug'])}" data-type="{p['type']}" data-tier="{tier}">
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
    cards_html = "".join(render_profile_card(p) for p in PROFILES)
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
      <a href="index.html">Trang chủ</a> / <a href="index.html#series">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-6);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / 16</span>
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

  <section class="series-band" style="margin-top:var(--s-9);">
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
          card.style.transition='transform .35s cubic-bezier(0.2,0.6,0.2,1)';
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
        <h3>{a['title']}</h3>
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
      <a href="index.html">Trang chủ</a> / <a href="index.html#series">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / 16</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;max-width:18ch;">{s['name']}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;">{s['desc']}</p>
      <div class="byline" style="margin-top:var(--s-4);display:flex;gap:var(--s-5);flex-wrap:wrap;">
        <span>{len(arts)} bài viết đã xuất bản</span>
        <span>Editorial Content System — TNCOS</span>
      </div>
    </div>

    <div class="{grid_class}">{cards_html}
    </div>
  </section>

  <section class="series-band" style="margin-top:var(--s-9);">
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
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{a['title']}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{a['dek']}</p>
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
      <a href="index.html">Trang chủ</a> / <a href="index.html#series">Series</a> / {s['name']}
    </nav>
    <div style="border-bottom:2px solid var(--c-line-strong);padding-bottom:var(--s-6);margin-bottom:var(--s-7);">
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['code']} · Series {s['num']} / 16</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-3) 0;max-width:18ch;">{s['name']}</h1>
      <p style="font-size:var(--t-md);color:var(--c-ink-2);max-width:56ch;">{s['desc']}</p>
      <div class="byline" style="margin-top:var(--s-4);display:flex;gap:var(--s-5);flex-wrap:wrap;">
        <span>{len(arts)} bài viết đã xuất bản</span>
        <span>Editorial Content System — TNCOS</span>
      </div>
    </div>

    <div class="grid js-infinite-list" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
    <div class="js-infinite-sentinel" style="height:1px;"></div>
  </section>

  <section class="series-band" style="margin-top:var(--s-9);">
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
    return "\n".join(out)

def article_schema_json(a, s, path):
    """JSON-LD Article schema cho SEO rich snippet."""
    import html as _html, json as _json
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
        "publisher": {"@type": "Organization", "name": SITE_NAME,
                       "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/uploads/3727.png"}},
        "mainEntityOfPage": {"@type": "WebPage", "@id": f"{SITE_URL}/{path}"},
        "articleSection": s["name"],
        "keywords": ", ".join(a.get("tags", [])),
    }
    return f'<script type="application/ld+json">{_json.dumps(data, ensure_ascii=False)}</script>'

def render_article_page(a):
    s = SERIES_BY_SLUG[a["series"]]
    body = render_body_blocks(a["body"])

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

    tags = "".join(f'<a href="all-series.html" class="btn btn--ghost" style="text-transform:none;font-family:var(--f-mono);">{t}</a>' for t in a["tags"])

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
      <h1 style="font-size:var(--t-3xl);margin:var(--s-4) 0;">{a['title']}</h1>
      <p style="font-size:var(--t-lg);color:var(--c-ink-2);line-height:1.4;margin-bottom:var(--s-5);">{a['dek']}</p>
      {author_byline_html(a['author'])}
          <div class="byline">{a['date']} · {a['read_time']}</div>
        </div>
      </div>
    </div>

    <div class="container" style="max-width:1100px;margin-block:var(--s-6);">
      <div class="media media--16-9">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
      <p class="byline" style="text-align:right;margin-top:var(--s-2);">Ảnh minh họa — TNC Archive</p>
    </div>

    <div class="container article-body" style="max-width:680px;font-size:var(--t-md);line-height:1.8;">
{body}
    </div>

    <div class="container ranking-wrap">{render_ranking(a.get('ranking'))}
    </div>

    <div class="container" style="max-width:680px;margin-top:var(--s-6);display:flex;gap:var(--s-2);flex-wrap:wrap;">
      {tags}
    </div>

    <div class="container" style="max-width:680px;">{share_bar(a, _path)}
    </div>
{author_bio_box_html(a['author'])}
{render_inline_ad_mobile()}
  </article>

  <section class="section container">
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
/* Ảnh trong bài */
.article-body .body-figure{margin:2em 0;}
.article-body .body-figure img{width:100%;height:auto;display:block;border:1px solid var(--c-line);}
.article-body .body-figure figcaption{font-family:var(--f-mono);font-size:var(--t-xs);color:var(--c-ink-3);margin-top:var(--s-2);text-align:center;}
/* Video nhúng YouTube (tỉ lệ 16:9 co giãn) */
.article-body .body-video{position:relative;width:100%;aspect-ratio:16/9;margin:2em 0;background:#000;}
.article-body .body-video iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
/* Ảnh bìa hiển thị đè lên placeholder */
.media__zoom{width:100%;height:100%;object-fit:cover;}
img.media__zoom{position:absolute;inset:0;z-index:1;}

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
def page_wrap(title, desc, inner, path=""):
    return head(title, desc, path=path) + masthead() + f"<main>\n{inner}\n</main>\n" + newsletter() + footer()

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
        return (a.title+' '+a.dek+' '+a.series_name+' '+(a.tags||[]).join(' ')).toLowerCase().indexOf(q)>-1;
      });
      meta.textContent=hits.length+' kết quả cho "'+q+'"';
      results.innerHTML=hits.map(function(a){
        return '<a class="card" href="'+a.url+'" style="flex-direction:row;gap:24px;align-items:center;">'+
          '<div class="media media--3-2" style="flex:0 0 200px;"><div class="media__zoom"></div></div>'+
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
            "url": article_url(a["slug"]),
        })
    return json.dumps(data, ensure_ascii=False)

def build_sitemap():
    """Sinh sitemap.xml liệt kê mọi trang chính cho SEO."""
    urls = [SITE_URL + "/"]
    for s in SERIES:
        urls.append(f"{SITE_URL}/{series_url(s['slug'])}")
    for a in ARTICLES:
        urls.append(f"{SITE_URL}/{article_url(a['slug'])}")
    for extra in ["all-series.html","video.html","search.html","su-kien.html",
                  "ve-tnc.html","lien-he.html","hop-tac.html","tuyen-dung.html","tnc-sessions.html"]:
        urls.append(f"{SITE_URL}/{extra}")
    items = "\n".join(f"  <url><loc>{u}</loc></url>" for u in urls)
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{items}\n</urlset>'

def render_search_page_alias():
    return render_search_page()

def render_author_page(name, arts):
    """Trang hồ sơ tác giả: ảnh, tiểu sử (từ content/editors/) + toàn bộ bài viết của họ.
    Chỉ được gọi khi tác giả đã có hồ sơ trong EDITORS (kiểm tra ở nơi gọi trong main())."""
    ed = EDITORS.get(name, {})
    avatar = ed.get("avatar", "")
    bio = ed.get("bio", "")
    avatar_html = (f'<img src="{avatar}" alt="{name}" class="author-hero__avatar">'
                   if avatar else '<div class="author-hero__avatar"></div>')
    bio_html = f'<p class="author-hero__bio">{bio}</p>' if bio else ""
    rows = ""
    for a in arts:
        s = SERIES_BY_SLUG[a["series"]]
        rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 220px;">{zoom(a)}<span class="archive-code">{art_code(a)}</span></div>
        <div>
          <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
          <h3 style="font-size:var(--t-lg);margin:var(--s-2) 0;">{a['title']}</h3>
          <p style="color:var(--c-ink-2);font-size:var(--t-sm);margin-bottom:var(--s-2);">{a['dek']}</p>
          <span class="byline">{a['date']} · {a['read_time']}</span>
        </div>
      </a>"""
    inner = f"""
  <section class="container">
    <div class="author-hero">
      {avatar_html}
      <div>
        <span class="eyebrow">Tác giả</span>
        <h1>{name}</h1>
        <p>{len(arts)} bài viết trên The New Culture.</p>
        {bio_html}
      </div>
    </div>
    <div class="section-head"><h2>Bài viết</h2></div>
    <div class="grid" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
    </div>
  </section>
"""
    return page_wrap(name, bio or f"Các bài viết của {name} trên The New Culture.", inner, path=author_url(name))

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
      <h1>16 Series của The New Culture</h1>
      <p>Toàn bộ hệ thống tuyến nội dung của TNC. Mỗi series là một vùng tích lũy tri thức và lưu trữ riêng biệt về văn hóa hip-hop underground Việt Nam.</p>
    </div>
  </section>
  <section class="series-band" style="margin-top:0;">
    <div class="container">
      <div class="series-grid">{cells}
      </div>
    </div>
  </section>
"""
    return page_wrap("Tất cả Series", "16 tuyến nội dung của The New Culture", inner)

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
        <h3>{a['title']}</h3>
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
    inner = """
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
      <p>Toàn bộ nội dung được tổ chức theo 16 tuyến series, mỗi tuyến là một vùng tri thức chuyên biệt — từ hồ sơ nghệ sĩ, phân tích tác phẩm, đến ghi chép văn hóa và phỏng vấn chuyên sâu. Đây là cách chúng tôi biến thông tin rời rạc thành tài sản tri thức có cấu trúc.</p>
      <h2>Nguyên tắc biên tập</h2>
      <p>Chính xác, độc lập và tôn trọng đối tượng được phản ánh. Chúng tôi ưu tiên chiều sâu hơn tốc độ, và bối cảnh hơn giật gân.</p>
    </div>
    <div class="info-cards">
      <div class="info-card"><div class="k">Định dạng</div><h3>Đa nền tảng</h3><p>Facebook, Instagram, YouTube và TikTok — mỗi nền tảng một vai trò riêng.</p></div>
      <div class="info-card"><div class="k">Nội dung</div><h3>16 Series</h3><p>Hệ thống tuyến nội dung bao phủ toàn bộ hệ sinh thái underground.</p></div>
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
        <h3>{a['title']}</h3>
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
        "name": SITE_NAME, "short_name": "TNC",
        "start_url": "/", "display": "standalone",
        "background_color": "#FFFFFF", "theme_color": "#E11D0F",
        "icons": [{"src": "/uploads/3727.png", "sizes": "512x512", "type": "image/png"}],
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        import json as _json
        _json.dump(manifest, f, ensure_ascii=False)
    import time as _time
    build_ts = str(int(_time.time()))
    with open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8") as f:
        f.write("""const CACHE='tnc-""" + build_ts + """';
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
  e.respondWith(
    caches.match(e.request).then(cached=>{
      const fetchPromise=fetch(e.request).then(res=>{
        if(res.ok)caches.open(CACHE).then(c=>c.put(e.request,res.clone()));
        return res;
      }).catch(()=>cached);
      return cached||fetchPromise;
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
            else:
                f.write(render_series_page(s))
    for a in ARTICLES:
        with open(os.path.join(OUT, article_url(a["slug"])),"w",encoding="utf-8") as f:
            f.write(render_article_page(a))

    # Trang chi tiết hồ sơ nhân vật/đơn vị (TNC Profiles)
    for p in PROFILES:
        with open(os.path.join(OUT, profile_url(p["slug"])),"w",encoding="utf-8") as f:
            f.write(render_profile_page(p))

    # trang phụ
    extra = {
        "all-series.html": render_all_series(),
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

    # Trang tác giả — CHỈ sinh cho tác giả đã có hồ sơ trong content/editors/
    # (theo quyết định: bắt buộc có hồ sơ CMS mới hiện trang, tránh trang trống
    # cho các tên chuyên mục như "TNC Editorial", "TNC Radar")
    authors = {}
    for a in ARTICLES:
        authors.setdefault(a["author"], []).append(a)
    skipped_authors = []
    for name, arts in authors.items():
        if name not in EDITORS:
            skipped_authors.append(name)
            continue
        with open(os.path.join(OUT, author_url(name)),"w",encoding="utf-8") as f:
            f.write(render_author_page(name, arts))
    if skipped_authors:
        print(f"  (Chưa có trang tác giả cho: {', '.join(skipped_authors)} — thiếu hồ sơ trong content/editors/)")

    # Chỉ mục tìm kiếm + sitemap + robots
    with open(os.path.join(OUT,"search-index.json"),"w",encoding="utf-8") as f:
        f.write(build_search_index())
    with open(os.path.join(OUT,"sitemap.xml"),"w",encoding="utf-8") as f:
        f.write(build_sitemap())
    with open(os.path.join(OUT,"robots.txt"),"w",encoding="utf-8") as f:
        f.write(f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n")

    generated_authors = len(authors) - len(skipped_authors)
    print(f"Build v3 xong: 1 index + {len(SERIES)} series + {len(ARTICLES)} article + {len(extra)} trang phụ + {generated_authors} trang tác giả")
    print(f"Output: {OUT}")

if __name__ == "__main__":
    main()
