// ========================================
// 全站脚本（main.js）
// 职责：导航抽屉、主题「点击切换 + 跟随系统」、搜索索引加载与结果渲染、
//       分类过滤、文章目录生成、最后更新时间、Service Worker。
// 交互层（主题早期初始化、滚动进度、回到顶部、reveal 入场、TOC 高亮、
// 搜索键盘与焦点陷阱、代码复制等）由 assets/js/ui.js 统一负责，本文件末尾按需注入它。
// ========================================

// ---- 用脚本自身的 URL 推导站点根：兼容 GitHub Pages 子路径、/en/ 子目录与 file:// ----
// 为什么：GitHub Pages 上站点可能在子路径，旧代码用 location.pathname.includes('/blog/')
// 拼 '../' 的做法在 file:// 或子目录部署时必然错位。
const MAIN_SRC = (function () {
    const cs = document.currentScript;
    if (cs && cs.src) return cs.src;
    // currentScript 不可用时（例如被动态注入）从 script 列表倒查
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
        if (/assets\/js\/main\.js/.test(scripts[i].src || '')) return scripts[i].src;
    }
    return '';
})();
const SITE_ROOT = MAIN_SRC ? MAIN_SRC.replace(/assets\/js\/main\.js.*$/, '') : '';
const UI_LAYER_SRC = MAIN_SRC ? MAIN_SRC.replace(/main\.js(\?.*)?$/, 'ui.js') : 'assets/js/ui.js';

function init() {
    'use strict';

    const meta = window.__PAGE_META__ || {};
    const isEnglish = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);

    initNavDrawer();
    initAnchorScroll();
    initThemeToggle(isEnglish);
    initLastUpdated(isEnglish);
    initCategoryFilter();
    initToc();
    initSearch(isEnglish);
    registerServiceWorker();
}

// ========================================
// 移动端导航抽屉
// ========================================
// 类名切换与 aria-expanded 同步；点链接 / 点页面其他区域 / Esc 关闭。
// 二级下拉 #nav-more-toggle / #nav-more-menu 由 ui.js 负责，这里不重复绑定。
function initNavDrawer() {
    const navToggle = document.getElementById('nav-toggle');
    const siteNav = document.getElementById('site-nav');
    if (!navToggle || !siteNav) return;

    function setOpen(open) {
        siteNav.classList.toggle('open', open);
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    navToggle.addEventListener('click', function (e) {
        // 阻止冒泡，否则会被下面「点击其他区域关闭」的监听立刻关掉
        e.stopPropagation();
        setOpen(!siteNav.classList.contains('open'));
    });

    siteNav.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('a') && siteNav.classList.contains('open')) {
            setOpen(false);
        }
    });

    document.addEventListener('click', function (e) {
        if (!siteNav.classList.contains('open')) return;
        if (siteNav.contains(e.target) || navToggle.contains(e.target)) return;
        setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && siteNav.classList.contains('open')) {
            setOpen(false);
            navToggle.focus();
        }
    });
}

// ========================================
// 锚点平滑滚动
// ========================================
// 用事件委托：动态生成的 TOC / 建议链接也能生效；并尊重 prefers-reduced-motion。
function initAnchorScroll() {
    const reduceMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const anchor = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;

        let id = href.slice(1);
        try { id = decodeURIComponent(id); } catch (err) { /* 非法转义时按原样查找 */ }
        const target = document.getElementById(id);
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        // 保留锚点语义（便于分享与后退）；file:// 下部分浏览器会抛异常，忽略即可
        try { history.replaceState(null, '', href); } catch (err) {}
    });
}

// ========================================
// 主题切换（初始化由 ui.js 负责）
// ========================================
// main.js 只做两件事：点击取反 + 用户未手动选择时跟随系统变化。
// 存储键与 ui.js 的早期初始化保持一致（site-theme），否则会出现「选了又被系统覆盖」。
function initThemeToggle(isEnglish) {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const STORAGE_KEY = 'site-theme';
    const LANG = isEnglish
        ? { light: 'Switch to light theme', dark: 'Switch to dark theme' }
        : { light: '切换到浅色主题', dark: '切换到深色主题' };

    function storedTheme() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function syncLabel() {
        const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const label = theme === 'dark' ? LANG.light : LANG.dark;
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
    }

    function applyTheme(theme, persist) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) {
            try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
        }
        syncLabel();
    }

    syncLabel();
    // ui.js 可能在 main.js 之后才写入 data-theme：跟随它同步按钮文案
    if (window.MutationObserver) {
        new MutationObserver(syncLabel).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    themeToggle.addEventListener('click', function () {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });

    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const onChange = function (e) {
            if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', false);
        };
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else if (mq.addListener) mq.addListener(onChange);
    }
}

