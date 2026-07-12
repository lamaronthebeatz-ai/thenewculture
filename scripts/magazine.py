# -*- coding: utf-8 -*-
"""
TNC Magazine — Issue Builder (V6.0)

Module ĐỘC LẬP với hệ bài viết chính (build.py). TNC Magazine không phải
một collection bài viết mới: nó không lưu trữ bài viết, không nhập tay
danh sách bài, không tạo bản sao nội dung nào. Mỗi Issue chỉ là metadata
(ảnh bìa, ngày phát hành, lời toà soạn, trạng thái); build_issues() dưới
đây tự động tính toán MỖI LẦN BUILD:

  - Issue Number: không lưu ở đâu cả, tự tăng theo thứ tự Ngày phát hành
    tăng dần (không reset theo năm).
  - Danh sách bài của Issue: mọi Article có publish date trùng đúng ngày
    Publish Date của Issue (quy tắc "daily" mặc định).

build.py chịu trách nhiệm đọc file/parse frontmatter (tái dùng đúng
_parse_frontmatter đã có, module này không tự đọc file) và chịu trách
nhiệm render/ghi HTML (tái dùng head/masthead/footer/zoom/art_code...);
module này chỉ nhận dữ liệu đã parse, xử lý logic thuần Python, và cung
cấp các hàm render nội dung (nhận "helpers" là các hàm dựng HTML của
build.py) để không lặp lại (duplicate) bất kỳ đoạn HTML/CSS nào đã có.

Mở rộng trong tương lai (Weekly Issue / Special Issue / Print Edition):
thêm 1 hàm matcher mới vào MATCHERS (ví dụ so khớp theo khoảng ngày thay
vì đúng 1 ngày) và 1 giá trị "kind" tương ứng trên CMS — không cần sửa
lại build_issues() hay luồng render chính.
"""
import datetime


def _parse_iso_date(date_str):
    """Parse 'YYYY-MM-DD' (Sveltia CMS datetime widget, type: date, cùng
    quy ước đã dùng cho Chiến dịch quảng bá) thành datetime.date. Trả về
    None nếu trống/không đọc được — Issue đó sẽ bị loại, không chặn build."""
    if not date_str:
        return None
    try:
        return datetime.date.fromisoformat(str(date_str).strip()[:10])
    except ValueError:
        return None


def _match_daily(issue_date, articles, parse_article_date):
    """Quy tắc mặc định cho Issue thường ngày: gộp mọi Article có publish
    date trùng ĐÚNG 1 ngày với Issue. parse_article_date do build.py
    truyền vào (tái dùng đúng logic parse ngày bài viết đã có — hàm
    _parse_vn_date — không viết lại/không duplicate)."""
    if issue_date is None:
        return []
    return [a for a in articles if parse_article_date(a.get("date", "")) == issue_date]


# Ánh xạ kind -> hàm chọn bài cho Issue. Issue hiện tại chỉ có kind
# "daily" (mặc định). Thêm "weekly"/"special"/"print" tại đây khi cần.
MATCHERS = {
    "daily": _match_daily,
}


def build_issues(raw_issues, articles, parse_article_date, sort_article_key):
    """Tính toán đầy đủ dữ liệu Issue từ metadata thô (đã parse frontmatter)
    + danh sách Article hiện có. Chạy lại từ đầu mỗi lần build — không có
    trạng thái nào được lưu giữa các lần build ngoài chính nội dung nguồn.

    raw_issues: list[dict] — mỗi dict có ít nhất slug/cover_image/
                publish_date (chuỗi thô)/editors_note/featured/status,
                tùy chọn "kind" (mặc định "daily").
    articles:   list[dict] — ARTICLES của build.py, không sửa đổi.
    parse_article_date: callable(str) -> date|None — tái dùng
                _parse_vn_date của build.py.
    sort_article_key:   callable(article) -> sortable — tái dùng ĐÚNG
                key (order, slug) mà load_articles() đã dùng để sắp toàn
                site, không phát minh khái niệm "publish_time" riêng.

    Trả về list[dict] đã sắp theo Issue Number tăng dần, mỗi dict có:
    slug, number (int), number_display ("001"), cover_image,
    publish_date (datetime.date), editors_note, featured, articles
    (list bài viết đã sắp xếp, KHÔNG phải bản sao dữ liệu — cùng object
    dict article gốc, chỉ là tham chiếu)."""
    published = [dict(r) for r in raw_issues if r.get("status") == "published"]
    for r in published:
        r["_date"] = _parse_iso_date(r.get("publish_date"))
    skipped = [r["slug"] for r in published if r["_date"] is None]
    published = [r for r in published if r["_date"] is not None]

    # Loại trùng ngày phát hành (2 issue cùng 1 ngày là dữ liệu mơ hồ —
    # không rõ bài viết hôm đó thuộc issue nào): giữ issue nạp trước theo
    # thứ tự slug, cảnh báo phần còn lại thay vì âm thầm gộp sai.
    seen_dates = {}
    deduped = []
    duplicates = []
    for r in sorted(published, key=lambda r: r["slug"]):
        if r["_date"] in seen_dates:
            duplicates.append(r["slug"])
            continue
        seen_dates[r["_date"]] = r["slug"]
        deduped.append(r)

    deduped.sort(key=lambda r: (r["_date"], r["slug"]))

    issues = []
    for idx, raw in enumerate(deduped):
        matcher = MATCHERS.get(raw.get("kind", "daily"), _match_daily)
        matched = matcher(raw["_date"], articles, parse_article_date)
        matched = sorted(matched, key=sort_article_key)
        issues.append({
            "slug": raw["slug"],
            "number": idx + 1,
            "number_display": f"{idx + 1:03d}",
            "cover_image": raw.get("cover_image", ""),
            "publish_date": raw["_date"],
            "editors_note": raw.get("editors_note", ""),
            "featured": bool(raw.get("featured", False)),
            "articles": matched,
        })
    return issues, skipped, duplicates


def latest_or_featured(issues):
    """Issue hiển thị mặc định ở khối Trang chủ: ưu tiên issue đang được
    ghim Featured (mới nhất trong số các issue Featured nếu ghim nhiều
    hơn 1), nếu không có issue nào ghim thì lấy issue mới nhất theo
    Publish Date. Trả về None nếu chưa có issue nào."""
    if not issues:
        return None
    featured = [i for i in issues if i["featured"]]
    pool = featured if featured else issues
    return max(pool, key=lambda i: i["publish_date"])


def issue_for_article(issues, article_slug):
    """Tìm issue (nếu có) chứa đúng bài viết này theo slug — dùng cho khối
    'This article appears in TNC Magazine' trên trang Article. Trả về
    issue ĐẦU TIÊN chứa bài (một bài chỉ thuộc đúng 1 ngày nên về bản chất
    chỉ có thể thuộc tối đa 1 issue "daily")."""
    for issue in issues:
        if any(a["slug"] == article_slug for a in issue["articles"]):
            return issue
    return None


def issue_url(issue):
    return f"magazine-issue-{issue['number_display']}.html"


def format_publish_date_vn(d):
    """Định dạng datetime.date theo đúng phong cách 'D Tháng M, YYYY' đã
    dùng xuyên suốt site cho publish date của Article — nhất quán hiển
    thị, không phát minh định dạng ngày mới."""
    return f"{d.day} Tháng {d.month}, {d.year}"
