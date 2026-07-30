import { Tabs, Drawer } from "../components/ui";
import { useInspector } from "./InspectorContext";

// Desktop: panel cố định bên phải (panel 3/3). Tablet/Mobile: Drawer trượt
// từ phải/dưới — cùng nội dung, chỉ khác cách trình bày cho từng kích
// thước màn hình (đúng yêu cầu "mỗi thiết bị có UX riêng").
export default function InspectorPanel({ variant }) {
  const { content, isOpen, close } = useInspector();

  if (variant === "drawer") {
    return (
      <Drawer open={isOpen} onClose={close} title={content?.title || "Chi tiết"} side={variant === "drawer" ? "right" : "bottom"}>
        {content && <Tabs items={content.tabs} />}
      </Drawer>
    );
  }

  if (!isOpen) return null;

  return (
    <aside className="tncos-inspector" aria-label="Inspector">
      <div className="tncos-inspector__header">
        <h2>{content.title}</h2>
        <button type="button" className="tncos-dialog__close" onClick={close} aria-label="Đóng Inspector">
          ✕
        </button>
      </div>
      <div className="tncos-inspector__body">
        <Tabs items={content.tabs} />
      </div>
    </aside>
  );
}