// ========================================
// 最后更新时间
// ========================================
// 旧实现用 new Date()（访问当天）冒充「最后更新」，具有误导性。
// 现在只在 partial-loader 没写入静态值时兜底，取文档的 Last-Modified。
function initLastUpdated(isEnglish) {
    const els = document.querySelectorAll('#last-updated');
    if (!els.length) return;

    els.forEach(function (el) {
        if (el.textContent.trim()) return; // 已有静态值 → 不覆盖
        const stamp = formatLastModified(document.lastModified, isEnglish);
        if (stamp) el.textContent = stamp;
    });
}

function formatLastModified(raw, isEnglish) {
    if (!raw) return '';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    if (isEnglish) {
        try {
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
        } catch (e) { /* 老浏览器回退数字格式 */ }
    }
    return d.getFullYear() + '.' + ('0' + (d.getMonth() + 1)).slice(-2);
}

// ========================================
// 博客分类过滤
// ========================================
// 为什么用事件委托：过滤按钮由 page-renderer 在 data.json 拉取完成后才生成，
// 而 main.js 的 init 在 partials:loaded 时同步执行，直接绑定会绑定到空集合（旧实现过滤失效）。
function initCategoryFilter() {
    document.addEventListener('click', function (e) {
        const btn = e.target && e.target.closest ? e.target.closest('.filter-btn') : null;
        if (!btn) return;

        const bar = btn.closest('.filter-bar');
        if (bar) {
            bar.querySelectorAll('.filter-btn').forEach(function (b) {
                b.classList.toggle('active', b === btn);
            });
        }

        const cat = btn.getAttribute('data-filter');
        document.querySelectorAll('.post-item[data-category]').forEach(function (item) {
            const show = cat === 'all' || item.getAttribute('data-category') === cat;
            item.style.display = show ? '' : 'none';
        });

        // 通知 ui.js：过滤后需要重新观察 .reveal（否则新出现的卡片不会入场）
        document.dispatchEvent(new CustomEvent('reveal:refresh', { detail: { filter: cat } }));
    });
}

// ========================================
// 文章目录（TOC）
// ========================================
// 目录结构（ul.toc-list）由这里生成；高亮与滚动由 ui.js 负责（.toc-item a.is-active）。
function initToc() {
    const tocContainer = document.getElementById('toc');
    if (!tocContainer) return;
    if (tocContainer.querySelector('.toc-list')) return; // 幂等：避免重复生成

    const article = document.querySelector('.post-content');
    if (!article) return;

    const headings = article.querySelectorAll('h2, h3');
    if (headings.length < 2) {
        tocContainer.style.display = 'none';
        return;
    }

    headings.forEach(function (h, i) {
        if (h.id) return;
        const text = h.textContent.trim();
        const slug = text.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^一-龥a-z0-9\-]/g, '')
            .substring(0, 50);
        h.id = slug || 'section-' + i;
    });

    const list = document.createElement('ul');
    list.className = 'toc-list';
    let currentH2Li = null;

    headings.forEach(function (h) {
        const li = document.createElement('li');
        li.className = 'toc-item toc-' + h.tagName.toLowerCase();
        const a = document.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent;
        li.appendChild(a);
        if (h.tagName === 'H2') {
            list.appendChild(li);
            currentH2Li = li;
        } else if (h.tagName === 'H3' && currentH2Li) {
            let subList = currentH2Li.querySelector('ul');
            if (!subList) {
                subList = document.createElement('ul');
                subList.className = 'toc-sublist';
                currentH2Li.appendChild(subList);
            }
            subList.appendChild(li);
        }
    });
    tocContainer.appendChild(list);
}

