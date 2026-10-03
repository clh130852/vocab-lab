/* Service Worker：联网时取最新文件，断网时用缓存（离线可用） */
var CACHE = 'vocab-lab-v5';
var FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.css',
  './assets/icon.svg',
  './js/util.js',
  './js/dict.js',
  './js/wordlists.js',
  './js/templates.js',
  './js/srs.js',
  './js/store.js',
  './js/cards.js',
  './js/test.js',
  './js/reading.js',
  './js/ailookup.js',
  './js/readers.js',
  './js/views.js',
  './js/app.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(FILES.map(function (f) {
        return c.add(new Request(f, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { if (k !== CACHE) return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // AI 接口等跨域请求不缓存
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); }).catch(function () {});
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match('./index.html');
      });
    })
  );
});
