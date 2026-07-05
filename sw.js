// ========================================
// Service Worker — 缓存优先策略
// ========================================
const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME = `personal-site-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/about.html',
    '/research.html',
    '/publications.html',
    '/projects.html',
    '/blog.html',
    '/talks.html',
    '/books.html',
    '/hobbies.html',
    '/cv.html',
    '/en/index.html',
    '/en/about.html',
    '/en/cv.html',
    '/data.json',
    '/assets/css/style.css',
    '/assets/js/main.js',
    '/assets/js/partial-loader.js',
    '/assets/js/cv-renderer.js',
    '/partials/head-base.html',
    '/partials/head-extra-index.html',
    '/partials/head-blog.html',
    '/partials/header.html',
    '/partials/footer.html',
    '/partials/search-overlay.html',
    '/assets/images/favicon.svg',
    '/assets/images/profile.svg',
    '/manifest.json',
    '/rss.xml',
    '/sitemap.xml'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS.map((u) => new Request(u, { cache: 'reload' })))
                .catch((err) => {
                    // 单个 URL 失败不阻塞整个 SW 安装
                    console.warn('[sw] 部分 URL 预缓存失败：', err);
                })
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) =>
            Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== location.origin) return;

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;

            return fetch(request).then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return response;
            }).catch(() => {
                // 离线兜底：返回首页
                if (request.destination === 'document') {
                    return caches.match('/');
                }
            });
        })
    );
});