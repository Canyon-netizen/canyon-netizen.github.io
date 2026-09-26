// ========================================
// Service Worker — 缓存优先策略
// ========================================
const CACHE_VERSION = 'v2.10.0';
const CACHE_NAME = `personal-site-${CACHE_VERSION}`;

const PRECACHE_URLS = [
    // 中文页面
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
    '/404.html',
    // 英文页面
    '/en/index.html',
    '/en/about.html',
    '/en/research.html',
    '/en/publications.html',
    '/en/projects.html',
    '/en/blog.html',
    '/en/talks.html',
    '/en/books.html',
    '/en/hobbies.html',
    '/en/cv.html',
    // 博客文章（中英双语）
    '/blog/2026-06-20-research-notes.html',
    '/blog/2026-05-08-python-config.html',
    '/en/blog/2026-06-20-research-notes.html',
    '/en/blog/2026-05-08-python-config.html',
    // 数据与搜索索引
    '/data.json',
    '/search-index.json',
    '/search-index-en.json',
    '/rss.xml',
    '/rss-en.xml',
    // 样式与脚本
    '/assets/css/style.css',
    '/assets/js/main.js',
    '/assets/js/partial-loader.js',
    '/assets/js/cv-renderer.js',
    '/assets/js/page-renderer.js',
    '/assets/js/ui.js',
    '/assets/js/article.js',
    // 模板片段
    '/partials/head-base.html',
    '/partials/head-extra-index.html',
    '/partials/head-blog.html',
    '/partials/header.html',
    '/partials/footer.html',
    '/partials/search-overlay.html',
    // 静态资源与元信息
    '/assets/images/favicon.svg',
    '/assets/images/profile.svg',
    '/assets/images/blog/three-pass-reading.svg',
    '/assets/files/cv.pdf',
    '/manifest.json',
    '/sitemap.xml'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.all(
                PRECACHE_URLS.map((u) =>
                    cache.add(u).catch((err) => {
                        // 单个 URL 失败不阻塞整个 SW 安装
                        console.warn('[sw] 预缓存失败：', u, err.message || err);
                    })
                )
            ))
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