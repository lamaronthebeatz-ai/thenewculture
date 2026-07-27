// Mirror của EDITOR_ROLES / EDITOR_BADGES / EDITOR_HONORS trong scripts/build.py
// (thuần dữ liệu hiển thị — id thật vẫn lưu ở authors.role/honor/badges, đúng
// nguyên tắc "Editors store only IDs. Never duplicate metadata." Nếu build.py
// thêm/đổi role/badge/honor, cập nhật lại đúng ở đây cho khớp).

// 7 giá trị chung cũ (không có nhãn tiếng Việt riêng trong build.py) + 16
// role_id tiếng Việt thật (Rev 4) — đúng danh sách CHECK của authors.role.
export const GENERIC_ROLES = [
  { id: "editor-in-chief", label: "Editor-in-chief (chung)" },
  { id: "deputy-editor", label: "Deputy editor (chung)" },
  { id: "managing-editor", label: "Managing editor (chung)" },
  { id: "senior-editor", label: "Senior editor (chung)" },
  { id: "editor", label: "Editor (chung)" },
  { id: "contributor", label: "Contributor (chung)" },
  { id: "guest", label: "Guest (chung)" },
];

export const EDITOR_ROLES = {
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
};

export const EDITOR_HONORS = {
  "nguoi-sang-lap": "Người Sáng lập",
  "10-nam-cong-hien": "10 Năm Cống hiến",
};

export const EDITOR_BADGES = {
  "nguoi-dong-sang-lap": "Người Đồng sáng lập",
  "kien-truc-nen-tang": "Kiến trúc Nền tảng",
  "chuyen-gia-hip-hop": "Chuyên gia Hip-Hop",
  "chuyen-gia-van-hoa": "Chuyên gia Văn hóa",
  "dao-duc-bao-chi": "Đạo đức Báo chí",
  "dieu-tra-chuyen-sau": "Điều tra Chuyên sâu",
  "cay-but-noi-bat": "Cây bút Nổi bật",
  "san-xuat-ben-vung": "Sản xuất Bền vững",
  "nguoi-ket-noi": "Người Kết nối",
  "dai-su-cong-dong": "Đại sứ Cộng đồng",
};

export function roleLabel(roleId) {
  return EDITOR_ROLES[roleId] || GENERIC_ROLES.find((r) => r.id === roleId)?.label || roleId;
}
