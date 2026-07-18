const CACHE='tnc-a17d9e22991b';
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
});