/* ============================================================
 * ui.js — 现代交互层
 * ------------------------------------------------------------
 * 职责（与 main.js 的分工，避免重复绑定）：
 *   - 主题的「早期初始化」：在 CSS 生效前决定 data-theme，消除深色模式白屏闪烁
 *     （main.js 只负责点击切换与跟随系统变化）
 *   - 滚动进度条、回到顶部按钮、导航 ScrollSpy
 *   - 导航二级下拉、移动端抽屉的 aria 状态与关闭时机
 *   - .reveal 滚动渐入（含动态渲染内容的交错延迟）
 *   - 文章：目录（TOC）高亮、标题锚点、代码块复制、阅读进度
 *   - 搜索弹层：键盘导航（↑/↓/Enter/Esc）、焦点陷阱、结果焦点态
 *   - 外部链接处理、图片懒加载兜底与小图预览
 *
 * 设计原则：所有增强都是「渐进增强」——任何一段失败都不能影响页面可用性，
 * 因此每块能力都独立包裹 try/catch，并在缺少依赖元素时直接跳过。
 * ============================================================ */
(function () {
    'use strict';

    var doc = document;
    var root = doc.documentElement;

    /* ==========================================================
     * 0. 工具
     * ========================================================== */
    var reduceMotion = false;
    try {
        reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { /* 老浏览器忽略 */ }

    function on(target, type, handler, opts) {
        if (target) target.addEventListener(type, handler, opts || false);
    }

    function lang() {
        var meta = window.__PAGE_META__ || {};
        var isEn = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);
        return isEn ? 'en' : 'zh';
    }

    var LANG = lang();

    // 仅用于 ui.js 自己创建的、需要本地化的少量文案
    var TEXT = LANG === 'en'
        ? {
            backToTop: 'Back to top',
            copy: 'Copy',
            copied: 'Copied',
            toc: 'On this page',
            expand: 'Expand',
            more: 'More',
            contact: 'Contact',
            close: 'Close',
            codeRegion: 'Code block',
            resultCount: function (n) { return n + (n === 1 ? ' result' : ' results'); }
        }
        : {
            backToTop: '回到顶部',
            copy: '复制',
            copied: '已复制',
            toc: '本页目录',
            expand: '展开',
            more: '更多',
            contact: '联系我',
            close: '关闭',
            codeRegion: '代码块',
            resultCount: function (n) { return n + ' 条结果'; }
        };

    /* ==========================================================
     * 1. 主题早期初始化（消除 FOUC）
     * ========================================================== */
    (function bootTheme() {
        var KEY = 'site-theme';
        var stored = null;
        try { stored = localStorage.getItem(KEY); } catch (e) { /* 隐私模式 */ }

        var theme = (stored === 'dark' || stored === 'light')
            ? stored
            : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

        // 页面若已由内联脚本设过，尊重现有值
        if (!root.getAttribute('data-theme')) {
            root.setAttribute('data-theme', theme);
        }
        uiSyncThemeColor();
    })();

    // 让浏览器工具栏/移动端状态栏颜色跟随主题
    function uiSyncThemeColor() {
        try {
            var theme = root.getAttribute('data-theme') || 'light';
            var color = theme === 'dark' ? '#0c1118' : '#1e3a5f';
            var metas = doc.querySelectorAll('meta[name="theme-color"]');
            if (!metas.length) {
                var m = doc.createElement('meta');
                m.setAttribute('name', 'theme-color');
                doc.head.appendChild(m);
                metas = [m];
            }
            // head-base 里可能有两个（一个带 media），统一改写为当前主题色
            Array.prototype.forEach.call(metas, function (m) {
                m.setAttribute('content', color);
            });
        } catch (e) { /* 非关键 */ }
    }

    // main.js 切换主题时会改 data-theme；这里同步相关副作用
    if (window.MutationObserver) {
        new MutationObserver(function () { uiSyncThemeColor(); })
            .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    }

    function ready(fn) {
        if (doc.readyState === 'loading') {
            doc.addEventListener('DOMContentLoaded', fn, { once: true });
        } else {
            fn();
        }
    }

    ready(function () {
        // partials 注入是异步的：header/toc 等元素要等它完成后再处理
        if (doc.querySelector('template[data-include]')) {
            doc.addEventListener('partials:loaded', function () {
                safe(initNav, 'nav');
                safe(initScrollUi, 'scroll');
                safe(initArticle, 'article');
                safe(initSearchA11y, 'search');
                safe(initLinks, 'links');
                safe(initLazyImages, 'images');
            });
        } else {
            safe(initNav, 'nav');
            safe(initScrollUi, 'scroll');
            safe(initArticle, 'article');
            safe(initSearchA11y, 'search');
            safe(initLinks, 'links');
            safe(initLazyImages, 'images');
        }

        safe(initReveal, 'reveal');
        safe(initLightbox, 'lightbox');
    });

    // 内容渲染完成后再扫描一次（渲染器插入的节点默认不可见）
    on(doc, 'page:rendered', function () {
        safe(initReveal, 'reveal:page');
        safe(initArticle, 'article:page');
        safe(initLinks, 'links:page');
        safe(initLightbox, 'lightbox:page');
    });
    on(doc, 'cv:rendered', function () { safe(initLinks, 'links:cv'); });
    on(doc, 'search:rendered', function () { safe(bindSearchKeys, 'search:keys'); });

    function safe(fn, label) {
        try { fn(); } catch (err) {
            // 增强失败不应影响页面主干功能
            if (window.console && console.warn) console.warn('[ui] ' + label + ' 初始化失败：', err);
        }
    }

    // 代码高亮（highlight.js 走 CDN，离线或 CDN 不通时不能抛错影响阅读）
    function safeHighlight() {
        try {
            if (window.hljs && typeof window.hljs.highlightAll === 'function') {
                window.hljs.highlightAll();
            }
        } catch (err) {
            if (window.console && console.warn) console.warn('[ui] 代码高亮跳过：', err);
        }
    }

    /* ==========================================================
     * 2. 导航：二级下拉 + 移动端抽屉
     * ========================================================== */
    function initNav() {
        var toggle = doc.getElementById('nav-more-toggle');
        var menu = doc.getElementById('nav-more-menu');
        var wrap = doc.getElementById('nav-more');

        function closeMenu() {
            if (!menu) return;
            menu.classList.remove('is-open');
            if (toggle) toggle.setAttribute('aria-expanded', 'false');
        }

        if (toggle && menu) {
            on(toggle, 'click', function (e) {
                e.stopPropagation();
                var open = menu.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            });

            // 点击菜单项后关闭
            on(menu, 'click', function (e) {
                if (e.target.closest && e.target.closest('a')) closeMenu();
            });

            // 点击外部 / Esc 关闭
            on(doc, 'click', function (e) {
                if (wrap && !wrap.contains(e.target)) closeMenu();
            });
            on(doc, 'keydown', function (e) {
                if (e.key !== 'Escape') return;
                if (menu.classList.contains('is-open')) {
                    closeMenu();
                    toggle.focus();
                }
            });

            // 键盘：下拉内左右/上下移动焦点
            on(menu, 'keydown', function (e) {
                var links = Array.prototype.slice.call(menu.querySelectorAll('a'));
                var i = links.indexOf(doc.activeElement);
                if (i === -1) return;
                if (e.key === 'ArrowDown') { e.preventDefault(); links[(i + 1) % links.length].focus(); }
                if (e.key === 'ArrowUp') { e.preventDefault(); links[(i - 1 + links.length) % links.length].focus(); }
            });
        }

        // 移动端抽屉：同步 aria-expanded；滚动/尺寸变化时收起
        var navToggle = doc.getElementById('nav-toggle');
        var siteNav = doc.getElementById('site-nav');
        if (navToggle && siteNav) {
            var syncDrawer = function () {
                var open = siteNav.classList.contains('open');
                navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                if (open) closeMenu();
            };
            // main.js 负责 class 切换，这里只在之后同步 ARIA
            on(navToggle, 'click', function () { setTimeout(syncDrawer, 0); });
            on(siteNav, 'click', function (e) {
                if (e.target.closest && e.target.closest('a')) setTimeout(syncDrawer, 0);
            });
            on(doc, 'keydown', function (e) {
                if (e.key === 'Escape' && siteNav.classList.contains('open')) {
                    siteNav.classList.remove('open');
                    syncDrawer();
                    navToggle.focus();
                }
            });
            on(window, 'resize', function () {
                if (window.innerWidth > 900 && siteNav.classList.contains('open')) {
                    siteNav.classList.remove('open');
                    syncDrawer();
                }
            });
        }
    }

    /* ==========================================================
     * 3. 滚动相关：进度条 / 回到顶部 / ScrollSpy / 页眉阴影
     * ========================================================== */
    function initScrollUi() {
        initScrollProgress();
        initBackToTop();
        initScrollSpy();
        initHeaderShadow();
    }

    var rafPending = false;
    function onScrollThrottled(handler) {
        function run() {
            rafPending = false;
            handler();
        }
        on(window, 'scroll', function () {
            if (rafPending) return;
            rafPending = true;
            if (window.requestAnimationFrame) window.requestAnimationFrame(run);
            else setTimeout(run, 16);
        }, { passive: true });
        handler();
    }

    function initScrollProgress() {
        var bar = doc.createElement('div');
        bar.className = 'scroll-progress';
        bar.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(bar);

        onScrollThrottled(function () {
            var max = doc.documentElement.scrollHeight - window.innerHeight;
            var ratio = max > 0 ? window.scrollY / max : 0;
            bar.style.setProperty('--scroll', ratio.toFixed(4));
            bar.classList.toggle('is-active', ratio > 0.005);
        });
    }

    function initBackToTop() {
        // main.js 可能已经建好按钮，复用避免重复
        var btn = doc.querySelector('.back-to-top');
        if (!btn) {
            btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'back-to-top';
            btn.setAttribute('aria-label', TEXT.backToTop);
            btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>';
            doc.body.appendChild(btn);
        }
        btn.title = TEXT.backToTop;
        on(btn, 'click', function () {
            window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
        });

        onScrollThrottled(function () {
            var show = window.scrollY > 420;
            btn.classList.toggle('show', show);
            btn.setAttribute('aria-hidden', show ? 'false' : 'true');
            btn.tabIndex = show ? 0 : -1;
        });
    }

    // 导航高亮跟随当前可视区块（首页）
    function initScrollSpy() {
        var links = doc.querySelectorAll('.site-nav a.nav-link[href]');
        if (!links.length) return;

        // 建立「链接 → 页面区块」映射
        var map = [];
        Array.prototype.forEach.call(links, function (a) {
            var href = a.getAttribute('href') || '';
            if (href.charAt(0) === '#' || href.indexOf('.html') === -1) return;
            var file = href.split('#')[0].split('/').pop();
            map.push({ link: a, file: file });
        });
        if (!map.length) return;

        var current = location.pathname.split('/').pop() || 'index.html';
        // 首页路径可能是目录形式
        if (current === '' || current === '/' || location.pathname.slice(-1) === '/') current = 'index.html';

        // 站内区块（仅在首页有意义）：给主要 section 加 id 供锚点高亮
        var sections = [];
        if (current === 'index.html' || doc.querySelector('[data-section="personal-hero"]')) {
            Array.prototype.forEach.call(doc.querySelectorAll('[data-section]'), function (sec) {
                var name = sec.getAttribute('data-section');
                if (name === 'personal-hero') sections.push({ id: 'index.html', el: sec });
                else if (name === 'featured-publications') sections.push({ id: 'publications.html', el: sec });
                else if (name === 'latest-posts') sections.push({ id: 'blog.html', el: sec });
            });
        }

        function activate(file) {
            Array.prototype.forEach.call(map, function (item) {
                item.link.classList.toggle('active', item.file === file);
            });
        }

        if (!sections.length) { activate(current); return; }

        var visible = null;

        function update() {
            var marker = window.scrollY + window.innerHeight * 0.28;
            var picked = current;
            sections.forEach(function (s) {
                var top = s.el.getBoundingClientRect().top + window.scrollY;
                if (top <= marker) picked = s.id;
            });
            // 首屏以上仍算首页
            if (window.scrollY < 80) picked = 'index.html';
            if (picked !== visible) {
                visible = picked;
                activate(picked);
            }
        }

        onScrollThrottled(update);
    }

    function initHeaderShadow() {
        var header = doc.querySelector('.site-header');
        if (!header) return;
        onScrollThrottled(function () {
            header.classList.toggle('is-scrolled', window.scrollY > 6);
        });
    }

    /* ==========================================================
     * 4. 滚动渐入（含动态内容）
     * ========================================================== */
    var revealObserver = null;

    function initReveal() {
        var targets = doc.querySelectorAll('.reveal:not(.is-visible):not([data-reveal-bound])');
        if (!targets.length) return;

        if (reduceMotion || !('IntersectionObserver' in window)) {
            Array.prototype.forEach.call(targets, function (el) {
                el.classList.add('is-visible');
                el.setAttribute('data-reveal-bound', '1');
            });
            return;
        }

        if (!revealObserver) {
            revealObserver = new IntersectionObserver(function (entries) {
                var self = this || revealObserver;
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    entry.target.classList.add('is-visible');
                    // 用 this（observer 本身）+ 空值判断：闭包里的 revealObserver 在某些
                    // 时序下可能还是 null，直接调用会抛 TypeError 打断整批入场动画
                    if (self && self.unobserve) self.unobserve(entry.target);
                });
            }, { threshold: 0.08, rootMargin: '0px 0px -8% 0px' });
        }

        // 同组元素交错入场：按父容器分组编号
        var groups = new Map();
        Array.prototype.forEach.call(targets, function (el) {
            el.setAttribute('data-reveal-bound', '1');
            var parent = el.parentElement || doc.body;
            var idx = groups.get(parent) || 0;
            groups.set(parent, idx + 1);
            if (idx > 0 && idx < 8) {
                el.style.setProperty('--reveal-delay', (idx * 0.06).toFixed(2) + 's');
            }
            revealObserver.observe(el);
        });
    }

    /* ==========================================================
     * 5. 文章增强：目录 / 锚点 / 复制代码 / 阅读进度
     * ========================================================== */
    function initArticle() {
        var article = doc.querySelector('.post-content, .article-content');
        if (!article) return;
        initReadingProgress(article);
        initHeadingAnchors(article);
        initCodeBlocks(article);
        initToc(article);
        safeHighlight();
        initReadTime(article);
    }

    // 用正文实际字数校正「阅读时间」：data.json 里的 readTime 是手写的，
    // 与真实篇幅脱节时会给读者错误预期（中文按 350 字/分钟，英文按 220 词/分钟）
    function initReadTime(article) {
        var nodes = doc.querySelectorAll('.read-time[data-computed]');
        if (nodes.length) return;                    // 已经算过
        var text = (article.innerText || article.textContent || '').trim();
        if (text.length < 200) return;               // 太短就不显示，免得「约 1 分钟」很傻

        var cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        var words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9']+/g) || []).length;
        var minutes = LANG === 'en'
            ? Math.max(1, Math.round(words / 220))
            : Math.max(1, Math.round(cjk / 350));

        var label = LANG === 'en' ? minutes + ' min read' : '约 ' + minutes + ' 分钟';
        var targets = doc.querySelectorAll('.read-time');
        Array.prototype.forEach.call(targets, function (el) {
            el.textContent = label;
            el.setAttribute('data-computed', minutes);
            el.title = LANG === 'en'
                ? minutes + ' min read (estimated from ' + words + ' words)'
                : '约 ' + minutes + ' 分钟（按正文 ' + cjk + ' 字估算）';
        });
    }

    function initReadingProgress(article) {
        if (doc.querySelector('.reading-progress')) return;
        var bar = doc.createElement('div');
        bar.className = 'reading-progress';
        bar.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(bar);

        onScrollThrottled(function () {
            var rect = article.getBoundingClientRect();
            var total = rect.height - window.innerHeight;
            var done = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
            bar.style.setProperty('--progress', (total > 0 ? done / total : 0).toFixed(4));
        });
    }

    function slugify(text, index) {
        var slug = (text || '').trim().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\u4e00-\u9fa5a-z0-9\-]/g, '')
            .slice(0, 60);
        return slug || ('section-' + index);
    }

    function initHeadingAnchors(article) {
        var headings = article.querySelectorAll('h2, h3');
        Array.prototype.forEach.call(headings, function (h, i) {
            if (h.querySelector('.heading-anchor')) return;
            if (!h.id) h.id = slugify(h.textContent, i);
            var a = doc.createElement('a');
            a.className = 'heading-anchor';
            a.href = '#' + h.id;
            a.setAttribute('aria-label', (LANG === 'en' ? 'Link to ' : '本节链接：') + h.textContent.trim());
            a.textContent = '#';
            h.appendChild(a);
        });
    }

    // 复制兜底（非 HTTPS / 老浏览器）
    function legacyCopy(text) {
        var ta = doc.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        doc.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
        doc.body.removeChild(ta);
        return ok;
    }

    function initCodeBlocks(article) {
        var pres = article.querySelectorAll('pre');
        Array.prototype.forEach.call(pres, function (pre) {
            if (pre.getAttribute('data-code-enhanced')) return;
            pre.setAttribute('data-code-enhanced', '1');

            var code = pre.querySelector('code');
            // 语言标签
            var langName = '';
            if (code) {
                var cls = code.className || '';
                var m = cls.match(/language-([a-z0-9+#]+)/i);
                if (m) langName = m[1];
            }
            if (langName && !pre.querySelector('.code-lang')) {
                var tag = doc.createElement('span');
                tag.className = 'code-lang';
                tag.setAttribute('aria-hidden', 'true');
                tag.textContent = langName;
                pre.appendChild(tag);
            }

            // 窄屏下代码块会横向滚动：让它可以被键盘聚焦并滚动，
            // 并给一个可访问名（WCAG 2.1.1 键盘可达 + 2.4.6 名称）
            pre.setAttribute('tabindex', '0');
            pre.setAttribute('role', 'region');
            pre.setAttribute('aria-label',
                (TEXT.codeRegion || '代码') + (langName ? '：' + langName : ''));

            if (pre.querySelector('.code-copy')) return;
            var btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'code-copy';
            btn.textContent = TEXT.copy;
            btn.setAttribute('aria-label', TEXT.copy);
            on(btn, 'click', function () {
                var text = code ? code.innerText : pre.innerText;
                function done() {
                    btn.textContent = TEXT.copied;
                    btn.classList.add('is-copied');
                    setTimeout(function () {
                        btn.textContent = TEXT.copy;
                        btn.classList.remove('is-copied');
                    }, 1800);
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, function () {
                        if (legacyCopy(text)) done();
                    });
                } else if (legacyCopy(text)) {
                    done();
                }
            });
            pre.appendChild(btn);
        });
    }

    function initToc(article) {
        var toc = doc.getElementById('toc');
        if (!toc) return;
        var links = toc.querySelectorAll('a[href^="#"]');
        if (links.length < 2) return;

        var items = [];
        Array.prototype.forEach.call(links, function (a) {
            var id = decodeURIComponent(a.getAttribute('href').slice(1));
            var el = id ? doc.getElementById(id) : null;
            if (el) items.push({ link: a, el: el });
        });
        if (!items.length) return;
        if (!toc.querySelector('.toc-title')) {
            var t = doc.createElement('div');
            t.className = 'toc-title';
            t.textContent = TEXT.toc;
            toc.insertBefore(t, toc.firstChild);
        }

        function activate(activeLink) {
            items.forEach(function (it) {
                it.link.classList.toggle('is-active', it.link === activeLink);
            });
        }

        if ('IntersectionObserver' in window) {
            var seen = new Map();
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) { seen.set(en.target, en.isIntersecting ? en.boundingClientRect.top : null); });
                // 取当前可见且最靠上的标题
                var best = null;
                seen.forEach(function (top, el) {
                    if (top === null) return;
                    if (!best || top < best.top) best = { top: top, el: el };
                });
                if (best) {
                    var found = items.filter(function (it) { return it.el === best.el; })[0];
                    if (found) activate(found.link);
                }
            }, { rootMargin: '-18% 0px -70% 0px', threshold: [0, 1] });
            items.forEach(function (it) { io.observe(it.el); });
        }

        on(toc, 'click', function (e) {
            var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
            if (a) activate(a);
        });
    }

    /* ==========================================================
     * 6. 搜索弹层：键盘导航与焦点陷阱
     * ========================================================== */
    var searchBound = false;

    function initSearchA11y() {
        var overlay = doc.getElementById('search-overlay');
        if (!overlay) return;

        // 加上底部快捷键提示（只加一次）
        var modal = overlay.querySelector('.search-modal');
        if (modal && !modal.querySelector('.search-footer')) {
            var footer = doc.createElement('div');
            footer.className = 'search-footer';
            footer.innerHTML = LANG === 'en'
                ? '<span><kbd>↑</kbd><kbd>↓</kbd>navigate</span><span><kbd>Enter</kbd>open</span><span><kbd>Esc</kbd>close</span><span class="search-count"></span>'
                : '<span><kbd>↑</kbd><kbd>↓</kbd>选择</span><span><kbd>Enter</kbd>打开</span><span><kbd>Esc</kbd>关闭</span><span class="search-count"></span>';
            modal.appendChild(footer);
        }

        // 焦点陷阱：Tab 在弹层内循环
        on(overlay, 'keydown', function (e) {
            if (e.key !== 'Tab') return;
            var focusables = overlay.querySelectorAll('a[href], button, input, [tabindex]:not([tabindex="-1"])');
            if (!focusables.length) return;
            var first = focusables[0];
            var last = focusables[focusables.length - 1];
            if (e.shiftKey && doc.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && doc.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        bindSearchKeys();
    }

    function searchResults() {
        return Array.prototype.slice.call(doc.querySelectorAll('#search-results .search-result'));
    }

    function bindSearchKeys() {
        var overlay = doc.getElementById('search-overlay');
        if (!overlay) return;

        // 结果数量提示：每次渲染都要刷新（不能因为 keydown 只绑一次就跳过）
        var count = overlay.querySelector('.search-count');
        if (count) {
            var n = searchResults().length;
            count.textContent = n ? TEXT.resultCount(n) : '';
        }

        if (searchBound) return;
        searchBound = true;

        on(doc, 'keydown', function (e) {
            if (!overlay.classList.contains('open')) return;
            var results = searchResults();

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (!results.length) return;
                e.preventDefault();
                var idx = results.findIndex(function (r) { return r.classList.contains('focused'); });
                var next = e.key === 'ArrowDown'
                    ? (idx + 1 >= results.length ? 0 : idx + 1)
                    : (idx - 1 < 0 ? results.length - 1 : idx - 1);
                results.forEach(function (r) { r.classList.remove('focused'); });
                results[next].classList.add('focused');
                if (results[next].scrollIntoView) results[next].scrollIntoView({ block: 'nearest' });
            }

            if (e.key === 'Enter') {
                var focused = results.filter(function (r) { return r.classList.contains('focused'); })[0];
                if (focused && focused.href) {
                    e.preventDefault();
                    location.href = focused.href;
                }
            }
        });

        // 悬停时同步焦点态
        on(doc.getElementById('search-results'), 'mouseover', function (e) {
            var r = e.target.closest ? e.target.closest('.search-result') : null;
            if (!r) return;
            searchResults().forEach(function (x) { x.classList.toggle('focused', x === r); });
        });
    }

    /* ==========================================================
     * 7. 链接与图片
     * ========================================================== */
    function initLinks() {
        Array.prototype.forEach.call(doc.querySelectorAll('a[href^="http"]'), function (a) {
            var href = a.getAttribute('href') || '';
            if (href.indexOf(location.origin) === 0 && location.protocol !== 'file:') return;
            if (href.indexOf('canyon-netizen.github.io') !== -1) return; // 本站地址
            if (!a.getAttribute('target')) a.setAttribute('target', '_blank');
            var rel = a.getAttribute('rel') || '';
            if (rel.indexOf('noopener') === -1) a.setAttribute('rel', (rel ? rel + ' ' : '') + 'noopener noreferrer');
        });
    }

    function initLazyImages() {
        Array.prototype.forEach.call(doc.querySelectorAll('img:not([loading])'), function (img) {
            img.setAttribute('loading', 'lazy');
            img.setAttribute('decoding', 'async');
        });
    }

    /* ==========================================================
     * 8. 文章图片灯箱：点击放大
     * ========================================================== */
    var lightbox = null;

    function initLightbox() {
        var imgs = doc.querySelectorAll('.post-content img, .article-content img');
        Array.prototype.forEach.call(imgs, function (img) {
            if (img.getAttribute('data-lightbox-bound')) return;
            img.setAttribute('data-lightbox-bound', '1');
            // 让点击行为可被发现：鼠标手型 + 轻微放大反馈交给 CSS
            img.classList.add('zoomable');
            img.title = (img.title || '') + (LANG === 'en' ? 'Click to enlarge' : '点击放大');
            img.setAttribute('role', 'button');
            img.setAttribute('tabindex', '0');
            img.setAttribute('aria-label', TEXT.expand + '：' + (img.alt || ''));
            function open(e) {
                e.preventDefault();
                showLightbox(img);
            }
            on(img, 'click', open);
            on(img, 'keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') open(e);
            });
        });
    }

    function showLightbox(img) {
        if (!lightbox) {
            lightbox = doc.createElement('div');
            lightbox.className = 'lightbox';
            lightbox.setAttribute('role', 'dialog');
            lightbox.setAttribute('aria-modal', 'true');
            lightbox.innerHTML = '<button type="button" class="lightbox-close" aria-label="' +
                TEXT.close + '">&#10005;</button><img alt="">';
            doc.body.appendChild(lightbox);

            on(lightbox, 'click', function (e) {
                if (e.target === lightbox || e.target.classList.contains('lightbox-close')) hideLightbox();
            });
            on(doc, 'keydown', function (e) {
                if (e.key === 'Escape' && lightbox.classList.contains('is-open')) hideLightbox();
            });
        }

        var big = lightbox.querySelector('img');
        big.src = img.currentSrc || img.src;
        big.alt = img.alt || '';
        lightbox.classList.add('is-open');
        doc.body.style.overflow = 'hidden';
        var closeBtn = lightbox.querySelector('.lightbox-close');
        if (closeBtn) closeBtn.focus();
    }

    function hideLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('is-open');
        doc.body.style.overflow = '';
    }
})();