// ========================================
// 全站搜索（索引加载 + 结果渲染）
// ========================================
// 键盘交互（↑/↓/Enter/焦点态 class="focused"/结果数量）与焦点陷阱由 ui.js 负责：
// 每次渲染完派发 search:rendered，ui.js 收到后接管。
function initSearch(isEnglish) {
    const trigger = document.getElementById('search-trigger');
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const closeBtn = document.getElementById('search-close');
    const results = document.getElementById('search-results');
    if (!trigger || !overlay || !input || !results) return;

    const meta = window.__PAGE_META__ || {};
    const EMPTY_TEXT = meta.searchEmptyText || (isEnglish ? 'Type to search' : '输入关键词搜索');
    const ERROR_TEXT = isEnglish
        ? '⚠ Search index failed to load. Please try again later.'
        : '⚠ 搜索索引加载失败，请稍后重试。';
    // 语言决定索引文件；路径基于脚本自身推导的站点根，file:// 与子目录都能算对
    const INDEX_URL = SITE_ROOT + (isEnglish ? 'search-index-en.json' : 'search-index.json');

    let fuse = null;
    let indexData = [];      // 索引原始数组（正文子串检索要用）
    let fuseLoading = null;  // 复用同一个 Fuse 注入 Promise，避免重复插入脚本
    let indexLoading = null; // 复用同一个索引请求 Promise，避免重复 fetch

    function empty(text) {
        results.innerHTML = '<div class="search-empty">' + escapeHtml(text) + '</div>';
    }

    function dispatchRendered(query, count) {
        document.dispatchEvent(new CustomEvent('search:rendered', {
            detail: { query: query, count: count }
        }));
    }

    // Fuse 按需加载：只有真正打开搜索时才注入 CDN 脚本（旧实现每个页面都加载）
    function loadFuse() {
        if (window.Fuse) return Promise.resolve();
        if (fuseLoading) return fuseLoading;
        fuseLoading = new Promise(function (resolve, reject) {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js';
            s.async = true;
            s.onload = function () {
                if (window.Fuse) resolve();
                else reject(new Error('Fuse 未注册'));
            };
            s.onerror = function () { reject(new Error('Fuse 脚本加载失败')); };
            document.head.appendChild(s);
        });
        return fuseLoading;
    }

    function loadIndex() {
        if (fuse) return Promise.resolve();
        if (indexLoading) return indexLoading;

        indexLoading = Promise.all([
            loadFuse(),
            fetch(INDEX_URL, { credentials: 'same-origin' }).then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
        ]).then(function (res) {
            const data = res[1];
            if (!Array.isArray(data)) throw new Error('索引格式不正确');
            indexData = data;
            fuse = new window.Fuse(data, {
                // 标题权重最高，正文最低（正文只在文章里，用于全文检索）
                keys: [
                    { name: 'title', weight: 3 },
                    { name: 'excerpt', weight: 2 },
                    { name: 'body', weight: 1 }
                ],
                threshold: 0.4,
                includeMatches: true,
                includeScore: true,
                minMatchCharLength: 1
            });
            // 用户在索引加载期间可能已经输入了关键词
            render(input.value.trim());
        }).catch(function (err) {
            // 清掉失败缓存，下次打开搜索可以重试
            indexLoading = null;
            fuseLoading = null;
            console.warn('[main] 搜索索引加载失败：', err);
            empty(ERROR_TEXT);
            dispatchRendered('', 0);
        });
        return indexLoading;
    }

    // query 可选：404 页会把「访问失败的路径里的关键词」传进来，
    // 让搜索直接带着线索打开，而不是让读者重新想关键词
    function open(query) {
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        const prefill = typeof query === 'string' ? query : (open.__prefill || '');
        if (prefill) {
            input.value = prefill;
        }
        setTimeout(function () {
            input.focus();
            if (input.select) input.select();
        }, 50);
        if (!fuse) {
            // 索引就绪后用「当时输入框里的内容」渲染一次。
            // 注意：不能只依赖 loadIndex() 内部那次渲染 —— 如果索引在我这次
            // 注册 .then 之前就已经就绪（缓存命中），内部渲染早已跑过，
            // 而用户可能在之后才输入，结果就会一直空着（曾导致搜索偶发无结果）。
            loadIndex().then(function () {
                if (!fuse) return;                 // 索引加载失败时由 loadIndex 自己提示
                const q = input.value.trim();
                if (q) render(q);
            });
        } else if (prefill) {
            render(prefill.trim());
        }
    }

    // 事件方式打开（search:open）也能带 query
    document.addEventListener('search:open', function (e) {
        open(e && e.detail && e.detail.query);
    });

    function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        input.value = '';
        empty(EMPTY_TEXT);
        dispatchRendered('', 0);
    }

    /* 结果分组：类型 → 展示名（顺序即分组顺序） */
    const TYPE_ORDER = ['post', 'page', 'news', 'project', 'direction', 'talk', 'book', 'hobby'];
    const TYPE_LABEL = isEnglish
        ? { post: 'Article', page: 'Page', news: 'Update', project: 'Project', direction: 'Research', talk: 'Talk', book: 'Book', hobby: 'Hobby' }
        : { post: '文章', page: '页面', news: '动态', project: '项目', direction: '研究方向', talk: '分享', book: '阅读', hobby: '爱好' };

    /* 命中正文时截一段包含关键词的片段（比只显示摘要更有用） */
    function bodySnippet(item, query) {
        const body = item.body || '';
        if (!body) return '';
        const idx = body.toLowerCase().indexOf(String(query).toLowerCase());
        if (idx < 0) return '';
        const start = Math.max(0, idx - 40);
        const end = Math.min(body.length, idx + query.length + 60);
        return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '');
    }

    function render(query) {
        if (!fuse) return;
        if (!query) {
            empty(EMPTY_TEXT);
            dispatchRendered('', 0);
            return;
        }

        // 两段式检索：
        //   ① Fuse 模糊匹配 title/excerpt（容错拼写、相关度排序）
        //   ② 正文子串匹配（Fuse 的阈值按字段长度归一化，长正文里的精确命中
        //      会被判成低分而漏掉——实测「Pydantic」只在正文出现时搜不到）
        const hitMap = new Map();
        fuse.search(query).forEach(function (r) {
            if (r.item) hitMap.set(r.item, { it: r.item, score: r.score == null ? 0.5 : r.score });
        });
        const needle = String(query).toLowerCase();
        indexData.forEach(function (it) {
            if (hitMap.has(it)) return;
            const body = (it.body || '').toLowerCase();
            const excerpt = (it.excerpt || '').toLowerCase();
            const title = (it.title || '').toLowerCase();
            if (body.indexOf(needle) !== -1 || excerpt.indexOf(needle) !== -1 || title.indexOf(needle) !== -1) {
                // 正文命中排在模糊命中之后
                hitMap.set(it, { it: it, score: 0.9 });
            }
        });

        const items = Array.from(hitMap.values())
            .sort(function (a, b) { return a.score - b.score; })
            .slice(0, 14);
        if (!items.length) {
            empty(isEnglish
                ? 'No results for “' + query + '”'
                : '没有找到与「' + query + '」相关的内容');
            dispatchRendered(query, 0);
            return;
        }

        // 按 type 分组，组内保持相关度顺序
        const groups = new Map();
        items.forEach(function (entry) {
            const it = entry.it || {};
            const type = TYPE_ORDER.indexOf(it.type) === -1 ? 'page' : it.type;
            if (!groups.has(type)) groups.set(type, []);
            groups.get(type).push(entry);
        });

        const ordered = TYPE_ORDER.filter(function (t) { return groups.has(t); });
        results.innerHTML = ordered.map(function (type) {
            const rows = groups.get(type).map(function (entry) {
                const it = entry.it;
                const snippet = bodySnippet(it, query);
                return '<a class="search-result" href="' + escapeHtml(resolveUrl(it.url)) + '" data-type="' + type + '">' +
                    '<div class="search-result-head">' +
                    '<span class="search-result-title">' + highlight(it.title || '', query) + '</span>' +
                    '<span class="search-type">' + escapeHtml(TYPE_LABEL[type] || type) + '</span>' +
                    '</div>' +
                    '<div class="search-result-excerpt">' +
                    highlight(snippet || it.excerpt || '', query) +
                    '</div>' +
                    '</a>';
            }).join('');
            return '<div class="search-group">' +
                '<div class="search-group-title">' + escapeHtml(TYPE_LABEL[type] || type) +
                '<span class="search-group-count">' + groups.get(type).length + '</span></div>' +
                rows + '</div>';
        }).join('');

        dispatchRendered(query, items.length);
    }

    // 索引里的 url 以站点根为基准（如 blog/x.html、en/about.html），
    // 这里补成绝对地址，保证从 /blog/ 子目录页也能跳对；兼容旧的根绝对路径 /about.html
    function resolveUrl(url) {
        if (!url) return '#';
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) {
            if (url.charAt(0) === '/') return SITE_ROOT.replace(/\/$/, '') + url;
            return url;
        }
        return SITE_ROOT + url;
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function highlight(text, query) {
        const escaped = escapeHtml(text);
        if (!query) return escaped;
        const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(safeQuery, 'gi'), function (m) {
            return '<mark>' + m + '</mark>';
        });
    }

    trigger.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
    });
    input.addEventListener('input', function () {
        render(this.value.trim());
    });

    // ui.js / 外部调用入口（也支持派发 search:open / search:close 事件），
    // 便于焦点陷阱与键盘逻辑复用同一套开关行为
    window.__SITE_SEARCH__ = {
        open: open,
        close: close,
        isOpen: function () { return overlay.classList.contains('open'); }
    };
    document.addEventListener('search:close', close);

    // ui.js 当前只实现 ↑/↓/Enter 与 Tab 陷阱，Esc 关闭与 Ctrl+K 打开仍由这里兜底，
    // 保证「行为不变」；同键重复绑定只是同值操作，不会互相干扰。
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            open();
            return;
        }
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // 兜底：无论谁移除了 .open，都要解除滚动锁，避免「弹层关了页面却滚不动」
    if (window.MutationObserver) {
        new MutationObserver(function () {
            if (!overlay.classList.contains('open') && document.body.style.overflow) {
                document.body.style.overflow = '';
            }
        }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }
}

