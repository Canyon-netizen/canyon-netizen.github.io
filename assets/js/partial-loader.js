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
    const derived = {};

    // ---- hreflang：把相对路径归一化成「站点根相对」形式 ----
    // /blog/x.html 里的 '../index.html'、en/blog.html 里的 '../about.html' 都要变成 /about.html
    function normalizePath(href) {
        if (!href) return '/';
        let p = String(href).trim();
        p = p.replace(/^(?:\.\/)+/, '');          // ./ 前缀
        while (p.indexOf('../') === 0) p = p.slice(3); // ../ 前缀
        if (p.charAt(0) !== '/') p = '/' + p;
        if (p === '/index.html') p = '/';
        if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
        return p;
    }
    derived.langZhPath = normalizePath(meta.langZhHref);
    derived.langEnPath = normalizePath(meta.langEnHref);

    if (meta.showLastUpdated) {
        // 日期以页面的 meta.lastUpdated 为准（缺省保留静态占位值）；
        // main.js 只在为空时用文档的 Last-Modified 兜底
        derived.lastUpdatedLine = '<p>' + (meta.lastUpdatedLabel || 'Last updated:') +
            ' <span id="last-updated">' + (meta.lastUpdated || '2026.07') + '</span></p>';
    } else {
        derived.lastUpdatedLine = '';
    }
    // 当前语言（用于 lang toggle 高亮）
    derived.activeLangZh = isEnPage ? '' : ' active';
    derived.activeLangEn = isEnPage ? ' active' : '';

    // 兜底补齐缺失的 navActive_xxx：header.html 里的 {{navActive_books}} 等若无人替换，
    // 会以字面量 {{...}} 露在页面上；这里用 meta.navActive（每页都有）推算当前页是否命中。
    const NAV_KEYS = ['index', 'about', 'research', 'publications', 'projects', 'blog', 'talks', 'books', 'hobbies', 'cv'];
    NAV_KEYS.forEach(function (key) {
        const k = 'navActive_' + key;
        if (meta[k] === undefined) {
            meta[k] = meta.navActive === key ? ' active' : '';
        }
    });

    // Logo 方块文字：中文取首字符，英文取首字母大写；brandText 缺失时留空而不是报错
    const brandText = String(meta.brandText == null ? '' : meta.brandText).trim();
    derived.brandMark = '';
    if (brandText) {
        const first = brandText.charAt(0);
        derived.brandMark = /[a-z]/i.test(first) ? first.toUpperCase() : first;
    }

    // 「更多」下拉与二级导航文案（按页面语言分派，避免中英混排）
    derived.navMore = isEnPage ? 'More' : '更多';
    derived.navBooks = isEnPage ? 'Books' : '阅读';
    derived.navHobbies = isEnPage ? 'Hobbies' : '爱好';

    // navActive_xxx(' active') → navActive_xxxClass('active')：
    // 同一份 meta 既能拼 class="nav-link active"，也能只取 class 名，无需逐页配置
    Object.keys(meta).forEach(function (k) {
        if (k.indexOf('navActive_') !== 0 || /Class$/.test(k)) return;
        derived[k + 'Class'] = String(meta[k] == null ? '' : meta[k]).indexOf('active') !== -1 ? 'active' : '';
    });

    function replaceAll(str, find, replacement) {
        return str.split(find).join(replacement);
    }

    function applyPlaceholders(html) {
        // 路径占位
        html = replaceAll(html, '__BASE__', basePath);
        html = replaceAll(html, '__BASE_NAV__', baseNav);
        html = replaceAll(html, '__BASE_LANG__', baseLang);

        // 占位符取值：页面 meta 里的显式配置优先，partial-loader 计算出的值只做兜底。
        // 为什么：en 页面的 meta 显式写了 brandMark（"ZR"）与 navActive_*Class，
        // 若先替换派生值就会被计算值（首字母 "Z" / "active"）悄悄覆盖，页面配置失效。
        const values = {};
        Object.keys(derived).forEach(function (k) { values[k] = derived[k]; });
        Object.keys(meta).forEach(function (k) { values[k] = meta[k]; });
        Object.keys(values).forEach(function (k) {
            const v = String(values[k] == null ? '' : values[k]);
            html = replaceAll(html, '{{' + k + '}}', v);
        });

        // 兜底：清掉仍然没被替换的占位符，避免页面上直接出现 {{xxx}} 字面量
        // （例如某个页面 meta 忘了配 navBooks，导致导航里露出模板变量）
        html = html.replace(/\{\{[A-Za-z0-9_]+\}\}/g, '');
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

    // 收尾只允许执行一次：正常路径、失败路径与看门狗可能竞争，
    // 重复派发 partials:loaded 会让 main.js 初始化两遍（重复绑定与重复建节点）
    let settled = false;
    function finish(detail) {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        document.documentElement.classList.remove('partials-loading');
        document.dispatchEvent(new CustomEvent('partials:loaded', detail ? { detail: detail } : undefined));
    }

    // 看门狗：partials 请求被网络挂起时，既不能让 body 一直隐藏（白屏），
    // 也不能让 main.js 永远等不到 partials:loaded（整站交互失效）
    const watchdog = setTimeout(function () {
        console.warn('[partial-loader] partials 加载超时，先恢复显示并继续初始化');
        finish({ error: true, timeout: true });
    }, 6000);

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

            // hreflang 必须是绝对 URL，所以在这里用站点源 + 归一化路径补全
            // （head-base 里写的是 {{langZhPath}} / {{langEnPath}} 占位）
            absolutizeAlternates();

            // 填入 JSON-LD：让搜索引擎与社交平台知道这是谁的主页、这篇文章是什么
            injectStructuredData();

            // 移除 FOUC 防护并通知 main.js 启动
            finish(null);
        })
        .catch(function (err) {
            console.error('[partial-loader] 加载失败：', err);
            finish({ error: true });
        });

    // ---------- 结构化数据（JSON-LD） ----------
    // 站点主人信息与 data.json 的 personal 保持一致；改资料时两处一起改。
    // 用常量而不是再拉一次 data.json：head 里的 meta 不能等第二个请求。
    const PROFILE = {
        name: '周睿',
        nameEn: 'Zhou Rui',
        email: '3220102194@zju.edu.cn',
        github: 'https://github.com/canyon-netizen',
        affiliation: '浙江大学计算机科学与技术学院',
        affiliationEn: 'College of Computer Science and Technology, Zhejiang University',
        jobTitle: '博士研究生',
        jobTitleEn: 'Ph.D. Student',
        knowsAbout: ['机器学习', '自然语言处理', '大语言模型'],
        knowsAboutEn: ['Machine Learning', 'Natural Language Processing', 'Large Language Models']
    };

    function siteOrigin() {
        return (location.origin && location.origin !== 'null')
            ? location.origin
            : 'https://canyon-netizen.github.io';
    }

    function absUrl(path) {
        if (!path) return '';
        // 已经是绝对地址就原样返回（canonical 通常是 https://… 完整地址）
        if (/^https?:/i.test(path)) return path;
        // 防御：路径里可能混进协议头（早期版本出现过 https:/host 这种单斜杠写法）
        if (/^https?:\//i.test(path)) return path.replace(/^(https?):\/+/, '$1://');
        return siteOrigin() + (path.charAt(0) === '/' ? path : '/' + path);
    }

    function injectStructuredData() {
        const lang = isEnPage ? 'en' : 'zh';
        // canonical 是绝对地址；只有在缺省时才退化为「站点源 + 归一化路径」
        const url = absUrl(meta.canonical || location.pathname);
        const image = absUrl('assets/images/og-image.png');

        const person = {
            '@type': 'Person',
            '@id': siteOrigin() + '/#person',
            name: lang === 'en' ? PROFILE.nameEn : PROFILE.name,
            alternateName: lang === 'en' ? PROFILE.name : PROFILE.nameEn,
            email: 'mailto:' + PROFILE.email,
            url: url,
            image: image,
            jobTitle: lang === 'en' ? PROFILE.jobTitleEn : PROFILE.jobTitle,
            affiliation: {
                '@type': 'CollegeOrUniversity',
                name: lang === 'en' ? PROFILE.affiliationEn : PROFILE.affiliation
            },
            sameAs: [PROFILE.github],
            knowsAbout: lang === 'en' ? PROFILE.knowsAboutEn : PROFILE.knowsAbout
        };

        const site = {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': siteOrigin() + '/#website',
            name: meta.brandText || PROFILE.name,
            url: siteOrigin() + '/',
            inLanguage: meta.htmlLang || 'zh-CN',
            publisher: { '@id': siteOrigin() + '/#person' }
        };

        // 首页：用 ProfilePage 把「这是谁」讲清楚
        const isHome = !!document.querySelector('[data-section="personal-hero"]');
        let page = null;

        if (isHome) {
            page = {
                '@context': 'https://schema.org',
                '@type': 'ProfilePage',
                url: url,
                inLanguage: meta.htmlLang || 'zh-CN',
                mainEntity: person,
                isPartOf: { '@id': siteOrigin() + '/#website' }
            };
        }

        // 面包屑里的相对链接（'../blog.html'）不能直接按当前文档解析 —— 文章在 /blog/ 下，
        // '../blog.html' 会算成 /blog/blog.html。先削掉前导 ../ 变成站点根相对，再补站点源。
        function resolveHref(href) {
            if (!href) return '';
            const clean = String(href).replace(/^(?:\.\.?\/)+/, '').replace(/^\//, '');
            return absUrl('/' + clean);
        }

        // 博客文章：BlogPosting + 面包屑
        const postHeader = document.querySelector('.post-header, .article-header');
        if (postHeader) {
            const h1 = postHeader.querySelector('h1');
            const time = postHeader.querySelector('time');
            const headline = h1 ? h1.textContent.trim() : (meta.title || document.title);
            const datePublished = time ? time.textContent.trim() : '';
            const blog = document.querySelector('.post-content, .article-content');
            const excerptEl = postHeader.querySelector('.post-excerpt');
            page = {
                '@context': 'https://schema.org',
                '@type': 'BlogPosting',
                headline: headline,
                description: excerptEl ? excerptEl.textContent.trim() : (meta.description || ''),
                url: url,
                mainEntityOfPage: { '@type': 'WebPage', '@id': url },
                inLanguage: meta.htmlLang || 'zh-CN',
                image: image,
                author: { '@id': siteOrigin() + '/#person' },
                publisher: { '@id': siteOrigin() + '/#person' },
                isPartOf: { '@id': siteOrigin() + '/#website' },
                wordCount: blog ? blog.textContent.replace(/\s+/g, '').length : undefined
            };
            if (datePublished) page.datePublished = datePublished.replace(/\./g, '-');

            const crumbs = document.querySelector('.breadcrumb');
            if (crumbs) {
                const items = [];
                crumbs.querySelectorAll('a').forEach(function (a, i) {
                    items.push({
                        '@type': 'ListItem',
                        position: i + 1,
                        name: a.textContent.trim(),
                        item: resolveHref(a.getAttribute('href'))
                    });
                });
                const last = crumbs.querySelector('span:last-child');
                if (last && last.textContent.trim()) {
                    items.push({ '@type': 'ListItem', position: items.length + 1, name: last.textContent.trim() });
                }
                if (items.length) {
                    page.breadcrumb = {
                        '@type': 'BreadcrumbList',
                        itemListElement: items
                    };
                }
            }
        }

        // 其它页面：用 WebPage 声明所属站点与语言，避免「无结构化数据」
        if (!page) {
            page = {
                '@context': 'https://schema.org',
                '@type': 'WebPage',
                url: url,
                name: meta.title || document.title,
                description: meta.description || '',
                inLanguage: meta.htmlLang || 'zh-CN',
                isPartOf: { '@id': siteOrigin() + '/#website' },
                about: { '@id': siteOrigin() + '/#person' }
            };
        }

        writeLdJson('site', site);
        writeLdJson('page', page);
    }

    function writeLdJson(slot, data) {
        const el = document.querySelector('script[data-ldjson="' + slot + '"]');
        if (!el) return;
        try {
            el.textContent = JSON.stringify(data);
        } catch (e) {
            console.warn('[partial-loader] JSON-LD 序列化失败：', e);
        }
    }

    // 把 <link rel="alternate" hreflang> 的相对 href 变成绝对 URL；
    // og:image / twitter:image 若仍是相对路径也一并补全。
    function absolutizeAlternates() {
        const origin = location.origin && location.origin !== 'null'
            ? location.origin
            : 'https://canyon-netizen.github.io';

        document.querySelectorAll('link[rel="alternate"][hreflang][href]').forEach(function (el) {
            const href = el.getAttribute('href');
            if (!href || /^https?:/i.test(href)) return;
            el.setAttribute('href', origin + (href.charAt(0) === '/' ? href : '/' + href));
        });

        document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(function (el) {
            const url = el.getAttribute('content');
            if (!url || /^https?:/i.test(url)) return;
            el.setAttribute('content', origin + (url.charAt(0) === '/' ? url : '/' + url));
        });
    }

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
