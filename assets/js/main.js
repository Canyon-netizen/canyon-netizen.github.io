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
