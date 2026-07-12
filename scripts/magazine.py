# -*- coding: utf-8 -*-
"""
TNC Magazine — Issue Builder (Monthly Digital Magazine)

Module ĐỘC LẬP với hệ bài viết chính (build.py). TNC Magazine không phải
một collection bài viết mới: nó không lưu trữ bài viết, không nhập tay
danh sách bài, không tạo bản sao nội dung nào. Mỗi Issue chỉ là metadata
(ảnh bìa, Cover Story, lời toà soạn, tháng/năm, trạng thái); build_issues()
dưới đây tự động tính toán MỖI LẦN BUILD:

  - Issue Number: không lưu ở đâu cả, tự tăng theo thứ tự Tháng/Năm tăng
    dần, KHÔNG reset theo năm (so sánh tuple (year, month) nên 2026-12 <
    2027-01 một cách tự nhiên).
  - Danh sách bài của Issue: mọi Article có publish date rơi đúng vào
    Tháng/Năm của Issue (quy tắc "monthly" mặc định), sắp giảm dần theo
    ngày đăng.
  - Cover Story: 1 Article do editor chọn thủ công trong CMS (field
    relation), build.py resolve thành object Article đầy đủ qua callback
    resolve_article_by_slug (module này không tự import ARTICLES/slugify —
    không đọc file, không biết cấu trúc dữ liệu Article).

build.py chịu trách nhiệm đọc file/parse frontmatter (tái dùng đúng
_parse_frontmatter đã có, module này không tự đọc file) và chịu trách
nhiệm render/ghi HTML (tái dùng head/masthead/footer/zoom/art_code...);
module này chỉ nhận dữ liệu đã parse, xử lý logic thuần Python, và cung
cấp các hàm hỗ trợ hiển thị (format tháng/năm, URL) để không lặp lại
(duplicate) bất kỳ đoạn HTML/CSS nào đã có.

Mở rộng trong tương lai (Special Issue / Annual Issue / Print Edition):
thêm 1 hàm matcher mới vào MATCHERS (ví dụ so khớp theo khoảng ngày tự do,
hoặc theo cả năm thay vì theo tháng) và 1 giá trị "kind" tương ứng trên
CMS — không cần sửa lại build_issues() hay luồng render chính.
"""


def _parse_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _match_monthly(period, articles, parse_article_date):
    """Quy tắc mặc định: gộp mọi Article có publish date rơi ĐÚNG vào
    Tháng/Năm của Issue. period là tuple (year, month), do build_issues()
    tính sẵn từ 2 field CMS "Tháng"/"Năm" — module này không tự parse
    field thô."""
    if period is None:
        return []
    year, month = period
    matched = []
    for a in articles:
        d = parse_article_date(a.get("date", ""))
        if d and d.year == year and d.month == month:
            matched.append(a)
    return matched


# Ánh xạ kind -> hàm chọn bài cho Issue. Issue hiện tại chỉ có kind
# "monthly" (mặc định). Thêm "special"/"annual"/"print" tại đây khi cần.
MATCHERS = {
    "monthly": _match_monthly,
}