// ========================================
// Service Worker（PWA + 离线访问）
// ========================================
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (location.protocol !== 'https:' && !isLocal) return;

    window.addEventListener('load', function () {
        // 用站点根拼接，子路径部署时也能注册到正确的 sw.js
        const swUrl = (SITE_ROOT || '/') + 'sw.js';
        navigator.serviceWorker.register(swUrl).catch(function (err) {
            console.warn('[main] Service Worker 注册失败：', err);
        });
    });
}

// ========================================
// 启动：等待 partials 注入完成后再初始化
// ========================================
// 页面没有 template 时（例如纯静态页）直接初始化。
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        if (document.querySelector('template[data-include]')) {
            document.addEventListener('partials:loaded', init);
        } else {
            init();
        }
    });
} else {
    if (document.querySelector('template[data-include]')) {
        document.addEventListener('partials:loaded', init);
    } else {
        init();
    }
}

// ========================================
// 渲染器兜底挂载
// ========================================
// 为什么：页面有渲染容器却漏写渲染器 script 标签时，整页内容会静默不渲染
// （例如中文 talks.html 目前只有 main.js）。缺失时自动补挂；HTML 已有标签则跳过，
// 不会重复加载/重复渲染。
(function ensureRenderers() {
    const jobs = [];
    if (document.getElementById('page-content') && document.querySelector('[data-section]')) {
        jobs.push('page-renderer.js');
    }
    if (document.getElementById('cv-content')) jobs.push('cv-renderer.js');

    jobs.forEach(function (file) {
        if (document.querySelector('script[src*="' + file + '"]')) return; // HTML 已加载
        const s = document.createElement('script');
        s.defer = true;
        s.setAttribute('data-renderer-fallback', file);
        s.src = MAIN_SRC ? MAIN_SRC.replace(/main\.js(\?.*)?$/, file) : ('assets/js/' + file);
        document.head.appendChild(s);
    });
})();

