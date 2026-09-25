// ========================================
// 全站页面渲染器：从 data.json 读取并填充 main 里的 [data-section] 区块
// 双语约定（与 en-pages 的字段约定一致）：
//   - 单字段：英文页优先 obj[base + 'En']，缺失时回退 obj[base]
//   - 整块英文化：overview/overviewEn、heroCtas/heroCtasEn、contacts/contactsEn
//     先整块覆盖再按字段取词，避免半中半英
// 事件契约：监听 partials:loaded 后开始渲染，渲染完成派发 page:rendered
// ========================================
(function () {
    'use strict';

    const mainRoot = document.getElementById('page-content');
    if (!mainRoot) return;

    let IS_EN = false; // 英文页：meta.htmlLang 优先，其次看 /en/ 路径
    let BASE = '';     // meta.basePath：把站点根相对路径（assets/…、blog/…）补成当前页可用路径
    let T = null;      // 当前语言的 UI 文案

    // UI 文案：所有标签/连接词都按语言分派，英文页不出现中文标签
    const TEXT_ZH = {
        keyTechniques: '关键技术：',
        relatedWork: '代表性工作：',
        relatedPubLink: '查看相关论文',
        advisorPrefix: '导师：',
        avatarAlt: '的头像',
        listSep: '、',
        inlineSep: '　',
        citySep: '，',
        awardYear: ' 年',
        others: '其他',
        undated: '未标注年份',
        chartAlt: 'GitHub 贡献图',
        emptyState: '内容整理中，敬请期待。',
        talksEmpty: '暂时还没有公开的分享记录，正在整理中。',
        seeAllProjects: '查看全部项目 →',
        featuredProjectsTitle: '精选项目',
        pubsEmptyTitle: '暂时还没有公开论文',
        pubsEmptyBody: '论文发表后会在这里按年份列出，并附 PDF / 代码链接。在那之前，先看看我正在关注的方向。',
        currentlyLookingAt: '目前关注的方向',
        starsTitle: 'GitHub star 数',
        languageTitle: '仓库主语言',
        licenseTitle: '开源许可证',
        archived: '已归档',
        updatedPrefix: '最近更新：',
        pushedAtTitle: '最后一次提交：',
        daysAgo: function (n) { return n <= 0 ? '今天' : n + ' 天前'; },
        monthsAgo: function (n) { return n + ' 个月前'; },
        yearsAgo: function (n) { return n + ' 年前'; },
        repoSourceNote: function (date) {
            return '仓库信息（star 数、主语言、许可证、最近更新时间）来自 GitHub 公开 API，抓取于 ' + date + '。';
        }
    };
    const TEXT_EN = {
        keyTechniques: 'Key techniques: ',
        relatedWork: 'Representative work: ',
        relatedPubLink: 'View related publications',
        advisorPrefix: 'Advisor: ',
        avatarAlt: ' avatar',
        listSep: ', ',
        inlineSep: ' · ',
        citySep: ', ',
        awardYear: '',
        others: 'Others',
        undated: 'Undated',
        chartAlt: 'GitHub contributions',
        emptyState: 'Nothing here yet — content coming soon.',
        talksEmpty: 'No public talks yet — this list is being put together.',
        seeAllProjects: 'All projects →',
        featuredProjectsTitle: 'Selected Projects',
        pubsEmptyTitle: 'No publications to list yet',
        pubsEmptyBody: 'Once papers are out they will be listed here by year with PDF and code links. Until then, here is what I am currently working on.',
        currentlyLookingAt: 'Currently exploring',
        starsTitle: 'GitHub stars',
        languageTitle: 'Primary language',
        licenseTitle: 'License',
        archived: 'Archived',
        updatedPrefix: 'Updated ',
        pushedAtTitle: 'Last commit: ',
        daysAgo: function (n) { return n <= 0 ? 'today' : n + ' days ago'; },
        monthsAgo: function (n) { return n === 1 ? '1 month ago' : n + ' months ago'; },
        yearsAgo: function (n) { return n === 1 ? '1 year ago' : n + ' years ago'; },
        repoSourceNote: function (date) {
            return 'Repository facts (stars, primary language, license, last update) come from the public GitHub API, fetched on ' + date + '.';
        }
    };

    // 文案对象在 init() 里按语言选定（见 let T）；I18N 是渲染器里使用的别名
    let I18N = TEXT_ZH;

    const SECTION_TEXT_PREFIX = {
        'stats': 'stat',
        'overview': 'overview',
        'news': 'news',
        'featured-publications': 'pubs',
        'latest-posts': 'posts',
        'featured-projects': 'projects'
    };

    // partials 注入完成后渲染；若本脚本下载较慢、partials:loaded 已经派发过
    // （页面无 template 或注入已完成），就直接初始化，避免整页空白
    if (document.querySelector('template[data-include]')) {
        document.addEventListener('partials:loaded', init);
    } else {
        init();
    }

    function init() {
        const meta = window.__PAGE_META__ || {};
        BASE = meta.basePath || '';
        IS_EN = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);
        T = IS_EN ? TEXT_EN : TEXT_ZH;
        I18N = T;

        const inline = readInlineData();
        if (inline) {
            // 内联数据：同步渲染，内容在首次绘制就存在（不产生布局抖动）
            renderPage(mainRoot, inline);
            return;
        }

        fetch(BASE + 'data.json', { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) { renderPage(mainRoot, data); })
            .catch(handleError);
    }

    // 页面内的 <script type="application/json" data-page-data> 由
    // tools/inline-page-data.py 在构建时写入；缺失时返回 null 走 fetch 兜底。
    function readInlineData() {
        const el = document.querySelector('script[type="application/json"][data-page-data]');
        if (!el) return null;
        try {
            const parsed = JSON.parse(el.textContent);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            if (window.console && console.warn) console.warn('[page] 内联数据解析失败，回退到 fetch：', e);
            return null;
        }
    }

    function renderPage(root, data) {
        // root 自身也可能带 data-section（404.html 的 #page-content 就是如此），
        // 而 querySelectorAll 不含自身 —— 旧实现因此完全没渲染 404 页内容
        const sections = [];
        if (root.getAttribute && root.getAttribute('data-section')) sections.push(root);
        root.querySelectorAll('[data-section]').forEach(function (sec) { sections.push(sec); });

        sections.forEach(function (sec) {
            const name = sec.getAttribute('data-section');
            const renderer = RENDERERS[name];
            if (!renderer) {
                console.warn('[page-renderer] 未知 section:', name);
                return;
            }
            fillSectionText(sec, data, name);
            // 单个区块渲染失败不应该让后面的区块一起停摆（例如变量名冲突导致的
            // ReferenceError 曾让首页「精选项目」整块空白且没有明显报错）
            try {
                renderer(sec, data);
            } catch (err) {
                console.error('[page-renderer] 渲染 section 失败：' + name, err);
                sec.classList.add('has-error');
            }
        });
        renderOrphanSections(root, data);
        // 自报渲染完成：验证脚本据此确定性地等待，而不是猜时间
        try { document.documentElement.dataset.dshRendered = '1'; } catch (e) { /* 忽略 */ }
        document.dispatchEvent(new CustomEvent('page:rendered'));
    }

    // ============== Section 渲染器 ==============
    // 每个 renderer 接收 (container, data)，把内容写进 container

    // ---- personal-hero：index.html 顶部 hero ----
    const renderPersonalHero = function (sec, data) {
        const p = data.personal || {};
        setText(sec, '[data-hero-eyebrow]', pick(p, 'heroEyebrow'));
        setText(sec, '[data-hero-name]', pick(p, 'name'));
        setText(sec, '[data-hero-subtitle]', pick(p, 'heroSubtitle'));

        // CTA 里的 research.html / cv.html 是「页面相对链接」，
        // 英文页天然解析到 en/ 下同名页，因此不做站点根拼接
        const ctaList = findIn(sec, '[data-hero-ctas]');
        if (ctaList) {
            ctaList.innerHTML = '';
            localized(data, 'heroCtas').forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'btn btn-' + (c.variant || 'primary');
                a.textContent = pick(c, 'label');
                ctaList.appendChild(a);
            });
        }

        const contacts = findIn(sec, '[data-hero-contacts]');
        if (contacts) {
            contacts.innerHTML = '';
            localized(data, 'contacts').forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'meta-item';
                if (c.external) {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener');
                }
                const icon = c.icon ? c.icon + ' ' : '';
                a.textContent = icon + pick(c, 'label');
                contacts.appendChild(a);
            });
        }

        const avatar = findIn(sec, '[data-hero-avatar]');
        if (avatar && p.avatar) {
            avatar.src = sitePath(p.avatar);
            avatar.alt = pick(p, 'name') + T.avatarAlt;
        }
    };

    // ---- stats：index 数据一览 ----
    const renderStats = function (sec, data) {
        const stats = data.stats || {};

        // 数字卡片：data.json 里删掉某项（如 githubStars）时同步移除卡片，
        // 否则会留下只有图标没有数字的空卡片
        ['posts', 'publications', 'githubStars'].forEach(function (k) {
            const card = findIn(sec, '[data-stat="' + k + '"]');
            if (!card) return;
            const item = stats[k];
            if (!item) {
                removeNode(card);
                return;
            }
            setText(card, '[data-stat-label]', pick(item, 'label'));
            setText(card, '[data-stat-value]', item.value);
            setText(card, '[data-stat-icon]', item.icon);
            // note 是「这个数字怎么来的」的说明（例如公开仓库总数 vs 站内精选数），
            // 用 title + aria-label 暴露，避免读者以为首页数字和项目页条目数对不上
            const note = pick(item, 'note');
            if (note) {
                card.setAttribute('title', note);
                card.setAttribute('aria-label', pick(item, 'label') + ' ' + item.value + '：' + note);
            }
        });

        // 访客数（可选第三方 badge）：服务下线或缺少地址时整卡移除，避免破图
        const visitors = findIn(sec, '[data-stat="visitors"]');
        if (visitors) {
            const v = stats.visitors;
            if (!v || !v.badgeUrl) {
                removeNode(visitors);
            } else {
                setText(visitors, '[data-stat-label]', pick(v, 'label'));
                setText(visitors, '[data-stat-icon]', v.icon);
                const img = visitors.querySelector('img');
                if (img) {
                    img.src = v.badgeUrl;
                    img.addEventListener('error', function () { removeNode(visitors); });
                }
            }
        }

        // GitHub 贡献图：第三方服务经常挂掉，图挂了就隐藏整块（只留说明文字没有意义）
        const chart = findIn(sec, '[data-contributions-chart]');
        const chartCfg = stats.contributionsChart;
        if (chart && chartCfg) {
            chart.src = 'https://ghchart.rshah.org/' + chartCfg.theme + '/' + chartCfg.username;
            chart.alt = T.chartAlt;
            chart.addEventListener('error', function () { hideChart(chart); });
        } else if (chart) {
            hideChart(chart);
        }

        const caption = findIn(sec, '[data-contributions-caption]');
        if (caption) {
            const text = chartCfg ? pick(chartCfg, 'caption') : '';
            caption.textContent = text || '';
            if (!chartCfg) caption.hidden = true;
        }

        // 所有统计卡片都被移除后，整个区块只剩标题 → 隐藏
        if (!findIn(sec, '[data-stat]')) hideSection(sec);
    };

    // ---- overview：index 个人概览 ----
    const renderOverview = function (sec, data) {
        const ov = localized(data, 'overview') || {};

        const eduList = findIn(sec, '[data-overview-education]');
        const education = ov.education || [];
        if (eduList) {
            eduList.innerHTML = '';
            education.forEach(function (e) {
                const parts = [pick(e, 'period'), pick(e, 'school'), pick(e, 'major'), pick(e, 'degree')]
                    .filter(function (s) { return !!s; });
                const li = document.createElement('li');
                li.textContent = parts.join(T.inlineSep);
                eduList.appendChild(li);
            });
        }

        const interests = findIn(sec, '[data-overview-interests]');
        if (interests) {
            interests.innerHTML = '';
            pickList(ov, 'interests').forEach(function (text) {
                const li = document.createElement('li');
                li.textContent = text;
                interests.appendChild(li);
            });
        }

        const status = findIn(sec, '[data-overview-status]');
        if (status) {
            const cs = ov.currentStatus || {};
            setText(status, '[data-overview-affiliation]', pick(cs, 'affiliation'));
            setText(status, '[data-overview-advisor]', pick(cs, 'advisor'));
        }

        const loc = findIn(sec, '[data-overview-location]');
        if (loc) {
            const place = ov.location || {};
            const city = [pick(place, 'city'), pick(place, 'country')]
                .filter(function (s) { return !!s; })
                .join(T.citySep);
            setText(loc, '[data-overview-city]', city);
            setText(loc, '[data-overview-note]', pick(place, 'note'));
        }
    };

    // ---- news：index 时间线 ----
    const renderNews = function (sec, data) {
        const list = findIn(sec, '[data-news-list]');
        if (!list) return;
        list.innerHTML = '';
        const news = data.news || [];
        if (!news.length) {
            handleEmpty(sec, list);
            return;
        }
        news.forEach(function (n) {
            const li = document.createElement('li');
            li.className = 'timeline-item';
            const date = document.createElement('span');
            date.className = 'timeline-date';
            date.textContent = pick(n, 'date');
            li.appendChild(date);
            const p = document.createElement('p');
            // data.json 的内容自带少量 <strong> 标记（本站自己的数据源），沿用 innerHTML
            p.innerHTML = pick(n, 'content');
            li.appendChild(p);
            list.appendChild(li);
        });
    };

    // ---- featured-publications：index 代表性论文（也显示摘要） ----
    const renderFeaturedPubs = function (sec, data) {
        const list = findIn(sec, '[data-featured-pubs]');
        if (!list) return;
        list.innerHTML = '';
        const featured = (data.publications || []).filter(function (p) { return p.featured; });
        if (!featured.length) {
            handleEmpty(sec, list);
            return;
        }
        featured.forEach(function (p) {
            list.appendChild(buildPubItem(p, { summary: true }));
        });
    };

    // ---- all-publications：publications 完整列表（按 year / category 分组） ----
    const renderAllPubs = function (sec, data) {
        const pubs = (data.publications || []).slice().sort(function (a, b) {
            // 优先按 year 降序，无 year 的（preprint）放最后
            if (a.year && b.year) return b.year - a.year;
            if (a.year) return -1;
            if (b.year) return 1;
            return 0;
        });

        // 图例（* 通讯作者 / † 共同一作）：没有论文时隐藏，避免「有图例没内容」
        const note = findIn(mainRoot, '[data-pubs-note]');
        if (note) note.hidden = pubs.length === 0;

        sec.innerHTML = '';
        if (!pubs.length) {
            // 结论：宁可展示「正在关注什么」，也不要只留一句「内容整理中」——
            // 访客点进论文页是想了解这个人在做什么，空页是最差的落地体验。
            renderPubsFallback(sec, data);
            return;
        }

        const groups = {};
        const order = [];
        pubs.forEach(function (p) {
            const key = pick(p, 'category') || (p.year ? String(p.year) : T.others);
            if (!groups[key]) {
                groups[key] = [];
                order.push(key);
            }
            groups[key].push(p);
        });

        order.forEach(function (key) {
            const block = document.createElement('section');
            block.className = 'content-block';
            const h2 = document.createElement('h2');
            h2.textContent = key;
            block.appendChild(h2);
            const list = document.createElement('div');
            list.className = 'pub-list-full';
            groups[key].forEach(function (p) { list.appendChild(buildPubItem(p, { full: true })); });
            block.appendChild(list);
            sec.appendChild(block);
        });
    };

    // ---- 论文页空数据兜底：展示研究方向兴趣，避免「只有一句空态」的死页 ----
    function renderPubsFallback(sec, data) {
        sec.classList.add('is-empty');

        const box = document.createElement('div');
        box.className = 'empty-state empty-state-rich';

        const title = document.createElement('p');
        title.className = 'empty-title';
        title.textContent = T.pubsEmptyTitle;
        box.appendChild(title);

        const body = document.createElement('p');
        body.className = 'empty-body';
        body.textContent = T.pubsEmptyBody;
        box.appendChild(body);

        sec.appendChild(box);

        const dirs = data.researchDirections || [];
        if (!dirs.length) return;

        const head = document.createElement('h2');
        head.className = 'fallback-heading';
        head.textContent = T.currentlyLookingAt;
        sec.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'dir-grid';
        dirs.forEach(function (d) {
            const card = document.createElement('article');
            card.className = 'dir-card';

            const icon = document.createElement('span');
            icon.className = 'dir-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = d.icon || '•';
            card.appendChild(icon);

            const h3 = document.createElement('h3');
            h3.className = 'dir-title';
            h3.textContent = pick(d, 'title');
            card.appendChild(h3);

            const desc = document.createElement('p');
            desc.className = 'dir-desc';
            desc.textContent = pick(d, 'description');
            card.appendChild(desc);

            const tech = pickList(d, 'techniques');
            if (tech.length) {
                const tags = document.createElement('div');
                tags.className = 'tags';
                tech.forEach(function (name) {
                    const span = document.createElement('span');
                    span.className = 'tag';
                    span.textContent = name;
                    tags.appendChild(span);
                });
                card.appendChild(tags);
            }

            grid.appendChild(card);
        });
        sec.appendChild(grid);
    }

    // ---- 论文条目 ----
    // opts.full：显示摘要（完整列表）；opts.summary：也显示摘要（首页代表论文）
    function buildPubItem(p, opts) {
        const o = opts || {};
        const item = document.createElement('div');
        item.className = 'pub-item';

        const venue = document.createElement('div');
        venue.className = 'pub-venue';
        venue.textContent = pick(p, 'venue');
        item.appendChild(venue);

        const content = document.createElement('div');
        content.className = 'pub-content';

        const title = document.createElement('div');
        title.className = 'pub-title';
        title.textContent = pick(p, 'title');
        content.appendChild(title);

        const authors = document.createElement('div');
        authors.className = 'pub-authors';
        authors.innerHTML = pickList(p, 'authors').map(authorHtml).join(', ');
        content.appendChild(authors);

        const summary = pick(p, 'summary');
        if (summary && (o.full || o.summary)) {
            const desc = document.createElement('div');
            desc.className = 'pub-desc';
            desc.textContent = summary;
            content.appendChild(desc);
        }

        appendLinks(content, 'pub-links', pickList(p, 'links'), 'pub-link');
        item.appendChild(content);
        return item;
    }

    // ---- research-directions：research 研究方向 ----
    const renderResearchDirs = function (sec, data) {
        sec.innerHTML = '';
        const dirs = data.researchDirections || [];
        if (!dirs.length) {
            handleEmpty(sec, sec);
            return;
        }
        dirs.forEach(function (d) {
            const block = document.createElement('section');
            block.className = 'research-block';

            const icon = document.createElement('div');
            icon.className = 'research-icon';
            icon.textContent = d.icon || '';
            block.appendChild(icon);

            const body = document.createElement('div');
            body.className = 'research-body';

            const h2 = document.createElement('h2');
            h2.textContent = pick(d, 'title');
            body.appendChild(h2);

            const description = pick(d, 'description');
            if (description) {
                const p = document.createElement('p');
                p.textContent = description;
                body.appendChild(p);
            }

            const techniques = pickList(d, 'techniques');
            if (techniques.length) {
                const p = document.createElement('p');
                p.textContent = T.keyTechniques + techniques.join(T.listSep);
                body.appendChild(p);
            }

            const related = pickList(d, 'relatedPubs');
            if (related.length) {
                const p = document.createElement('p');
                p.appendChild(document.createTextNode(T.relatedWork));
                related.forEach(function (ref, i) {
                    if (i) p.appendChild(document.createTextNode(T.listSep));
                    // relatedPubs 里既可能是字符串地址，也可能是 { label, href } 对象
                    const href = typeof ref === 'string' ? ref : (ref.href || '#');
                    const a = document.createElement('a');
                    a.href = sitePath(href);
                    a.textContent = (ref && typeof ref === 'object' && ref.label)
                        ? pick(ref, 'label')
                        : T.relatedPubLink;
                    p.appendChild(a);
                });
                body.appendChild(p);
            }

            block.appendChild(body);
            sec.appendChild(block);
        });
    };

    // ---- 项目仓库元信息（来自 data.json 的 projects[].stats，由 tools/fetch-github-stats.py 抓取） ----
    // 只展示可核实的公开数据：star 数、主语言、许可证、最近更新时间。
    // 抓取时间写在 data.json.meta.githubFetchedAt 里，页面注明数据来源，避免读者误以为是实时。
    function buildRepoMeta(p, fetchedAt) {
        const st = p.stats;
        if (!st) return null;
        const box = document.createElement('div');
        box.className = 'repo-meta';

        function chip(text, cls, title) {
            if (!text) return;
            const span = document.createElement('span');
            span.className = 'repo-chip' + (cls ? ' ' + cls : '');
            span.textContent = text;
            if (title) span.title = title;
            box.appendChild(span);
            return span;
        }

        if (st.stars > 0) chip('★ ' + st.stars, 'repo-chip-star', I18N.starsTitle);
        chip(st.language, 'repo-chip-lang', I18N.languageTitle);
        if (st.license && st.license !== 'NOASSERTION') chip(st.license, 'repo-chip-license', I18N.licenseTitle);
        if (st.archived) chip(I18N.archived, 'repo-chip-archived');
        if (st.pushedAt) {
            const rel = relativeDate(st.pushedAt, fetchedAt);
            chip(I18N.updatedPrefix + rel, 'repo-chip-updated', I18N.pushedAtTitle + st.pushedAt);
        }
        return box.childNodes.length ? box : null;
    }

    // 相对时间以「抓取日期」为基准，而不是浏览器当前时间：
    // 页面是静态的，用 Date.now() 的话同一份 HTML 会随访问时间漂移，
    // 也会和页脚注明的抓取时间自相矛盾。
    function relativeDate(iso, baseIso) {
        const then = new Date(iso + 'T00:00:00');
        if (isNaN(then.getTime())) return iso;
        const base = baseIso ? new Date(baseIso + 'T00:00:00') : new Date();
        const ref = isNaN(base.getTime()) ? new Date() : base;
        const days = Math.max(0, Math.floor((ref.getTime() - then.getTime()) / 86400000));
        if (days < 30) return I18N.daysAgo(days);
        const months = Math.floor(days / 30.44);
        if (months < 12) return I18N.monthsAgo(months);
        return I18N.yearsAgo(Math.floor(days / 365.25));
    }

    // ---- projects-list：projects ----
    const renderProjects = function (sec, data) {
        sec.innerHTML = '';
        const projects = data.projects || [];
        if (!projects.length) {
            handleEmpty(sec, sec);
            return;
        }
        const fetchedAt = (data.meta && data.meta.githubFetchedAt) || '';
        projects.forEach(function (p) {
            const card = document.createElement('section');
            card.className = 'project-card';

            const header = document.createElement('div');
            header.className = 'project-header';
            const h2 = document.createElement('h2');
            h2.textContent = pick(p, 'title');
            header.appendChild(h2);
            const status = document.createElement('span');
            status.className = 'project-status status-' + (p.status || 'active');
            status.textContent = pick(p, 'statusLabel');
            header.appendChild(status);
            card.appendChild(header);

            const desc = document.createElement('p');
            desc.className = 'project-desc';
            desc.textContent = pick(p, 'description');
            card.appendChild(desc);

            const repoMeta = buildRepoMeta(p, fetchedAt);
            if (repoMeta) card.appendChild(repoMeta);

            const tech = pickList(p, 'tech');
            if (tech.length) {
                const techBox = document.createElement('div');
                techBox.className = 'project-tech';
                tech.forEach(function (name) {
                    const span = document.createElement('span');
                    span.className = 'tag';
                    span.textContent = name;
                    techBox.appendChild(span);
                });
                card.appendChild(techBox);
            }

            appendLinks(card, 'project-links', pickList(p, 'links'), 'pub-link');
            sec.appendChild(card);
        });

        // 数据来源说明（抓取时间来自 data.json.meta）
        const fetched = (data.meta && data.meta.githubFetchedAt) || '';
        if (fetched) {
            const note = document.createElement('p');
            note.className = 'repo-source-note';
            note.textContent = I18N.repoSourceNote(fetched);
            sec.appendChild(note);
        }
    };

    // ---- featured-projects：index 首页精选项目（网格卡片 + 查看全部） ----
    // 项目原来只藏在二级页，首页给一个网格能显著提升「这个人在做什么」的可读性。
    const renderFeaturedProjects = function (sec, data) {
        // 与其它区块一致：静态壳里保留 .section-head，只往 [data-featured-projects] 里写内容。
        // 这样标题、眉标、副标题与网格共享同一套左右留白，也不会互相覆盖。
        const host = findIn(sec, '[data-featured-projects]') || sec;
        if (host === sec) {
            // 兜底：页面若没给 [data-featured-projects] 容器，就只清 sec 里除 .section-head 之外的内容
            const keep = sec.querySelector('.section-head');
            sec.innerHTML = '';
            if (keep) sec.appendChild(keep);
        } else {
            host.innerHTML = '';
        }

        const projects = (data.projects || []).slice(0, 6);
        if (!projects.length) {
            // 首页无项目时整块隐藏（与其它区块一致），避免「有标题没内容」
            const sectionHost = (sec.closest && sec.closest('[data-section]')) || sec;
            sectionHost.classList.add('is-empty');
            if (isHomePage()) {
                sectionHost.hidden = true;
                return;
            }
            handleEmpty(sec, host);
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'project-grid';

        projects.forEach(function (p) {
            const card = document.createElement('article');
            card.className = 'project-tile';

            // 注意变量名不要叫 head：外层已用同名 const 保存 .section-head，
            // 同名会造成 TDZ（ReferenceError），前面 appendChild(head) 会直接抛错
            const tileHead = document.createElement('div');
            tileHead.className = 'project-tile-head';
            const h3 = document.createElement('h3');
            h3.className = 'project-tile-title';
            const link = (pickList(p, 'links') || [])[0];
            if (link && link.href && link.href !== '#') {
                const a = document.createElement('a');
                a.href = link.href;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = pick(p, 'title');
                h3.appendChild(a);
            } else {
                h3.textContent = pick(p, 'title');
            }
            tileHead.appendChild(h3);

            if (p.status) {
                const status = document.createElement('span');
                status.className = 'project-status status-' + p.status;
                status.textContent = pick(p, 'statusLabel');
                tileHead.appendChild(status);
            }
            card.appendChild(tileHead);

            const desc = document.createElement('p');
            desc.className = 'project-tile-desc';
            desc.textContent = pick(p, 'description');
            card.appendChild(desc);

            const tech = pickList(p, 'tech');
            if (tech.length) {
                const techBox = document.createElement('div');
                techBox.className = 'project-tech';
                tech.slice(0, 5).forEach(function (name) {
                    const span = document.createElement('span');
                    span.className = 'tag';
                    span.textContent = name;
                    techBox.appendChild(span);
                });
                card.appendChild(techBox);
            }

            appendLinks(card, 'project-links', pickList(p, 'links'), 'pub-link');
            grid.appendChild(card);
        });

        host.appendChild(grid);

        // 「查看全部项目 →」链接指向当前语言的项目页
        const all = document.createElement('a');
        all.className = 'see-all project-see-all';
        all.href = sitePath('projects.html');
        all.textContent = T.seeAllProjects;
        host.appendChild(all);
    };

    // ---- latest-posts：index 博客列表（只前 2 篇） ----
    const renderLatestPosts = function (sec, data) {
        const list = findIn(sec, '[data-latest-posts]');
        if (!list) return;
        list.innerHTML = '';
        const posts = (data.posts || []).filter(function (p) { return p.published; }).slice(0, 2);
        if (!posts.length) {
            handleEmpty(sec, list);
            return;
        }
        posts.forEach(function (p) { list.appendChild(buildPostItem(p)); });
    };

    // ---- all-posts：blog 完整列表 ----
    const renderAllPosts = function (sec, data) {
        // 分类过滤栏：可能和本区块同体，也可能是兄弟节点（blog.html 目前是兄弟）
        const filterBar = findIn(sec, '[data-filter-bar]') ||
            (sec.parentNode && findIn(sec.parentNode, '[data-filter-bar]'));
        const blogCfg = pageCfg(data, 'blog');
        if (filterBar && blogCfg.categories) {
            filterBar.innerHTML = '';
            blogCfg.categories.forEach(function (c) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'filter-btn' + (c.key === 'all' ? ' active' : '');
                btn.setAttribute('data-filter', c.key);
                btn.textContent = pick(c, 'label');
                filterBar.appendChild(btn);
            });
        }

        // 真实 bug 修复：blog.html 把 data-section 与 [data-posts-list] 放在同一个元素上，
        // 只用 querySelector 永远取不到，导致博客列表为空 → 改为「自身优先」
        const list = findIn(sec, '[data-posts-list]');
        if (!list) return;
        list.innerHTML = '';
        const posts = data.posts || [];
        if (!posts.length) {
            handleEmpty(sec, list);
            return;
        }
        posts.forEach(function (p) { list.appendChild(buildPostItem(p, !p.published)); });
    };

    function buildPostItem(p, isDraft) {
        const article = document.createElement('article');
        // is-draft 是视觉层约定的类；post-draft 保留旧类名以兼容既有 CSS
        article.className = 'post-item reveal' + (isDraft ? ' is-draft post-draft' : '');
        if (p.category) article.setAttribute('data-category', p.category);

        const meta = document.createElement('div');
        meta.className = 'post-meta';
        const time = document.createElement('time');
        time.textContent = pick(p, 'date');
        meta.appendChild(time);
        const cat = document.createElement('span');
        cat.className = 'post-category';
        cat.textContent = pick(p, 'categoryLabel');
        meta.appendChild(cat);
        const readTime = pick(p, 'readTime');
        if (readTime) {
            const rt = document.createElement('span');
            rt.className = 'read-time';
            rt.textContent = readTime;
            meta.appendChild(rt);
        }
        article.appendChild(meta);

        const h2 = document.createElement('h2');
        h2.className = 'post-title';
        const a = document.createElement('a');
        // 文章链接按语言分派：英文页取 hrefEn（en/blog/<file>），中文页取 href（blog/<file>）；
        // 否则英文列表点进文章会落到中文页面
        const href = IS_EN ? (p.hrefEn || p.href) : p.href;
        a.href = sitePath(href) || '#';
        a.textContent = pick(p, 'title');
        // 草稿的淡化/角标交给 CSS（.is-draft / .post-draft），不再写 inline opacity
        h2.appendChild(a);
        article.appendChild(h2);

        const excerpt = pick(p, 'excerpt');
        if (excerpt) {
            const p2 = document.createElement('p');
            p2.className = 'post-excerpt';
            p2.textContent = excerpt;
            article.appendChild(p2);
        }
        return article;
    }

    // ---- books：books 页面 ----
    const renderBooks = function (sec, data) {
        sec.innerHTML = '';
        const groups = data.books || [];
        if (!groups.length) {
            handleEmpty(sec, sec);
            return;
        }
        groups.forEach(function (group) {
            const grp = document.createElement('div');
            grp.className = 'book-group';
            const h2 = document.createElement('h2');
            h2.textContent = (group.icon ? group.icon + ' ' : '') + pick(group, 'category');
            grp.appendChild(h2);

            const list = document.createElement('ul');
            list.className = 'book-list';
            (group.items || []).forEach(function (it) {
                const li = document.createElement('li');
                li.className = 'book-item';

                const title = document.createElement('span');
                title.className = 'book-title';
                title.textContent = pick(it, 'title');
                li.appendChild(title);

                const author = document.createElement('span');
                author.className = 'book-author';
                author.textContent = ' — ' + pick(it, 'author');
                li.appendChild(author);

                const rating = document.createElement('span');
                rating.className = 'book-rating';
                const r = it.rating || {};
                if (r.stars) rating.textContent = ' ' + '⭐'.repeat(r.stars);
                else if (pick(r, 'label')) rating.textContent = ' ' + pick(r, 'label');
                li.appendChild(rating);

                const comment = pick(it, 'comment');
                if (comment) {
                    const c = document.createElement('div');
                    c.className = 'book-comment';
                    c.textContent = comment;
                    li.appendChild(c);
                }
                list.appendChild(li);
            });
            grp.appendChild(list);
            sec.appendChild(grp);
        });
    };

    // ---- hobbies：hobbies 页面 ----
    const renderHobbies = function (sec, data) {
        sec.innerHTML = '';
        const hobbies = data.hobbies || [];
        if (!hobbies.length) {
            handleEmpty(sec, sec);
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'hobby-grid';
        hobbies.forEach(function (h) {
            const card = document.createElement('div');
            card.className = 'hobby-card';
            const icon = document.createElement('div');
            icon.className = 'hobby-icon';
            icon.textContent = h.icon || '';
            card.appendChild(icon);
            const name = document.createElement('div');
            name.className = 'hobby-name';
            name.textContent = pick(h, 'name');
            card.appendChild(name);
            const desc = document.createElement('div');
            desc.className = 'hobby-desc';
            desc.textContent = pick(h, 'desc');
            card.appendChild(desc);
            grid.appendChild(card);
        });
        sec.appendChild(grid);
    };

    // ---- talks：分享记录（按年份倒序分组） ----
    const renderTalks = function (sec, data) {
        sec.innerHTML = '';
        const talks = (data.talks || []).slice().sort(function (a, b) {
            const ya = Number(a.year) || 0;
            const yb = Number(b.year) || 0;
            if (ya !== yb) return yb - ya;
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        if (!talks.length) {
            // 空数组时不显示任何年份分组，只给一句诚实的空态
            handleEmpty(sec, sec, T.talksEmpty);
            return;
        }

        const byYear = {};
        const years = [];
        talks.forEach(function (t) {
            const year = t.year ? String(t.year) : T.undated;
            if (!byYear[year]) {
                byYear[year] = [];
                years.push(year);
            }
            byYear[year].push(t);
        });

        years.forEach(function (year) {
            const block = document.createElement('section');
            block.className = 'content-block';
            const h2 = document.createElement('h2');
            h2.textContent = year;
            block.appendChild(h2);

            const list = document.createElement('ul');
            list.className = 'entry-list';
            byYear[year].forEach(function (t) {
                const li = document.createElement('li');
                li.className = 'entry-item';

                const title = document.createElement('div');
                title.className = 'entry-title';
                title.textContent = pick(t, 'title');
                li.appendChild(title);

                const metaParts = [t.date, pick(t, 'venue')].filter(function (s) { return !!s; });
                if (metaParts.length) {
                    const meta = document.createElement('div');
                    meta.className = 'entry-meta';
                    meta.textContent = metaParts.join(' · ');
                    li.appendChild(meta);
                }

                const desc = pick(t, 'desc');
                if (desc) {
                    const descEl = document.createElement('div');
                    descEl.className = 'entry-desc';
                    descEl.textContent = desc;
                    li.appendChild(descEl);
                }

                appendLinks(li, 'entry-links', pickList(t, 'links'), 'pub-link');
                list.appendChild(li);
            });
            block.appendChild(list);
            sec.appendChild(block);
        });
    };

    // ---- 404：error-page ----
    const render404 = function (sec, data) {
        const cfg = pageCfg(data, '404');
        setText(sec, '[data-404-code]', pick(cfg, 'code'));
        setText(sec, '[data-404-title]', pick(cfg, 'title'));
        setText(sec, '[data-404-suggestions-title]', pick(cfg, 'suggestionsTitle'));

        const desc = findIn(sec, '[data-404-desc]');
        if (desc) desc.innerHTML = pick(cfg, 'desc');

        const ctas = findIn(sec, '[data-404-ctas]');
        if (ctas) {
            ctas.innerHTML = '';
            (cfg.ctas || []).forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'btn btn-' + (c.variant || 'primary');
                a.textContent = pick(c, 'label');
                ctas.appendChild(a);
            });
        }

        const sug = findIn(sec, '[data-404-suggestions]');
        if (sug) {
            sug.innerHTML = '';
            (cfg.suggestions || []).forEach(function (s) {
                const item = document.createElement('a');
                item.href = s.href;
                item.className = 'suggestion-item';
                const icon = document.createElement('div');
                icon.className = 'suggestion-icon';
                icon.textContent = s.icon || '';
                item.appendChild(icon);
                const title = document.createElement('div');
                title.className = 'suggestion-title';
                title.textContent = pick(s, 'title');
                item.appendChild(title);
                const descEl = document.createElement('div');
                descEl.className = 'suggestion-desc';
                descEl.textContent = pick(s, 'desc');
                item.appendChild(descEl);
                sug.appendChild(item);
            });
        }
    };

    // ---- personal-bio：about 页 ----
    const renderPersonalBio = function (sec, data) {
        const bio = findIn(sec, '[data-bio-paragraphs]');
        if (!bio) return;
        bio.innerHTML = '';
        const paragraphs = pickList(data.personal || {}, 'bio');
        if (!paragraphs.length) {
            handleEmpty(sec, bio);
            return;
        }
        paragraphs.forEach(function (text) {
            const p = document.createElement('p');
            p.textContent = text;
            bio.appendChild(p);
        });
    };

    // ---- education：about 页 ----
    const renderEducation = function (sec, data) {
        const list = findIn(sec, '[data-education-list]');
        if (!list) return;
        list.innerHTML = '';
        const education = data.education || [];
        if (!education.length) {
            handleEmpty(sec, list);
            return;
        }
        education.forEach(function (e) {
            const li = document.createElement('li');
            const period = document.createElement('div');
            period.className = 'exp-period';
            period.textContent = pick(e, 'period');
            li.appendChild(period);

            const body = document.createElement('div');
            body.className = 'exp-body';
            const h3 = document.createElement('h3');
            const department = pick(e, 'department');
            h3.textContent = pick(e, 'school') + (department ? ' · ' + department : '');
            body.appendChild(h3);

            const degree = pick(e, 'degree');
            const advisor = pick(e, 'advisor');
            if (degree || advisor) {
                const p = document.createElement('p');
                let s = degree || '';
                if (advisor) s += T.inlineSep + T.advisorPrefix + advisor;
                p.textContent = s;
                body.appendChild(p);
            }
            li.appendChild(body);
            list.appendChild(li);
        });
    };

    // ---- skills：about 页 ----
    const renderSkills = function (sec, data) {
        sec.innerHTML = '';
        const skills = data.skills || {};
        const groups = [
            { title: IS_EN ? 'Programming Languages' : '编程语言', items: skills.languages || [] },
            { title: IS_EN ? 'Frameworks & Tools' : '工具与框架', items: skills.tools || [] },
            { title: IS_EN ? 'Languages' : '语言能力', items: skills.spoken || [] }
        ].filter(function (g) { return g.items.length; });

        if (!groups.length) {
            handleEmpty(sec, sec);
            return;
        }
        groups.forEach(function (g) {
            const grp = document.createElement('div');
            grp.className = 'skill-group';
            const h3 = document.createElement('h3');
            h3.textContent = g.title;
            grp.appendChild(h3);
            const tags = document.createElement('div');
            tags.className = 'tags';
            g.items.forEach(function (it) {
                const span = document.createElement('span');
                span.className = 'tag';
                const level = pick(it, 'level');
                span.textContent = pick(it, 'name') + levelSuffix(level);
                tags.appendChild(span);
            });
            grp.appendChild(tags);
            sec.appendChild(grp);
        });
    };

    // ---- awards：about 页 ----
    const renderAwards = function (sec, data) {
        const list = findIn(sec, '[data-awards-list]');
        if (!list) return;
        list.innerHTML = '';
        const awards = data.awards || [];
        if (!awards.length) {
            handleEmpty(sec, list);
            return;
        }
        awards.forEach(function (a) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = (a.year || '') + T.awardYear;
            li.appendChild(strong);
            li.appendChild(document.createTextNode(T.inlineSep + pick(a, 'name')));
            list.appendChild(li);
        });
    };

    // ============== 首页区块的 eyebrow / sub 文案 ==============
    // data.sections[name] = { eyebrow, sub, eyebrowEn, subEn }
    function fillSectionText(sec, data, name) {
        const prefix = SECTION_TEXT_PREFIX[name];
        if (!prefix) return;
        const cfg = (data.sections && data.sections[name]) || null;
        writePart(sec, '[data-' + prefix + '-eyebrow]', 'eyebrow', cfg ? pick(cfg, 'eyebrow') : '');
        writePart(sec, '[data-' + prefix + '-sub]', 'sub', cfg ? pick(cfg, 'sub') : '');

        // 约定前缀取不到时退化为扫描 data-*-eyebrow / data-*-sub，
        // 这样以后调整前缀也不用改这份映射；字段缺失时留空（CSS 已处理空态）
        function writePart(host, selector, key, value) {
            const el = findIn(host, selector) || findByAttrSuffix(host, key);
            if (el) el.textContent = value || '';
        }
    }

    function findByAttrSuffix(host, key) {
        const all = host.querySelectorAll('*');
        const suffix = '-' + key;
        for (let i = 0; i < all.length; i++) {
            const attrs = all[i].attributes;
            for (let j = 0; j < attrs.length; j++) {
                const attrName = attrs[j].name;
                if (attrName.indexOf('data-') === 0 && attrName.slice(-suffix.length) === suffix) {
                    return all[i];
                }
            }
        }
        return null;
    }

    // ============== 相关内容：把文章接到主题页上 ==============
    // talks / research / publications 这些页面本身内容就少（分享记录、论文都还没公开），
    // 读者点进来看到一大片空白。挂上「相关文章」既是真实内容，也给了继续阅读的路径。
    // 关联关系写在 data.json 的 posts[].relatedPages / relatedPagesEn。
    const renderRelatedPosts = function (sec, data) {
        const list = findIn(sec, '[data-related-posts]') || sec;
        list.innerHTML = '';

        const pageKey = sec.getAttribute('data-page-key') || '';
        const posts = (data.posts || []).filter(function (p) {
            if (!p.published) return false;
            const rel = (IS_EN ? (p.relatedPagesEn || p.relatedPages) : p.relatedPages) || [];
            return rel.indexOf(pageKey) !== -1;
        });
        if (!posts.length) { removeNode(sec); return; }

        posts.forEach(function (p) {
            const a = document.createElement('a');
            a.className = 'related-post';
            const href = IS_EN ? (p.hrefEn || p.href) : p.href;
            a.href = sitePath(href);

            const meta = document.createElement('div');
            meta.className = 'related-post-meta';
            const time = document.createElement('span');
            time.textContent = p.date || '';
            meta.appendChild(time);
            const cat = document.createElement('span');
            cat.className = 'related-post-cat';
            cat.textContent = pick(p, 'categoryLabel');
            meta.appendChild(cat);
            a.appendChild(meta);

            const title = document.createElement('h3');
            title.className = 'related-post-title';
            title.textContent = pick(p, 'title');
            a.appendChild(title);

            const excerpt = pick(p, 'excerpt');
            if (excerpt) {
                const pEl = document.createElement('p');
                pEl.className = 'related-post-excerpt';
                pEl.textContent = excerpt;
                a.appendChild(pEl);
            }

            const read = document.createElement('span');
            read.className = 'related-post-read';
            read.textContent = (IS_EN ? 'Read' : '阅读') + ' →';
            a.appendChild(read);

            list.appendChild(a);
        });
    };

    // ============== Renderer 注册 ==============
    const RENDERERS = {
        'personal-hero': renderPersonalHero,
        'stats': renderStats,
        'overview': renderOverview,
        'news': renderNews,
        'featured-publications': renderFeaturedPubs,
        'featured-projects': renderFeaturedProjects,
        'all-publications': renderAllPubs,
        'research-directions': renderResearchDirs,
        'projects-list': renderProjects,
        'latest-posts': renderLatestPosts,
        'all-posts': renderAllPosts,
        'books': renderBooks,
        'hobbies': renderHobbies,
        'talks': renderTalks,
        'related-posts': renderRelatedPosts,
        '404-page': render404,
        'personal-bio': renderPersonalBio,
        'education': renderEducation,
        'skills': renderSkills,
        'awards': renderAwards
    };

    // 兜底：个别区块漏写 data-section（例如 about.html 的获奖列表），
    // 只扫 [data-section] 会让整块内容静默消失。这里按叶子容器反查宿主区块补渲染；
    // HTML 一旦补上 data-section，宿主会被 [data-section] 命中原流程，不会重复渲染。
    const ORPHAN_TARGETS = [
        { leaf: '[data-awards-list]', section: 'awards' },
        { leaf: '[data-education-list]', section: 'education' },
        { leaf: '[data-bio-paragraphs]', section: 'personal-bio' },
        { leaf: '[data-news-list]', section: 'news' },
        { leaf: '[data-featured-pubs]', section: 'featured-publications' },
        { leaf: '[data-latest-posts]', section: 'latest-posts' },
        { leaf: '[data-posts-list]', section: 'all-posts' }
    ];

    function renderOrphanSections(root, data) {
        ORPHAN_TARGETS.forEach(function (o) {
            const leaf = root.querySelector(o.leaf);
            if (!leaf) return;
            if (leaf.closest('[data-section]')) return;
            const host = leaf.closest('section') || leaf.parentElement;
            if (host && RENDERERS[o.section]) RENDERERS[o.section](host, data);
        });
    }

    // ============== 双语 / 路径 / 空态 工具 ==============

    // 单字段取词：英文页优先 xxxEn，缺失或为空时回退中文
    function pick(obj, base) {
        if (!obj) return '';
        if (IS_EN) {
            const en = obj[base + 'En'];
            if (Array.isArray(en)) {
                if (en.length) return en;
            } else if (en !== null && en !== undefined && String(en).trim() !== '') {
                return en;
            }
        }
        const v = obj[base];
        return v === null || v === undefined ? '' : v;
    }

    function pickList(obj, base) {
        const v = pick(obj, base);
        return Array.isArray(v) ? v : (v ? [v] : []);
    }

    // 整块英文化的数据：data.overviewEn / heroCtasEn / contactsEn
    // 英文页把 En 版本浅合并到中文版之上，缺字段仍回退中文
    function localized(data, key) {
        const base = data[key];
        const en = IS_EN ? data[key + 'En'] : null;
        if (!en) return base || [];
        if (Array.isArray(en)) {
            return en.map(function (item, i) {
                const zhItem = Array.isArray(base) ? base[i] : null;
                if (zhItem && item && typeof item === 'object') return mergeInto(mergeInto({}, zhItem), item);
                return item;
            });
        }
        return mergeInto(mergeInto({}, base || {}), en);
    }

    // pages.xxx 的页面文案（也兼容 pagesEn 整体覆盖）
    function pageCfg(data, key) {
        const zh = (data.pages && data.pages[key]) || {};
        if (!IS_EN) return zh;
        const en = (data.pagesEn && data.pagesEn[key]) || null;
        return en ? mergeInto(mergeInto({}, zh), en) : zh;
    }

    function mergeInto(target, source) {
        Object.keys(source || {}).forEach(function (k) { target[k] = source[k]; });
        return target;
    }

    function levelSuffix(level) {
        if (!level) return '';
        return IS_EN ? ' (' + level + ')' : '（' + level + '）';
    }

    // data.json 里以「站点根」为基准的资源/文章路径（assets/…、blog/…）需要补上页面深度前缀，
    // 否则 /en/ 子目录页面会 404；绝对地址、mailto、锚点原样返回
    function sitePath(url) {
        if (!url || typeof url !== 'string') return '';
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(url)) return url;
        return BASE + url.replace(/^(?:\.\.?\/)+/, '');
    }

    // 作者渲染：作者既可能是字符串，也可能是 { name, isMe, isCoFirst, isCorresponding }。
    // 统一生成成对标签，避免旧实现把角标当标签前缀拼出 <strong>Name（残标签）
    function authorHtml(a) {
        if (typeof a === 'string') return escapeHtml(a);
        if (!a) return '';
        let name = escapeHtml(a.name || '');
        let marks = '';
        // data.json 里角标有时已经写在名字中（例如「通讯作者*」），避免重复追加
        if (a.isCoFirst && name.indexOf('†') === -1) marks += '†';
        if (a.isCorresponding && name.indexOf('*') === -1) marks += '*';
        return a.isMe ? '<strong>' + name + marks + '</strong>' : name + marks;
    }

    // 统一的链接块渲染（pub-links / project-links / entry-links 结构一致）
    function appendLinks(host, className, links, linkClass) {
        if (!links.length) return;
        const box = document.createElement('div');
        box.className = className;
        links.forEach(function (l) {
            if (!l) return;
            const a = document.createElement('a');
            const href = typeof l === 'string' ? l : l.href;
            a.href = href ? sitePath(href) : '#';
            a.className = linkClass;
            if (href && href !== '#') {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener');
            }
            a.textContent = typeof l === 'string' ? l : pick(l, 'label');
            box.appendChild(a);
        });
        host.appendChild(box);
    }

    function setText(parent, selector, text) {
        if (text === null || text === undefined) return;
        const el = findIn(parent, selector);
        if (el) el.textContent = text;
    }

    // 容器可能是「自身带 data-*」也可能是「后代带 data-*」；
    // 旧实现只用 querySelector，在两者同体时（blog.html 的 all-posts）取不到元素
    function findIn(host, selector) {
        if (!host) return null;
        if (host.matches && host.matches(selector)) return host;
        return host.querySelector(selector);
    }

    function removeNode(el) {
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function hideChart(chart) {
        const wrap = chart.closest ? chart.closest('.github-chart') : null;
        if (wrap) wrap.hidden = true;
        else chart.hidden = true;
    }

    function hideSection(sec) {
        const host = (sec.closest && sec.closest('[data-section]')) || sec;
        if (!host) return;
        host.classList.add('is-empty');
        host.hidden = true;
    }

    // 空数据降级：加 is-empty 标记；首页直接隐藏区块（否则会留下只有标题的空洞），
    // 其他页面保留区块并给出可见空态文案，避免用户以为页面坏了
    function handleEmpty(sec, listEl, message) {
        const host = (sec.closest && sec.closest('[data-section]')) || sec;
        if (host) host.classList.add('is-empty');
        if (host && isHomePage()) {
            host.hidden = true;
            return;
        }
        const box = document.createElement('div');
        box.className = 'empty-state';
        box.textContent = message || T.emptyState;
        (listEl || host || sec).appendChild(box);
    }

    function isHomePage() {
        return !!document.querySelector('[data-section="personal-hero"]');
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function handleError(err) {
        console.error('[page-renderer] 加载 data.json 失败：', err);
        while (mainRoot.firstChild) mainRoot.removeChild(mainRoot.firstChild);
        const p = document.createElement('p');
        p.className = 'page-error';
        p.textContent = IS_EN
            ? 'Failed to load data.json (' + err.message + '). Please check that the file exists.'
            : '无法加载 data.json (' + err.message + ')。请检查文件是否存在。';
        mainRoot.appendChild(p);
        // 自报失败：让验证脚本把这种情况当成错误而不是「就绪」
        try { document.documentElement.dataset.dshRenderError = err.message || '1'; } catch (e) { /* 忽略 */ }
    }
})();