def build_issues(raw_issues, articles, parse_article_date, resolve_article_by_slug):
    """Tính toán đầy đủ dữ liệu Issue từ metadata thô (đã parse frontmatter)
    + danh sách Article hiện có. Chạy lại từ đầu mỗi lần build — không có
    trạng thái nào được lưu giữa các lần build ngoài chính nội dung nguồn.

    raw_issues: list[dict] — mỗi dict có ít nhất slug/cover_image/
                cover_story (slug thô)/editors_note/month/year/status
                (chuỗi/số thô, chưa ép kiểu), tùy chọn "kind" (mặc định
                "monthly").
    articles:   list[dict] — ARTICLES của build.py, không sửa đổi.
    parse_article_date: callable(str) -> date|None — tái dùng
                _parse_vn_date của build.py.
    resolve_article_by_slug: callable(str) -> dict|None — tái dùng đúng
                cách chuẩn hoá slug (slugify) + tra cứu ARTICLES của
                build.py, không tự phát minh logic khớp slug ở đây.

    Trả về (issues, skipped, duplicates, bad_cover_story):
      issues: list[dict] đã sắp theo Issue Number tăng dần, mỗi dict có
              slug, number (int), number_display ("001"), cover_image,
              year (int), month (int), editors_note, cover_story
              (dict Article hoặc None), articles (list Article đã sắp
              publish date giảm dần, KHÔNG phải bản sao dữ liệu — cùng
              object dict article gốc, chỉ là tham chiếu).
      skipped: slug các issue thiếu/lỗi Tháng hoặc Năm — bị loại.
      duplicates: slug các issue trùng đúng Tháng/Năm với issue khác —
              bị loại (giữ lại issue nạp trước theo thứ tự slug).
      bad_cover_story: slug các issue có Cover Story không khớp Article
              nào — vẫn được build bình thường, chỉ riêng cover_story = None.
    """
    published = [dict(r) for r in raw_issues if r.get("status") == "published"]
    for r in published:
        year = _parse_int(r.get("year"))
        month = _parse_int(r.get("month"))
        r["_period"] = (year, month) if year and month and 1 <= month <= 12 else None
    skipped = [r["slug"] for r in published if r["_period"] is None]
    published = [r for r in published if r["_period"] is not None]

    # Loại trùng Tháng/Năm (2 issue cùng 1 tháng là dữ liệu mơ hồ — không
    # rõ bài viết tháng đó thuộc issue nào): giữ issue nạp trước theo thứ
    # tự slug, cảnh báo phần còn lại thay vì âm thầm gộp sai.
    seen_periods = {}
    deduped = []
    duplicates = []
    for r in sorted(published, key=lambda r: r["slug"]):
        if r["_period"] in seen_periods:
            duplicates.append(r["slug"])
            continue
        seen_periods[r["_period"]] = r["slug"]
        deduped.append(r)

    deduped.sort(key=lambda r: (r["_period"], r["slug"]))

    issues = []
    bad_cover_story = []
    for idx, raw in enumerate(deduped):
        matcher = MATCHERS.get(raw.get("kind", "monthly"), _match_monthly)
        matched = matcher(raw["_period"], articles, parse_article_date)
        matched.sort(key=lambda a: parse_article_date(a.get("date", "")), reverse=True)

        cover_story = resolve_article_by_slug(raw.get("cover_story", ""))
        if raw.get("cover_story") and cover_story is None:
            bad_cover_story.append(raw["slug"])

        year, month = raw["_period"]
        issues.append({
            "slug": raw["slug"],
            "number": idx + 1,
            "number_display": f"{idx + 1:03d}",
            "cover_image": raw.get("cover_image", ""),
            "year": year,
            "month": month,
            "editors_note": raw.get("editors_note", ""),
            "cover_story": cover_story,
            "articles": matched,
        })
    return issues, skipped, duplicates, bad_cover_story


def latest_issue(issues):
    """Issue hiển thị mặc định ở khối Trang chủ: luôn là số mới nhất theo
    Issue Number (tương đương Tháng/Năm mới nhất). Trả về None nếu chưa
    có issue nào đã xuất bản."""
    if not issues:
        return None
    return max(issues, key=lambda i: i["number"])


def issue_for_article(issues, article_slug):
    """Tìm issue (nếu có) chứa đúng bài viết này theo slug — dùng cho khối
    'Published in TNC Magazine' trên trang Article. Trả về issue ĐẦU TIÊN
    chứa bài (một bài chỉ thuộc đúng 1 tháng nên về bản chất chỉ có thể
    thuộc tối đa 1 issue "monthly")."""
    for issue in issues:
        if any(a["slug"] == article_slug for a in issue["articles"]):
            return issue
    return None


def issue_url(issue):
    return f"magazine-issue-{issue['number_display']}.html"


def format_month_year_vn(month, year):
    """Định dạng Tháng/Năm theo phong cách 'Tháng M, YYYY' nhất quán với
    cách hiển thị publish date của Article trên toàn site."""
    return f"Tháng {month}, {year}"