// ========================================
// 现代交互层（ui.js）按需挂载
// ========================================
// 为什么不在 26 个 HTML 里各写一个 script：路径/顺序都容易漏，且英文页与博客子目录
// 需要不同的相对路径。这里用 main.js 的自身 URL 推导同目录的 ui.js。
(function injectUiLayer() {
    if (document.querySelector('script[data-ui-layer]')) return; // 只注入一次

    const s = document.createElement('script');
    s.setAttribute('data-ui-layer', '1');
    s.defer = true;
    s.src = UI_LAYER_SRC;
    s.addEventListener('error', function () {
        // ui.js 缺失时兜底显示 .reveal 内容，否则整页内容会因 opacity:0 不可见
        console.error('[main] 交互层 ui.js 加载失败，已降级为基础显示');
        document.querySelectorAll('.reveal').forEach(function (el) {
            el.classList.add('is-visible');
        });
    });
    s.addEventListener('load', function () {
        // 竞态兜底：ui.js 可能晚于 page:rendered 执行（缓存命中时渲染更快），
        // 此时动态插入的 .reveal 还没被观察 → 补发一次渲染事件让 ui.js 重新扫描（其内部幂等）
        if (document.querySelector('.reveal:not(.is-visible):not([data-reveal-bound])')) {
            document.dispatchEvent(new CustomEvent('page:rendered'));
        }
    });
    document.head.appendChild(s);
})();
