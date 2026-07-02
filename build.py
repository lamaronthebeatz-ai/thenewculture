# -*- coding: utf-8 -*-
"""
TNC Site Builder
Sinh toàn bộ hệ thống trang tĩnh: index, 16 trang series, bài viết chi tiết.
Dữ liệu trung tâm -> đảm bảo nhất quán tuyệt đối giữa các trang.
"""
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
os.makedirs(OUT, exist_ok=True)

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

def _md_body_to_blocks(md):
    """Chuyển markdown đơn giản thành list block (kind, text) để render."""
    blocks = []
    for para in re.split(r'\n\s*\n', md.strip()):
        para = para.strip()
        if not para:
            continue
        if para.startswith('## '):
            blocks.append(("h2", para[3:].strip()))
        elif para.startswith('> '):
            # gộp nhiều dòng blockquote
            text = " ".join(line[2:].strip() if line.startswith('> ') else line.strip()
                             for line in para.split('\n'))
            blocks.append(("blockquote", text))
        else:
            # gộp xuống dòng đơn trong 1 đoạn thành 1 paragraph
            text = " ".join(line.strip() for line in para.split('\n'))
            blocks.append(("p", text))
    return blocks

def load_articles():
    """Đọc tất cả file .md, trả về list article dict, sắp theo 'order' rồi 'date'."""
    articles = []
    files = sorted(glob.glob(os.path.join(ARTICLES_DIR, "*.md")))
    for path in files:
        with open(path, encoding="utf-8") as f:
            raw = f.read()
        meta, body_md = _parse_frontmatter(raw)
        if not meta.get("title") or not meta.get("series"):
            print(f"  ! Bỏ qua {os.path.basename(path)} (thiếu title/series)")
            continue
        slug = os.path.splitext(os.path.basename(path))[0]
        articles.append({
            "slug": slug,
            "series": meta["series"],
            "title": meta["title"],
            "dek": meta.get("dek", ""),
            "author": meta.get("author", "TNC Editorial"),
            "date": meta.get("date", ""),
            "read_time": meta.get("read_time", ""),
            "featured": bool(meta.get("featured", False)),
            "order": int(meta.get("order", 999)),
            "tags": meta.get("tags", []) or [],
            "body": _md_body_to_blocks(body_md),
        })
    # sắp xếp: order tăng dần (order nhỏ = ưu tiên/mới), fallback theo slug
    articles.sort(key=lambda a: (a["order"], a["slug"]))
    return articles

ARTICLES = load_articles()
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
         'family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">')

def head(title, desc="Nền tảng tài liệu hóa văn hóa hip-hop underground Việt Nam."):
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{desc}">
<title>{title} — The New Culture</title>
{FONTS}
<link rel="stylesheet" href="style.css">
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
      <span>Thứ Ba · 30.06.2026 · Hà Nội</span>
      <div class="u-links">
        <a href="all-series.html">Series</a>
        <a href="tnc-sessions.html">TNC Sessions</a>
        <a href="hop-tac.html">Hợp tác</a>
      </div>
    </div>
  </div>
  <div class="masthead__main">
    <div class="container">
      <a href="index.html" class="wordmark" aria-label="The New Culture — trang chủ">
        <span class="tnc-badge">T</span>THE NEW CULTURE
      </a>
      <div class="masthead__actions">
        <a href="theo-doi.html" class="btn btn--solid">Theo dõi</a>
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
      <a href="index.html" class="wordmark"><span class="tnc-badge">T</span>THE NEW CULTURE</a>
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

def footer():
    return """
<footer class="footer">
  <div class="container">
    <div class="footer__grid">
      <div class="footer__brand">
        <a href="index.html" class="wordmark"><span class="tnc-badge">T</span>THE NEW CULTURE</a>
        <p>Nền tảng tài liệu hóa và phân tích văn hóa hip-hop underground Việt Nam. Lưu giữ để không giá trị nào bị lãng quên.</p>
        <div class="footer__social">
          <a href="https://facebook.com" target="_blank" rel="noopener" aria-label="Facebook">Fb</a>
          <a href="https://instagram.com" target="_blank" rel="noopener" aria-label="Instagram">Ig</a>
          <a href="https://youtube.com" target="_blank" rel="noopener" aria-label="YouTube">Yt</a>
          <a href="https://tiktok.com" target="_blank" rel="noopener" aria-label="TikTok">Tt</a>
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
        <li><a href="https://facebook.com" target="_blank" rel="noopener">Facebook</a></li>
        <li><a href="https://instagram.com" target="_blank" rel="noopener">Instagram</a></li>
        <li><a href="https://youtube.com" target="_blank" rel="noopener">YouTube</a></li>
        <li><a href="https://tiktok.com" target="_blank" rel="noopener">TikTok</a></li>
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
</script>
</body>
</html>"""

def article_url(slug): return f"article-{slug}.html"
def series_url(slug): return f"series-{slug}.html"

