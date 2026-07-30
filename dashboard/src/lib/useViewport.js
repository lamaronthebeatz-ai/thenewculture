import { useEffect, useState } from "react";

// Mốc breakpoint khớp đúng tokens.css (ghi chú ở đó): mobile <=640px,
// tablet <=1080px, còn lại desktop. Dùng khi JS cần biết layout hiện tại
// (vd chọn Inspector hiện dạng panel hay Drawer) — CSS thuần (@media) vẫn
// là cách chính cho phần lớn responsive, hook này chỉ cho phần JS bắt buộc
// phải biết.
export function useViewport() {
  const [width, setWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));

  useEffect(() => {
    function onResize() {
      setWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    width,
    isMobile: width <= 640,
    isTablet: width > 640 && width <= 1080,
    isDesktop: width > 1080,
  };
}
