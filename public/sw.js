const CACHE='tnc-1783474812';
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
});