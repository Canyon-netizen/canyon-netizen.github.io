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

        // 点击导航链接后自动关闭移动端菜单
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
// 滚动时导航栏样式微调
// ========================================
(function () {
    const header = document.querySelector('.site-header');
    if (!header) return;

    function onScroll() {
        if (window.scrollY > 8) {
            header.style.boxShadow = '0 1px 8px rgba(0, 0, 0, 0.06)';
        } else {
            header.style.boxShadow = 'none';
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