def art_code(article):
    """Mã lưu trữ bài viết: TNC·ITC·001"""
    s = SERIES_BY_SLUG[article["series"]]
    idx = ARTICLES_BY_SERIES[article["series"]].index(article) + 1
    return f"{s['code']}·{idx:03d}"

# -----------------------------------------------------------------
# RENDER: INDEX
# -----------------------------------------------------------------
def render_index():
    hero = ARTICLES[0]; hs = SERIES_BY_SLUG[hero["series"]]
    s2 = ARTICLES[1]; s2s = SERIES_BY_SLUG[s2["series"]]
    s3 = ARTICLES[2]; s3s = SERIES_BY_SLUG[s3["series"]]
    feat = ARTICLES[4]; fs = SERIES_BY_SLUG[feat["series"]]

    # hero side items
    side = ""
    for a in (s2, s3):
        s = SERIES_BY_SLUG[a["series"]]
        side += f"""
        <a class="side-item" href="{article_url(a['slug'])}">
          <div class="media media--1-1"><div class="media__zoom"></div></div>
          <div>
            <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
            <h3>{a['title']}</h3>
          </div>
        </a>"""

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
        <div class="media media--3-2"><div class="media__zoom"></div><span class="archive-code">{art_code(a)}</span></div>
        <span class="eyebrow eyebrow{s['accent']}">{s['name']}</span>
        <h3>{a['title']}</h3>
        <span class="byline">{a['author']} · {a['date']}</span>
      </a>"""

    # video (3)
    vids = [
        (ARTICLES[0], "38:12", "inside-the-culture"),
        (ARTICLES[7], "24:50", "tnc-community"),
        (ARTICLES[6], "45:03", "tnc-breakdown"),
    ]
    video_html = ""
    for a, dur, _ in vids:
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

    html = head("Underground. Documented.") + masthead()
    html += f"""
<main>
  <section class="hero container">
    <div class="hero__grid">
      <article class="hero__lead">
        <a href="{article_url(hero['slug'])}">
          <div class="media media--3-2"><div class="media__zoom"></div><span class="archive-code">{art_code(hero)}</span></div>
        </a>
        <div class="hero__body">
          <span class="eyebrow eyebrow{hs['accent']}">{hs['name']}</span>
          <h1><a href="{article_url(hero['slug'])}">{hero['title']}</a></h1>
          <p>{hero['dek']}</p>
          <span class="byline">{hero['author']} · {hero['read_time']}</span>
        </div>
      </article>
      <aside class="hero__side">{side}
      </aside>
    </div>
  </section>

  <section class="trending container">
    <div class="section-head"><h2>Đang được quan tâm</h2></div>
    <div class="trending__grid">{trending}
    </div>
  </section>

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
        <div class="media media--16-9"><div class="media__zoom"></div><span class="archive-code">{art_code(feat)}</span></div>
      </a>
      <div>
        <span class="eyebrow eyebrow{fs['accent']}">{fs['name']}</span>
        <h2><a href="{article_url(feat['slug'])}">{feat['title']}</a></h2>
        <p>{feat['dek']}</p>
        <a class="btn btn--ghost" href="{article_url(feat['slug'])}">Đọc bài</a>
      </div>
    </div>
  </section>

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
def render_series_page(s):
    arts = ARTICLES_BY_SERIES.get(s["slug"], [])
    rows = ""
    if arts:
        for a in arts:
            rows += f"""
      <a class="card" href="{article_url(a['slug'])}" style="flex-direction:row;gap:var(--s-5);align-items:center;">
        <div class="media media--3-2" style="flex:0 0 260px;"><div class="media__zoom"></div><span class="archive-code">{art_code(a)}</span></div>
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

    <div class="grid" style="grid-template-columns:1fr;gap:var(--s-6);">{rows}
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

# -----------------------------------------------------------------
# RENDER: ARTICLE PAGE
# -----------------------------------------------------------------
def render_body_blocks(blocks):
    out = []
    for kind, text in blocks:
        if kind == "p": out.append(f"      <p>{text}</p>")
        elif kind == "h2": out.append(f"      <h2>{text}</h2>")
        elif kind == "blockquote": out.append(f"      <blockquote>{text}</blockquote>")
    return "\n".join(out)

def render_article_page(a):
    s = SERIES_BY_SLUG[a["series"]]
    body = render_body_blocks(a["body"])

    # related
    same = [x for x in ARTICLES if x["series"]==a["series"] and x["slug"]!=a["slug"]]
    other = [x for x in ARTICLES if x["series"]!=a["series"] and x["slug"]!=a["slug"]]
    related = (same+other)[:3]
    rel = ""
    for r in related:
        rs = SERIES_BY_SLUG[r["series"]]
        rel += f"""
      <a class="card" href="{article_url(r['slug'])}">
        <div class="media media--3-2"><div class="media__zoom"></div><span class="archive-code">{art_code(r)}</span></div>
        <span class="eyebrow eyebrow{rs['accent']}">{rs['name']}</span>
        <h3>{r['title']}</h3>
        <span class="byline">{rs['name']} · {r['date']}</span>
      </a>"""

    tags = "".join(f'<a href="all-series.html" class="btn btn--ghost" style="text-transform:none;font-family:var(--f-mono);">{t}</a>' for t in a["tags"])

    html = head(a["title"], a["dek"]) + masthead(active=a["series"])
    html += f"""
