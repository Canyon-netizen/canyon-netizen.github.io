// ========================================
// 全站页面渲染器：从 data.json 读取并填充页面 main 块
// 监听 partials:loaded 事件，在 partials 注入完成后渲染
// ========================================
(function () {
    'use strict';

    // 找到主渲染容器（id 表明页面类型）
    const mainRoot = document.getElementById('page-content');
    if (!mainRoot) return;

    document.addEventListener('partials:loaded', init);

    function init() {
        const meta = window.__PAGE_META__ || {};
        const basePath = meta.basePath || '';
        const dataUrl = basePath + 'data.json';

        fetch(dataUrl, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) { renderPage(mainRoot, data); })
            .catch(handleError);
    }

    function renderPage(root, data) {
        // 派发子 section 渲染
        // 每个 section 容器带 data-section 属性
        const sections = root.querySelectorAll('[data-section]');
        sections.forEach(function (sec) {
            const name = sec.dataset.section;
            const renderer = RENDERERS[name];
            if (renderer) {
                renderer(sec, data);
            } else {
                console.warn('[page-renderer] 未知 section:', name);
            }
        });
        document.dispatchEvent(new CustomEvent('page:rendered'));
    }

    // ============== Section 渲染器 ==============
    // 每个 renderer 接收 (container, data)，将内容写入 container

    // ---- personal-hero：index.html 顶部 hero ----
    const renderPersonalHero = function (sec, data) {
        const p = data.personal || {};
        setText(sec, '[data-hero-eyebrow]', p.heroEyebrow);
        setText(sec, '[data-hero-name]', p.name);
        setText(sec, '[data-hero-subtitle]', p.heroSubtitle);
        // CTAs
        const ctaList = sec.querySelector('[data-hero-ctas]');
        if (ctaList && data.heroCtas) {
            ctaList.innerHTML = '';
            data.heroCtas.forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'btn btn-' + (c.variant || 'primary');
                a.textContent = c.label;
                ctaList.appendChild(a);
            });
        }
        // Contacts
        const contacts = sec.querySelector('[data-hero-contacts]');
        if (contacts && data.contacts) {
            contacts.innerHTML = '';
            data.contacts.forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'meta-item';
                if (c.external) a.setAttribute('target', '_blank');
                if (c.external) a.setAttribute('rel', 'noopener');
                a.textContent = (c.icon ? c.icon + ' ' : '') + c.label;
                contacts.appendChild(a);
            });
        }
        // Avatar
        const avatar = sec.querySelector('[data-hero-avatar]');
        if (avatar && p.avatar) {
            avatar.src = p.avatar;
            avatar.alt = p.name + ' avatar';
        }
    };

    // ---- stats：index 数据一览 ----
    const renderStats = function (sec, data) {
        const stats = data.stats || {};
        // 3 个数字 stat-card
        ['posts', 'publications', 'githubStars'].forEach(function (k) {
            const card = sec.querySelector('[data-stat="' + k + '"]');
            if (card && stats[k]) {
                setText(card, '[data-stat-label]', stats[k].label);
                setText(card, '[data-stat-value]', stats[k].value);
                setText(card, '[data-stat-icon]', stats[k].icon);
            }
        });
        // 访客数（badge img）
        const visitors = sec.querySelector('[data-stat="visitors"]');
        if (visitors && stats.visitors) {
            setText(visitors, '[data-stat-label]', stats.visitors.label);
            setText(visitors, '[data-stat-icon]', stats.visitors.icon);
            const img = visitors.querySelector('img');
            if (img) img.src = stats.visitors.badgeUrl;
        }
        // GitHub 贡献图
        const chart = sec.querySelector('[data-contributions-chart]');
        if (chart && stats.contributionsChart) {
            const c = stats.contributionsChart;
            chart.src = 'https://ghchart.rshah.org/' + c.theme + '/' + c.username;
            chart.alt = 'GitHub contributions for ' + c.username;
        }
        const caption = sec.querySelector('[data-contributions-caption]');
        if (caption && stats.contributionsChart) {
            caption.textContent = stats.contributionsChart.caption;
        }
    };

    // ---- overview：index 个人概览 ----
    const renderOverview = function (sec, data) {
        const ov = data.overview || {};
        // Education
        const eduList = sec.querySelector('[data-overview-education]');
        if (eduList && ov.education) {
            eduList.innerHTML = '';
            ov.education.forEach(function (e) {
                const li = document.createElement('li');
                li.textContent = e.period + '　' + e.school + '　' + e.major + '　' + e.degree;
                eduList.appendChild(li);
            });
        }
        // Interests
        const interests = sec.querySelector('[data-overview-interests]');
        if (interests && ov.interests) {
            interests.innerHTML = '';
            ov.interests.forEach(function (t) {
                const li = document.createElement('li');
                li.textContent = t;
                interests.appendChild(li);
            });
        }
        // Current status
        const status = sec.querySelector('[data-overview-status]');
        if (status && ov.currentStatus) {
            setText(status, '[data-overview-affiliation]', ov.currentStatus.affiliation);
            setText(status, '[data-overview-advisor]', ov.currentStatus.advisor);
        }
        // Location
        const loc = sec.querySelector('[data-overview-location]');
        if (loc && ov.location) {
            setText(loc, '[data-overview-city]', ov.location.city + '，' + ov.location.country);
            setText(loc, '[data-overview-note]', ov.location.note);
        }
    };

    // ---- news：index 时间线 ----
    const renderNews = function (sec, data) {
        const list = sec.querySelector('[data-news-list]');
        if (!list) return;
        list.innerHTML = '';
        (data.news || []).forEach(function (n) {
            const li = document.createElement('li');
            li.className = 'timeline-item';
            const date = document.createElement('span');
            date.className = 'timeline-date';
            date.textContent = n.date;
            li.appendChild(date);
            const p = document.createElement('p');
            p.innerHTML = n.content;
            li.appendChild(p);
            list.appendChild(li);
        });
    };

    // ---- featured-publications：index 代表性论文 ----
    const renderFeaturedPubs = function (sec, data) {
        const list = sec.querySelector('[data-featured-pubs]');
        if (!list) return;
        list.innerHTML = '';
        (data.publications || []).filter(function (p) { return p.featured; }).forEach(function (p) {
            list.appendChild(buildPubItem(p));
        });
    };

    // ---- all-publications：publications 完整列表（按 year 分组） ----
    const renderAllPubs = function (sec, data) {
        const root = sec;
        root.innerHTML = '';
        const pubs = (data.publications || []).slice().sort(function (a, b) {
            // 优先按 year 降序，无 year 的（preprint）放最后
            if (a.year && b.year) return b.year - a.year;
            if (a.year) return -1;
            if (b.year) return 1;
            return 0;
        });
        // 按 year 分组
        const groups = {};
        pubs.forEach(function (p) {
            const key = p.category || (p.year ? String(p.year) : '其他');
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        Object.keys(groups).forEach(function (yearKey) {
            const sec2 = document.createElement('section');
            sec2.className = 'content-block';
            const h2 = document.createElement('h2');
            h2.textContent = yearKey;
            sec2.appendChild(h2);
            const list = document.createElement('div');
            list.className = 'pub-list-full';
            groups[yearKey].forEach(function (p) { list.appendChild(buildPubItem(p, true)); });
            sec2.appendChild(list);
            root.appendChild(sec2);
        });
    };

    function buildPubItem(p, isFull) {
        const item = document.createElement('div');
        item.className = isFull ? 'pub-item' : 'pub-item';
        const venue = document.createElement('div');
        venue.className = 'pub-venue';
        venue.textContent = p.venue || '';
        item.appendChild(venue);
        const content = document.createElement('div');
        content.className = 'pub-content';
        const title = document.createElement('div');
        title.className = 'pub-title';
        title.textContent = p.title || '';
        content.appendChild(title);
        const authors = document.createElement('div');
        authors.className = 'pub-authors';
        authors.innerHTML = (p.authors || []).map(function (a) {
            if (typeof a === 'string') return a;
            const marks = [];
            let name = a.name || '';
            if (a.isMe) marks.push('<strong>');
            if (a.isCoFirst) marks.push('†');
            if (a.isCorresponding) marks.push('*');
            return marks[0] ? marks[0] + name + (marks[0] === '<strong>' ? '</strong>' : '') : name;
        }).join(', ');
        content.appendChild(authors);
        if (p.summary && isFull) {
            const desc = document.createElement('div');
            desc.className = 'pub-desc';
            desc.textContent = p.summary;
            content.appendChild(desc);
        }
        if (p.links && p.links.length) {
            const links = document.createElement('div');
            links.className = 'pub-links';
            p.links.forEach(function (l) {
                const a = document.createElement('a');
                a.href = l.href;
                a.className = 'pub-link';
                if (l.href && l.href !== '#') {
                    a.setAttribute('target', '_blank');
                    a.setAttribute('rel', 'noopener');
                }
                a.textContent = l.label;
                links.appendChild(a);
            });
            content.appendChild(links);
        }
        item.appendChild(content);
        return item;
    }

    // ---- research-directions：research 3 个方向 ----
    const renderResearchDirs = function (sec, data) {
        sec.innerHTML = '';
        (data.researchDirections || []).forEach(function (d) {
            const block = document.createElement('section');
            block.className = 'research-block';
            const icon = document.createElement('div');
            icon.className = 'research-icon';
            icon.textContent = d.icon || '';
            block.appendChild(icon);
            const body = document.createElement('div');
            body.className = 'research-body';
            const h2 = document.createElement('h2');
            h2.textContent = d.title || '';
            body.appendChild(h2);
            if (d.description) {
                const p = document.createElement('p');
                p.textContent = d.description;
                body.appendChild(p);
            }
            if (d.techniques && d.techniques.length) {
                const p = document.createElement('p');
                p.textContent = '关键技术：' + d.techniques.join('、');
                body.appendChild(p);
            }
            if (d.relatedPubs && d.relatedPubs.length) {
                const p = document.createElement('p');
                p.innerHTML = '代表性工作：' + d.relatedPubs.map(function (h) {
                    return '<a href="' + h + '">论文标题</a>';
                }).join('、');
                body.appendChild(p);
            }
            block.appendChild(body);
            sec.appendChild(block);
        });
    };

    // ---- projects-list：projects ----
    const renderProjects = function (sec, data) {
        sec.innerHTML = '';
        (data.projects || []).forEach(function (p) {
            const card = document.createElement('section');
            card.className = 'project-card';
            const header = document.createElement('div');
            header.className = 'project-header';
            const h2 = document.createElement('h2');
            h2.textContent = p.title || '';
            header.appendChild(h2);
            const status = document.createElement('span');
            status.className = 'project-status status-' + (p.status || 'active');
            status.textContent = p.statusLabel || '';
            header.appendChild(status);
            card.appendChild(header);
            const desc = document.createElement('p');
            desc.className = 'project-desc';
            desc.textContent = p.description || '';
            card.appendChild(desc);
            if (p.tech && p.tech.length) {
                const tech = document.createElement('div');
                tech.className = 'project-tech';
                p.tech.forEach(function (t) {
                    const span = document.createElement('span');
                    span.className = 'tag';
                    span.textContent = t;
                    tech.appendChild(span);
                });
                card.appendChild(tech);
            }
            if (p.links && p.links.length) {
                const links = document.createElement('div');
                links.className = 'project-links';
                p.links.forEach(function (l) {
                    const a = document.createElement('a');
                    a.href = l.href;
                    a.className = 'pub-link';
                    if (l.href && l.href !== '#') {
                        a.setAttribute('target', '_blank');
                        a.setAttribute('rel', 'noopener');
                    }
                    a.textContent = l.label;
                    links.appendChild(a);
                });
                card.appendChild(links);
            }
            sec.appendChild(card);
        });
    };

    // ---- latest-posts：index 博客列表（只前 2 篇） ----
    const renderLatestPosts = function (sec, data) {
        const list = sec.querySelector('[data-latest-posts]');
        if (!list) return;
        list.innerHTML = '';
        (data.posts || []).filter(function (p) { return p.published; }).slice(0, 2).forEach(function (p) {
            list.appendChild(buildPostItem(p));
        });
    };

    // ---- all-posts：blog 完整列表（4 篇含已发布与占位） ----
    const renderAllPosts = function (sec, data) {
        // 分类过滤栏（可能在 sec 兄弟元素中）
        const filterBar = sec.querySelector('[data-filter-bar]') || sec.parentNode && sec.parentNode.querySelector('[data-filter-bar]');
        if (filterBar && data.pages && data.pages.blog && data.pages.blog.categories) {
            filterBar.innerHTML = '';
            data.pages.blog.categories.forEach(function (c) {
                const btn = document.createElement('button');
                btn.className = 'filter-btn' + (c.key === 'all' ? ' active' : '');
                btn.setAttribute('data-filter', c.key);
                btn.textContent = c.label;
                filterBar.appendChild(btn);
            });
        }
        const list = sec.querySelector('[data-posts-list]');
        if (!list) return;
        list.innerHTML = '';
        (data.posts || []).forEach(function (p) {
            list.appendChild(buildPostItem(p, !p.published));
        });
    };

    function buildPostItem(p, isDraft) {
        const article = document.createElement('article');
        article.className = 'post-item reveal' + (isDraft ? ' post-draft' : '');
        if (p.category) article.setAttribute('data-category', p.category);
        const meta = document.createElement('div');
        meta.className = 'post-meta';
        const time = document.createElement('time');
        time.textContent = p.date;
        meta.appendChild(time);
        const cat = document.createElement('span');
        cat.className = 'post-category';
        cat.textContent = p.categoryLabel || '';
        meta.appendChild(cat);
        if (p.readTime) {
            const rt = document.createElement('span');
            rt.className = 'read-time';
            rt.textContent = p.readTime;
            meta.appendChild(rt);
        }
        article.appendChild(meta);
        const h2 = document.createElement('h2');
        h2.className = 'post-title';
        const a = document.createElement('a');
        a.href = p.href || '#';
        a.textContent = p.title;
        if (isDraft) a.style.opacity = '0.5';
        h2.appendChild(a);
        article.appendChild(h2);
        if (p.excerpt) {
            const p2 = document.createElement('p');
            p2.className = 'post-excerpt';
            p2.textContent = p.excerpt;
            article.appendChild(p2);
        }
        return article;
    }

    // ---- books：books 页面 ----
    const renderBooks = function (sec, data) {
        sec.innerHTML = '';
        (data.books || []).forEach(function (group) {
            const grp = document.createElement('div');
            grp.className = 'book-group';
            const h2 = document.createElement('h2');
            const icon = group.icon ? group.icon + ' ' : '';
            h2.textContent = icon + (group.category || '');
            grp.appendChild(h2);
            const list = document.createElement('ul');
            list.className = 'book-list';
            (group.items || []).forEach(function (it) {
                const li = document.createElement('li');
                li.className = 'book-item';
                const title = document.createElement('span');
                title.className = 'book-title';
                title.textContent = it.title;
                li.appendChild(title);
                const author = document.createElement('span');
                author.className = 'book-author';
                author.textContent = ' — ' + (it.author || '');
                li.appendChild(author);
                const rating = document.createElement('span');
                rating.className = 'book-rating';
                if (it.rating && it.rating.stars) rating.textContent = ' ' + '⭐'.repeat(it.rating.stars);
                else if (it.rating && it.rating.label) rating.textContent = ' ' + it.rating.label;
                li.appendChild(rating);
                if (it.comment) {
                    const c = document.createElement('div');
                    c.className = 'book-comment';
                    c.textContent = it.comment;
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
        const grid = document.createElement('div');
        grid.className = 'hobby-grid';
        (data.hobbies || []).forEach(function (h) {
            const card = document.createElement('div');
            card.className = 'hobby-card';
            const icon = document.createElement('div');
            icon.className = 'hobby-icon';
            icon.textContent = h.icon || '';
            card.appendChild(icon);
            const name = document.createElement('div');
            name.className = 'hobby-name';
            name.textContent = h.name || '';
            card.appendChild(name);
            const desc = document.createElement('div');
            desc.className = 'hobby-desc';
            desc.textContent = h.desc || '';
            card.appendChild(desc);
            grid.appendChild(card);
        });
        sec.appendChild(grid);
    };

    // ---- 404：error-page ----
    const render404 = function (sec, data) {
        const cfg = (data.pages && data.pages['404']) || {};
        setText(sec, '[data-404-code]', cfg.code);
        setText(sec, '[data-404-title]', cfg.title);
        const desc = sec.querySelector('[data-404-desc]');
        if (desc && cfg.desc) desc.innerHTML = cfg.desc;
        const ctas = sec.querySelector('[data-404-ctas]');
        if (ctas && cfg.ctas) {
            ctas.innerHTML = '';
            cfg.ctas.forEach(function (c) {
                const a = document.createElement('a');
                a.href = c.href;
                a.className = 'btn btn-' + (c.variant || 'primary');
                a.textContent = c.label;
                ctas.appendChild(a);
            });
        }
        setText(sec, '[data-404-suggestions-title]', cfg.suggestionsTitle);
        const sug = sec.querySelector('[data-404-suggestions]');
        if (sug && cfg.suggestions) {
            sug.innerHTML = '';
            cfg.suggestions.forEach(function (s) {
                const item = document.createElement('a');
                item.href = s.href;
                item.className = 'suggestion-item';
                const icon = document.createElement('div');
                icon.className = 'suggestion-icon';
                icon.textContent = s.icon || '';
                item.appendChild(icon);
                const title = document.createElement('div');
                title.className = 'suggestion-title';
                title.textContent = s.title || '';
                item.appendChild(title);
                const desc = document.createElement('div');
                desc.className = 'suggestion-desc';
                desc.textContent = s.desc || '';
                item.appendChild(desc);
                sug.appendChild(item);
            });
        }
    };

    // ---- personal-info + education：about 页 ----
    const renderPersonalBio = function (sec, data) {
        const p = data.personal || {};
        const bio = sec.querySelector('[data-bio-paragraphs]');
        if (bio) {
            bio.innerHTML = '';
            (p.bio || []).forEach(function (text) {
                const p2 = document.createElement('p');
                p2.textContent = text;
                bio.appendChild(p2);
            });
        }
    };

    const renderEducation = function (sec, data) {
        const list = sec.querySelector('[data-education-list]');
        if (!list) return;
        list.innerHTML = '';
        (data.education || []).forEach(function (e) {
            const li = document.createElement('li');
            const period = document.createElement('div');
            period.className = 'exp-period';
            period.textContent = e.period;
            li.appendChild(period);
            const body = document.createElement('div');
            body.className = 'exp-body';
            const h3 = document.createElement('h3');
            h3.textContent = (e.school || '') + (e.department ? ' · ' + e.department : '');
            body.appendChild(h3);
            if (e.degree || e.advisor) {
                const p2 = document.createElement('p');
                let s = '';
                if (e.degree) s += e.degree;
                if (e.advisor) s += '　　导师：' + e.advisor;
                p2.textContent = s;
                body.appendChild(p2);
            }
            li.appendChild(body);
            list.appendChild(li);
        });
    };

    const renderSkills = function (sec, data) {
        const root = sec;
        root.innerHTML = '';
        const groups = [
            { title: '编程语言', items: (data.skills && data.skills.languages) || [] },
            { title: '工具与框架', items: (data.skills && data.skills.tools) || [] },
            { title: '语言能力', items: (data.skills && data.skills.spoken) || [] }
        ];
        groups.forEach(function (g) {
            if (!g.items.length) return;
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
                span.textContent = it.name + (it.level ? '（' + it.level + '）' : '');
                tags.appendChild(span);
            });
            grp.appendChild(tags);
            root.appendChild(grp);
        });
    };

    const renderAwards = function (sec, data) {
        const list = sec.querySelector('[data-awards-list]');
        if (!list) return;
        list.innerHTML = '';
        (data.awards || []).forEach(function (a) {
            const li = document.createElement('li');
            const s = document.createElement('strong');
            s.textContent = a.year + ' 年';
            li.appendChild(s);
            li.appendChild(document.createTextNode('　' + a.name));
            list.appendChild(li);
        });
    };

    // ============== Renderer 注册 ==============
    const RENDERERS = {
        'personal-hero': renderPersonalHero,
        'stats': renderStats,
        'overview': renderOverview,
        'news': renderNews,
        'featured-publications': renderFeaturedPubs,
        'all-publications': renderAllPubs,
        'research-directions': renderResearchDirs,
        'projects-list': renderProjects,
        'latest-posts': renderLatestPosts,
        'all-posts': renderAllPosts,
        'books': renderBooks,
        'hobbies': renderHobbies,
        '404-page': render404,
        'personal-bio': renderPersonalBio,
        'education': renderEducation,
        'skills': renderSkills,
        'awards': renderAwards
    };

    // ============== 工具函数 ==============
    function setText(parent, selector, text) {
        if (!text && text !== '') return;
        const el = parent.querySelector(selector);
        if (el) el.textContent = text;
    }

    function handleError(err) {
        console.error('[page-renderer] 加载 data.json 失败：', err);
        while (mainRoot.firstChild) mainRoot.removeChild(mainRoot.firstChild);
        const p = document.createElement('p');
        p.className = 'page-error';
        p.style.cssText = 'color: var(--color-error, #c00); padding: 1rem; border: 1px solid currentColor; border-radius: 4px;';
        p.textContent = '无法加载 data.json (' + err.message + ')。请检查文件是否存在。';
        mainRoot.appendChild(p);
    }
})();
