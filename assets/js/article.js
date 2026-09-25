/* ============================================================
 * article.js — 博客文章页增强
 * ------------------------------------------------------------
 * 只做「文章壳之外」的东西，正文本身仍是静态 HTML：
 *   - 读取 data.json，找到当前文章在 posts 中的位置
 *   - 渲染上一篇 / 下一篇导航（含标题、日期、分类）
 *   - 复制当前链接（含可选锚点）与「复制引用」
 *   - 键盘 ← / → 在文章间跳转（输入框中不生效）
 *
 * 为什么单独一个文件：文章页是静态 HTML，不加载 page-renderer，
 * 但需要 data.json 里的相邻文章信息。放在这里可以避免把
 * page-renderer 整套拉进文章页。
 * ============================================================ */
(function () {
    'use strict';

    var doc = document;

    var meta = window.__PAGE_META__ || {};
    var isEnglish = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);
    var basePath = meta.basePath || '';

    var T = isEnglish
        ? {
            prev: 'Previous article',
            next: 'Next article',
            share: 'Share',
            copyLink: 'Copy link',
            copied: 'Link copied',
            copyCitation: 'Copy citation',
            citationCopied: 'Citation copied',
            hint: 'Tip: use ← / → to move between articles',
            readTimeSuffix: ''
        }
        : {
            prev: '上一篇',
            next: '下一篇',
            share: '分享',
            copyLink: '复制链接',
            copied: '链接已复制',
            copyCitation: '复制引用',
            citationCopied: '引用已复制',
            hint: '提示：按 ← / → 可在文章间切换',
            readTimeSuffix: ''
        };

    function currentFileName() {
        var name = location.pathname.split('/').pop();
        return name || 'index.html';
    }

    // 当前文章在「文章列表」里的文件名（blog/<file> 或 en/blog/<file>）
    function currentPostKey() {
        return currentFileName();
    }

    function normalize(href) {
        if (!href) return '';
        return String(href).split('#')[0].replace(/^.*\//, '');
    }

    function init() {
        if (!doc.querySelector('.article-shell')) return;

        fetch(basePath + 'data.json', { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                var posts = (data.posts || []).filter(function (p) { return p.published !== false; });
                var here = currentFileName();
                var index = -1;
                posts.forEach(function (p, i) {
                    if (normalize(p.href) === here) index = i;
                });

                renderNav(posts, index);
                renderShare(data, posts[index]);
                bindKeyboardNav(posts, index);
                fixLangToggle(posts[index]);
                // 自报渲染完成（验证脚本据此确定性等待）
                try { doc.documentElement.dataset.dshRendered = '1'; } catch (e) { /* 忽略 */ }
            })
            .catch(function (err) {
                // 增强失败不影响正文阅读
                if (window.console && console.warn) console.warn('[article] 相邻文章加载失败：', err);
                renderShare(null, null);
                fixLangToggle(null);
                try { doc.documentElement.dataset.dshRendered = '1'; } catch (e) { /* 忽略 */ }
            });
    }

    // 语言切换按钮指向「当前这篇」的另一语言版本。
    // 英文文章位于 /en/blog/ 下，partial-loader 会把 langZhHref 推算成
    // en/blog/blog.html（并不存在），所以这里按文件名为准精确改写。
    function fixLangToggle() {
        var zhLink = doc.querySelector('.nav-lang-zh');
        var enLink = doc.querySelector('.nav-lang-en');
        var here = currentPostKey();
        if (!here) return;

        if (!isEnglish) {
            if (enLink) enLink.setAttribute('href', '../en/blog/' + here);
        } else if (zhLink) {
            zhLink.setAttribute('href', '../../blog/' + here);
        }
    }

    function pick(obj, base) {
        if (!obj) return '';
        if (isEnglish && obj[base + 'En'] != null && obj[base + 'En'] !== '') return obj[base + 'En'];
        return obj[base] != null ? obj[base] : '';
    }

    function linkForPost(post) {
        // href 是站点根相对（blog/xxx.html）；文章页在 blog/ 下，需要 ../ 前缀
        var href = pick(post, 'href') || '#';
        if (/^https?:/.test(href)) return href;
        if (href.indexOf('../') === 0) return href;
        return basePath ? '../' + href : href;
    }

    function renderNav(posts, index) {
        var host = doc.querySelector('[data-article-nav]');
        if (!host || index < 0) return;
        host.innerHTML = '';

        var prev = index > 0 ? posts[index - 1] : null;
        var next = index < posts.length - 1 ? posts[index + 1] : null;

        function card(post, label, dir) {
            if (!post) return null;
            var a = doc.createElement('a');
            a.className = 'article-nav-card article-nav-' + dir;
            a.href = linkForPost(post);
            a.setAttribute('rel', 'prev');
            if (dir === 'next') a.setAttribute('rel', 'next');

            var small = doc.createElement('span');
            small.className = 'article-nav-label';
            small.textContent = (dir === 'prev' ? '← ' : '') + label + (dir === 'next' ? ' →' : '');
            a.appendChild(small);

            var title = doc.createElement('span');
            title.className = 'article-nav-title';
            title.textContent = pick(post, 'title') || '';
            a.appendChild(title);

            var date = doc.createElement('span');
            date.className = 'article-nav-date';
            date.textContent = post.date || '';
            a.appendChild(date);

            return a;
        }

        var p = card(prev, T.prev, 'prev');
        var n = card(next, T.next, 'next');
        if (p) host.appendChild(p);
        if (n) host.appendChild(n);
        if (!p && !n) host.hidden = true;
    }

    function copyText(text, onDone) {
        function fallback() {
            var ta = doc.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
            doc.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
            doc.body.removeChild(ta);
            if (ok) onDone();
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(onDone, fallback);
        } else {
            fallback();
        }
    }

    function renderShare(data, post) {
        var host = doc.querySelector('[data-article-share]');
        if (!host) return;
        host.innerHTML = '';

        var link = location.href;

        function button(label, getText, doneLabel) {
            var btn = doc.createElement('button');
            btn.type = 'button';
            btn.className = 'share-btn';
            btn.textContent = label;
            btn.addEventListener('click', function () {
                copyText(getText(), function () {
                    var old = btn.textContent;
                    btn.textContent = doneLabel;
                    btn.classList.add('is-done');
                    setTimeout(function () {
                        btn.textContent = old;
                        btn.classList.remove('is-done');
                    }, 1800);
                });
            });
            host.appendChild(btn);
        }

        button('🔗 ' + T.copyLink, function () { return location.href; }, '✓ ' + T.copied);

        if (post) {
            button('📄 ' + T.copyCitation, function () {
                var authors = isEnglish ? 'Zhou Rui' : '周睿';
                var date = post.date || '';
                var year = date.slice(0, 4);
                var title = pick(post, 'title') || doc.title;
                return authors + '. "' + title + '". ' + (year ? year + '. ' : '') + location.href;
            }, '✓ ' + T.citationCopied);
        }

        // 分享面板 URL 预填（无弹窗权限时退化为复制）
        if (navigator.share) {
            var nativeBtn = doc.createElement('button');
            nativeBtn.type = 'button';
            nativeBtn.className = 'share-btn';
            nativeBtn.textContent = '↗ ' + T.share;
            nativeBtn.addEventListener('click', function () {
                navigator.share({
                    title: doc.title,
                    url: location.href
                }).catch(function () { /* 用户取消，忽略 */ });
            });
            host.insertBefore(nativeBtn, host.firstChild);
        }

        var hint = doc.querySelector('[data-article-hint]');
        if (hint) hint.textContent = T.hint;
    }

    function bindKeyboardNav(posts, index) {
        if (index < 0) return;
        doc.addEventListener('keydown', function (e) {
            // 不干扰输入、不覆盖弹层
            var tag = (e.target && e.target.tagName) || '';
            if (/INPUT|TEXTAREA|SELECT/.test(tag) || e.target.isContentEditable) return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (doc.getElementById('search-overlay') && doc.getElementById('search-overlay').classList.contains('open')) return;

            if (e.key === 'ArrowLeft' && index > 0) {
                location.href = linkForPost(posts[index - 1]);
            } else if (e.key === 'ArrowRight' && index < posts.length - 1) {
                location.href = linkForPost(posts[index + 1]);
            }
        });
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
