// ========================================
// 移动端导航切换
// ========================================
(function () {
    'use strict';

    const navToggle = document.getElementById('nav-toggle');
    const siteNav = document.getElementById('site-nav');

    if (navToggle && siteNav) {
        navToggle.addEventListener('click', function () {
            siteNav.classList.toggle('open');
        });

        siteNav.addEventListener('click', function (e) {
            if (e.target.classList.contains('nav-link') && siteNav.classList.contains('open')) {
                siteNav.classList.remove('open');
            }
        });
    }
})();

// ========================================
// 平滑滚动到锚点
// ========================================
(function () {
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            const targetId = this.getAttribute('href');
            if (targetId === '#' || targetId.length < 2) return;
            const target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
})();

// ========================================
// 顶部导航栏滚动样式
// ========================================
(function () {
    const header = document.querySelector('.site-header');
    if (!header) return;

    function onScroll() {
        if (window.scrollY > 8) {
            header.style.boxShadow = '0 1px 8px var(--color-shadow)';
        } else {
            header.style.boxShadow = 'none';
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

// ========================================
// 主题切换（明/暗）
// ========================================
(function () {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const STORAGE_KEY = 'site-theme';

    function getStored() {
        try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
    }

    function setStored(value) {
        try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
    }

    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        themeToggle.setAttribute('aria-label',
            theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
        themeToggle.setAttribute('title',
            theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
    }

    // 初始化：localStorage > 浏览器偏好 > light
    const stored = getStored();
    if (stored === 'dark' || stored === 'light') {
        applyTheme(stored);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }

    themeToggle.addEventListener('click', function () {
        const next = currentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        setStored(next);
    });

    // 跟随系统主题变化（仅在用户未显式设置时）
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener('change', function (e) {
            if (!getStored()) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }
})();

// ========================================
// 滚动渐入动画
// ========================================
(function () {
    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('.reveal').forEach(function (el) {
            el.classList.add('is-visible');
        });
        return;
    }

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal').forEach(function (el) {
        observer.observe(el);
    });
})();

// ========================================
// 回到顶部按钮
// ========================================
(function () {
    // 创建按钮
    const btn = document.createElement('button');
    btn.className = 'back-to-top';
    btn.setAttribute('aria-label', '回到顶部');
    btn.title = '回到顶部';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
    document.body.appendChild(btn);

    btn.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    function onScroll() {
        if (window.scrollY > 400) {
            btn.classList.add('show');
        } else {
            btn.classList.remove('show');
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();

// ========================================
// 博客分类过滤
// ========================================
(function () {
    const filterBar = document.getElementById('filter-bar');
    if (!filterBar) return;

    const buttons = filterBar.querySelectorAll('.filter-btn');
    const items = document.querySelectorAll('.post-item[data-category]');

    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            buttons.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');

            const cat = btn.getAttribute('data-filter');
            items.forEach(function (item) {
                if (cat === 'all' || item.getAttribute('data-category') === cat) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    });
})();

// ========================================
// 自动更新"最后更新"日期
// ========================================
(function () {
    document.querySelectorAll('#last-updated').forEach(function (el) {
        el.textContent = new Date().toISOString().slice(0, 7).replace('-', '.');
    });
})();

// ========================================
// 注册 Service Worker（PWA + 离线访问）
// ========================================
(function () {
    if (!('serviceWorker' in navigator)) return;
    // 仅在 https 或 localhost 下生效（GitHub Pages 默认 https）
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;

    window.addEventListener('load', function () {
        navigator.serviceWorker.register('/sw.js').catch(function (err) {
            console.warn('Service Worker 注册失败：', err);
        });
    });
})();

// ========================================
// 博客文章自动生成目录（TOC）
// ========================================
(function () {
    const tocContainer = document.getElementById('toc');
    if (!tocContainer) return;

    const article = document.querySelector('.post-content');
    if (!article) return;

    const headings = article.querySelectorAll('h2, h3');
    if (headings.length < 2) {
        tocContainer.style.display = 'none';
        return;
    }

    headings.forEach(function (h, i) {
        if (!h.id) {
            const text = h.textContent.trim();
            const slug = text.toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^一-龥a-z0-9\-]/g, '')
                .substring(0, 50);
            h.id = slug || 'section-' + i;
        }
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
})();

// ========================================
// 全站搜索（Fuse.js 模糊匹配）
// ========================================
(function () {
    const trigger = document.getElementById('search-trigger');
    const overlay = document.getElementById('search-overlay');
    const input = document.getElementById('search-input');
    const closeBtn = document.getElementById('search-close');
    const results = document.getElementById('search-results');

    if (!trigger || !overlay || !input || !results) return;

    let fuse = null;
    let searchIndexUrl = '/search-index.json';
    // 兼容 blog/ 和 en/ 子目录
    if (location.pathname.includes('/blog/')) {
        searchIndexUrl = '../search-index.json';
    } else if (location.pathname.includes('/en/')) {
        searchIndexUrl = '../search-index.json';
    }

    function open() {
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        setTimeout(function () { input.focus(); }, 50);
        loadIndex();
    }

    function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        input.value = '';
        results.innerHTML = '<div class="search-empty">输入关键词搜索</div>';
    }

    function loadIndex() {
        if (fuse) return;
        fetch(searchIndexUrl)
            .then(function (r) { return r.json(); })
            .then(function (data) {
                fuse = new Fuse(data, {
                    keys: ['title', 'excerpt'],
                    threshold: 0.4,
                    includeMatches: true,
                    minMatchCharLength: 1
                });
                render('');
            })
            .catch(function () {
                results.innerHTML = '<div class="search-empty">⚠ 搜索索引加载失败</div>';
            });
    }

    function escapeHtml(s) {
        return s.replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function highlight(text, query) {
        if (!query) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const safeQ = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return escaped.replace(new RegExp(safeQ, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
    }

    function render(query) {
        if (!fuse) return;
        const items = query ? fuse.search(query).slice(0, 10) : [];
        if (!query) {
            results.innerHTML = '<div class="search-empty">输入关键词搜索</div>';
            return;
        }
        if (!items.length) {
            results.innerHTML = '<div class="search-empty">没有找到与「' + escapeHtml(query) + '」相关的内容</div>';
            return;
        }
        results.innerHTML = items.map(function (item) {
            return '<a class="search-result" href="' + item.item.url + '">' +
                '<div class="search-result-title">' + highlight(item.item.title, query) + '</div>' +
                '<div class="search-result-excerpt">' + highlight(item.item.excerpt, query) + '</div>' +
                '</a>';
        }).join('');
    }

    trigger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close();
    });

    input.addEventListener('input', function () {
        render(this.value.trim());
    });

    document.addEventListener('keydown', function (e) {
        // Ctrl+K / Cmd+K 唤起搜索
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            open();
        }
        // Esc 关闭
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            close();
        }
    });
})();