<main>
  <article>
    <div class="container" style="max-width:760px;padding-top:var(--s-6);">
      <nav class="byline" style="margin-bottom:var(--s-5);" aria-label="breadcrumb">
        <a href="index.html">Trang chủ</a> / <a href="{series_url(s['slug'])}">{s['name']}</a>
      </nav>
      <span class="eyebrow eyebrow{s['accent']}" style="font-size:var(--t-sm);">{s['name']} · {art_code(a)}</span>
      <h1 style="font-size:var(--t-3xl);margin:var(--s-4) 0;">{a['title']}</h1>
      <p style="font-size:var(--t-lg);color:var(--c-ink-2);line-height:1.4;margin-bottom:var(--s-5);">{a['dek']}</p>
      <div style="display:flex;align-items:center;gap:var(--s-3);padding:var(--s-4) 0;border-top:1px solid var(--c-line);border-bottom:1px solid var(--c-line);">
        <div style="width:40px;height:40px;border-radius:50%;background:var(--c-bg-subtle);"></div>
        <div>
          <div style="font-weight:700;font-size:var(--t-sm);">{a['author']}</div>
          <div class="byline">{a['date']} · {a['read_time']}</div>
        </div>
      </div>
    </div>

    <div class="container" style="max-width:1100px;margin-block:var(--s-6);">
      <div class="media media--16-9"><div class="media__zoom"></div><span class="archive-code">{art_code(a)}</span></div>
      <p class="byline" style="text-align:right;margin-top:var(--s-2);">Ảnh minh họa — TNC Archive</p>
    </div>

    <div class="container article-body" style="max-width:680px;font-size:var(--t-md);line-height:1.8;">
{body}
    </div>

    <div class="container" style="max-width:680px;margin-top:var(--s-6);display:flex;gap:var(--s-2);flex-wrap:wrap;">
      {tags}
    </div>
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
.article-body blockquote{border-left:3px solid var(--c-red);padding-left:var(--s-5);margin:1.6em 0;font-size:var(--t-lg);font-style:italic;color:var(--c-ink);line-height:1.4;}
"""

# -----------------------------------------------------------------
# RENDER: TRANG PHỤ
# -----------------------------------------------------------------
def page_wrap(title, desc, inner):
    return head(title, desc) + masthead() + f"<main>\n{inner}\n</main>\n" + newsletter() + footer()

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
    vids = [
        (ARTICLES[0],"38:12"),(ARTICLES[7],"24:50"),(ARTICLES[6],"45:03"),
        (ARTICLES[3],"31:20"),(ARTICLES[1],"18:44"),(ARTICLES[4],"52:10"),
    ]
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
      <p>Email biên tập: bientap@thenewculture.vn<br>Hợp tác &amp; thương mại: hoptac@thenewculture.vn</p>
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
      <p>Để bắt đầu, gửi đề xuất tới <strong>hoptac@thenewculture.vn</strong> hoặc qua <a href="lien-he.html" style="color:var(--c-red);">trang liên hệ</a>.</p>
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
      <p>Bạn cũng có thể theo dõi TNC trên các nền tảng: <a href="https://facebook.com" target="_blank" rel="noopener" style="color:var(--c-red);">Facebook</a>, <a href="https://instagram.com" target="_blank" rel="noopener" style="color:var(--c-red);">Instagram</a>, <a href="https://youtube.com" target="_blank" rel="noopener" style="color:var(--c-red);">YouTube</a>, <a href="https://tiktok.com" target="_blank" rel="noopener" style="color:var(--c-red);">TikTok</a>.</p>
    </div>
  </section>
"""
    return page_wrap(title, desc, inner)

def render_sessions_page():
    eps = [(ARTICLES[0],"38:12"),(ARTICLES[3],"31:20"),(ARTICLES[4],"52:10")]
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
    import shutil
    os.makedirs(OUT, exist_ok=True)
    src_css = os.path.join(os.path.dirname(__file__), "style.css")
    dst_css = os.path.join(OUT, "style.css")
    shutil.copy(src_css, dst_css)
    with open(dst_css, "a", encoding="utf-8") as f:
        f.write(ARTICLE_CSS)

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
            f.write(render_series_page(s))
    for a in ARTICLES:
        with open(os.path.join(OUT, article_url(a["slug"])),"w",encoding="utf-8") as f:
            f.write(render_article_page(a))

    # trang phụ
    extra = {
        "all-series.html": render_all_series(),
        "video.html": render_video_page(),
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

    print(f"Build v3 xong: 1 index + {len(SERIES)} series + {len(ARTICLES)} article + {len(extra)} trang phụ")
    print(f"Output: {OUT}")

if __name__ == "__main__":
    main()
