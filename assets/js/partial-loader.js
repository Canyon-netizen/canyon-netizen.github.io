// ========================================
// 公共 HTML 片段加载器
// ========================================
// 扫描所有 <template data-include="...">，fetch 对应 partials/*.html，
// 替换占位符与路径前缀，注入到原位置。最后设置页面 title / meta。
// 完成后派发 'partials:loaded' 事件，main.js 监听后初始化。
(function () {
    'use strict';

    const tpls = document.querySelectorAll('template[data-include]');
    if (!tpls.length) {
        document.dispatchEvent(new CustomEvent('partials:loaded'));
        return;
    }

    // 防止 FOUC：partials 注入前隐藏 body
    (function injectFoucGuard() {
        const css = 'html.partials-loading body{visibility:hidden;}';
        const style = document.createElement('style');
        style.setAttribute('data-partial-loader', 'fouc-guard');
        style.textContent = css;
        document.head.appendChild(style);
    })();
    document.documentElement.classList.add('partials-loading');

    const meta = window.__PAGE_META__ || {};
    const basePath = meta.basePath || '';
    const baseNav = basePath; // nav 链接走同一前缀
    // baseLang：英文页面 'en/'，中文页面 ''
    // 用于让英文页面的 nav 跳到 en/ 对应页
    const baseLang = meta.baseLang || '';

    // 自动计算中文/英文版本 URL（基于 location.pathname）
    // - 中文页 pathname: /cv.html → zh='.', en='en/'
    // - 英文页 pathname: /en/cv.html → zh='../', en='./'
    const isEnPage = location.pathname.indexOf('/en/') !== -1 || location.pathname.endsWith('/en/');
    const isInBlog = location.pathname.indexOf('/blog/') !== -1;
    const sameName = location.pathname.replace(/^.*\//, '') || 'index.html';
    if (meta.langZhHref === undefined || meta.langZhHref === '') {
        meta.langZhHref = isEnPage ? '../' + sameName : sameName;
    }
    if (meta.langEnHref === undefined || meta.langEnHref === '') {
        // 博客内嵌页没有英文版，兑底到 en/blog.html
        if (isInBlog) {
            meta.langEnHref = isEnPage ? 'blog.html' : 'en/blog.html';
        } else {
            meta.langEnHref = isEnPage ? sameName : 'en/' + sameName;
        }
    }

    // 计算条件性占位符（在普通变量替换前处理）
    // 默认 showLastUpdated=true（meta 缺省时显示「最后更新」行）
    if (meta.showLastUpdated === undefined) meta.showLastUpdated = true;
    // 当前语言（用于 lang toggle 高亮）
    derived.activeLangZh = isEnPage ? '' : ' active';
    derived.activeLangEn = isEnPage ? ' active' : '';

    function replaceAll(str, find, replacement) {
        return str.split(find).join(replacement);
    }

    function applyPlaceholders(html) {
        // 路径占位
        html = replaceAll(html, '__BASE__', basePath);
        html = replaceAll(html, '__BASE_NAV__', baseNav);
        html = replaceAll(html, '__BASE_LANG__', baseLang);
        // 派生占位（条件渲染等）
        Object.keys(derived).forEach(function (k) {
            html = replaceAll(html, '{{' + k + '}}', derived[k]);
        });
        // 变量占位
        Object.keys(meta).forEach(function (k) {
            const v = String(meta[k] == null ? '' : meta[k]);
            html = replaceAll(html, '{{' + k + '}}', v);
        });
        return html;
    }

    function loadOne(tpl) {
        const name = tpl.dataset.include;
        const url = basePath + 'partials/' + name + '.html';
        return fetch(url, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('partial ' + name + ' HTTP ' + r.status);
                return r.text();
            })
            .then(function (text) {
                const html = applyPlaceholders(text);
                const frag = document.createRange().createContextualFragment(html);
                tpl.parentNode.insertBefore(frag, tpl);
                tpl.remove();
            });
    }

    Promise.all(Array.prototype.map.call(tpls, loadOne))
        .then(function () {
            // 设置 title / meta / canonical
            if (meta.title) document.title = meta.title;
            setMeta('description', meta.description);
            setMetaProp('og:title', meta.ogTitle);
            setMetaProp('og:description', meta.ogDescription);
            if (meta.ogType) setMetaProp('og:type', meta.ogType);
            if (meta.ogUrl) setMetaProp('og:url', meta.ogUrl);
            setLink('canonical', meta.canonical);

            // 移除 FOUC 防护
            document.documentElement.classList.remove('partials-loading');

            // 通知 main.js 启动
            document.dispatchEvent(new CustomEvent('partials:loaded'));
        })
        .catch(function (err) {
            console.error('[partial-loader] 加载失败：', err);
            document.documentElement.classList.remove('partials-loading');
            document.dispatchEvent(new CustomEvent('partials:loaded', { detail: { error: true } }));
        });

    function setMeta(name, value) {
        if (!value) return;
        let el = document.querySelector('meta[name="' + name + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('name', name);
            document.head.appendChild(el);
        }
        el.setAttribute('content', value);
    }

    function setMetaProp(prop, value) {
        if (!value) return;
        let el = document.querySelector('meta[property="' + prop + '"]');
        if (!el) {
            el = document.createElement('meta');
            el.setAttribute('property', prop);
            document.head.appendChild(el);
        }
        el.setAttribute('content', value);
    }

    function setLink(rel, href) {
        if (!href) return;
        let el = document.querySelector('link[rel="' + rel + '"]');
        if (!el) {
            el = document.createElement('link');
            el.setAttribute('rel', rel);
            document.head.appendChild(el);
        }
        el.setAttribute('href', href);
    }
})();
