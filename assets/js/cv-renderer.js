// ========================================
// CV 渲染器：从 data.json 读取并填充 #cv-content
// 双语约定：英文页优先 xxxEn 字段（缺失回退中文），所有 UI 文案按语言分派。
// 事件契约：监听 partials:loaded 后渲染，完成派发 cv:rendered。
// ========================================
(function () {
    'use strict';

    const root = document.getElementById('cv-content');
    if (!root) return;

    const meta = window.__PAGE_META__ || {};
    const isEnglish = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);

    // partials 注入完成后渲染；若本脚本下载较慢、partials:loaded 已经派发过，直接初始化
    if (document.querySelector('template[data-include]')) {
        document.addEventListener('partials:loaded', init);
    } else {
        init();
    }

    // 单字段取词：英文页优先 xxxEn，缺失/为空时回退原字段
    function pick(obj, base) {
        if (!obj) return '';
        if (isEnglish) {
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

    // UI 文案：章节标题 / 行内标签 / 连接词都按语言分派，避免中英混排
    // 章节用「清单」描述，避免到处写死索引（此前 7 个 section 靠位置对应，
    // 少一个「项目经历」就整段消失且没人发现）
    const SECTIONS = [
        { key: 'personal', type: 'info-list', title: { zh: '基本信息', en: 'Basic Information' } },
        { key: 'education', type: 'exp-list', title: { zh: '教育背景', en: 'Education' } },
        { key: 'research', type: 'exp-list', title: { zh: '研究经历', en: 'Research' } },
        { key: 'projects', type: 'exp-list', title: { zh: '项目经历', en: 'Projects' } },
        { key: 'internships', type: 'exp-list', title: { zh: '实习经历', en: 'Internships' } },
        { key: 'publications', type: 'award-list', title: { zh: '论文发表', en: 'Publications' } },
        { key: 'awards', type: 'award-list', title: { zh: '获奖经历', en: 'Awards' } },
        { key: 'skills', type: null, title: { zh: '技能清单', en: 'Skills' } }
    ];

    const T = {
        skillGroups: isEnglish
            ? ['Programming Languages', 'Frameworks & Tools', 'Languages']
            : ['编程语言', '框架与工具', '语言能力'],
        personalLabels: isEnglish
            ? ['Name:', 'Email:', 'Phone:', 'Address:', 'GitHub:', 'Homepage:', 'Google Scholar:']
            : ['姓名：', '邮箱：', '电话：', '地址：', 'GitHub：', '个人主页：', 'Google Scholar：'],
        contributionPrefix: isEnglish ? 'Contributions: ' : '主要贡献：',
        advisorPrefix: isEnglish ? 'Advisor: ' : '导师：',
        listSep: isEnglish ? ', ' : '、',
        yearSuffix: isEnglish ? '' : ' 年'
    };

    function init() {
        const dataUrl = (meta.basePath || '') + 'data.json';

        const inline = readInlineData();
        if (inline) {
            renderAll(inline);
            return;
        }

        fetch(dataUrl, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(renderAll)
            .catch(handleError);
    }

    // 构建时内联的页面数据（见 tools/inline-page-data.py）；缺失时回退到 fetch
    function readInlineData() {
        const el = document.querySelector('script[type="application/json"][data-page-data]');
        if (!el) return null;
        try {
            const parsed = JSON.parse(el.textContent);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch (e) {
            return null;
        }
    }

    function renderAll(data) {
        rebuildSections();
        renderPersonal(data.personal);
        renderEducation(data.education || []);
        renderResearch(data.research || []);
        renderProjects(data.projects || []);
        renderInternships(data.internships || []);
        renderPublications(data.publications || []);
        renderAwards(data.awards || []);
        renderSkills(data.skills || {});
        // 自报渲染完成（验证脚本据此确定性等待）
        try { document.documentElement.dataset.dshRendered = '1'; } catch (e) { /* 忽略 */ }
        document.dispatchEvent(new CustomEvent('cv:rendered'));
    }

    // 重建 section 外骨架（清空 root，按 SECTIONS 清单构造，不依赖索引顺序）
    function rebuildSections() {
        while (root.firstChild) root.removeChild(root.firstChild);
        SECTIONS.forEach(function (spec) {
            const sec = document.createElement('section');
            sec.className = 'content-block';
            sec.setAttribute('data-cv-section', spec.key);
            const h2 = document.createElement('h2');
            h2.textContent = isEnglish ? spec.title.en : spec.title.zh;
            sec.appendChild(h2);
            if (spec.type) {
                const ul = document.createElement('ul');
                ul.className = spec.type;
                sec.appendChild(ul);
            }
            root.appendChild(sec);
        });
    }

    function getSection(key) {
        return root.querySelector('section[data-cv-section="' + key + '"]');
    }

    // 空数据降级：整块隐藏，避免出现「只有标题没有内容」的章节
    function hideSection(sec) {
        if (!sec) return;
        sec.hidden = true;
    }

    // ----- Section 0: 基本信息 -----
    function renderPersonal(p) {
        const sec = getSection('personal');
        if (!sec) return;
        const ul = sec.querySelector('ul.info-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!p) {
            hideSection(sec);
            return;
        }

        const online = p.online || {};
        const address = p.address || {};
        const rows = [
            { value: pick(p, 'name') },
            { value: pick(p, 'email') },
            { value: pick(p, 'phone') },
            {
                value: isEnglish
                    ? [pick(address, 'university'), pick(address, 'city'), pick(address, 'country')]
                        .filter(Boolean).join(', ')
                    : address.full
            },
            { value: online.github ? 'github.com/' + online.github : '' },
            { value: online.homepage ? String(online.homepage).replace(/^https?:\/\//, '') : '' }
        ];
        if (online.scholar) rows.push({ value: online.scholar });

        rows.forEach(function (r, i) {
            if (!r.value) return;
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = T.personalLabels[i];
            li.appendChild(strong);
            li.appendChild(document.createTextNode(' ' + r.value));
            ul.appendChild(li);
        });

        if (!ul.children.length) hideSection(sec);
    }

    // ----- Section 1: 教育背景 -----
    function renderEducation(arr) {
        const sec = getSection('education');
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!arr.length) {
            hideSection(sec);
            return;
        }
        arr.forEach(function (e) {
            const department = pick(e, 'department');
            ul.appendChild(makeExpItem(
                pick(e, 'period'),
                pick(e, 'school') + (department ? ' · ' + department : ''),
                makeEduP(e)
            ));
        });
    }

    function makeEduP(e) {
        const advisor = pick(e, 'advisor');
        if (isEnglish) {
            // English: "Ph.D. student　　Advisor: Prof. XXX　　GPA: 3.9/4.0"
            const parts = [];
            const degree = pick(e, 'degree');
            if (degree) parts.push(degree);
            if (advisor) parts.push(T.advisorPrefix + advisor);
            if (e.gpa) parts.push('GPA: ' + e.gpa);
            return parts.length ? parts.join('　　') : null;
        }
        // Chinese: "博士研究生　　导师：XXX 教授"
        const degree = pick(e, 'degree');
        if (!degree && !advisor) return null;
        return advisor ? ((degree ? degree + '　　' : '') + T.advisorPrefix + advisor) : degree;
    }

    // ----- 研究经历 -----
    function renderResearch(arr) {
        const sec = getSection('research');
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!arr.length) {
            hideSection(sec);
            return;
        }
        arr.forEach(function (r) {
            const li = document.createElement('li');
            li.appendChild(makeExpPeriod(pick(r, 'period')));
            const body = document.createElement('div');
            body.className = 'exp-body';
            const h3 = document.createElement('h3');
            h3.textContent = pick(r, 'title');
            body.appendChild(h3);

            const description = pick(r, 'description');
            if (description) body.appendChild(makeP(description));

            const contributions = pickList(r, 'contributions');
            if (contributions.length) {
                body.appendChild(makeP(T.contributionPrefix + contributions.join(T.listSep)));
            }
            li.appendChild(body);
            ul.appendChild(li);
        });
    }

    // ----- 项目经历 -----
    // 依赖 data.json 的 projects[]；技术栈与状态也带上，方便招聘方快速判断。
    // 完整项目列表在网站 projects 页，这里只列 cvFeatured !== false 的条目。
    function renderProjects(arr) {
        const sec = getSection('projects');
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        const list = arr.filter(function (p) { return p.cvFeatured !== false; }).slice(0, 3);
        if (!list.length) {
            hideSection(sec);
            return;
        }
        list.forEach(function (p) {
            const li = document.createElement('li');
            li.appendChild(makeExpPeriod(pick(p, 'statusLabel')));
            const body = document.createElement('div');
            body.className = 'exp-body';
            const h3 = document.createElement('h3');
            h3.textContent = pick(p, 'title');
            body.appendChild(h3);

            // 简历优先用 cvDescription（更短的一句），没有就退回完整描述
            const description = pick(p, 'cvDescription') || pick(p, 'description');
            if (description) body.appendChild(makeP(description));

            const tech = pickList(p, 'tech');
            if (tech.length) {
                body.appendChild(makeP((isEnglish ? 'Stack: ' : '技术栈：') + tech.join(T.listSep)));
            }

            const links = pickList(p, 'links');
            const hrefs = links
                .map(function (l) { return (l && l.href) ? String(l.href).replace(/^https?:\/\//, '') : ''; })
                .filter(Boolean);
            if (hrefs.length) {
                body.appendChild(makeP((isEnglish ? 'Links: ' : '链接：') + hrefs.join(' / ')));
            }
            li.appendChild(body);
            ul.appendChild(li);
        });
    }

    // ----- 实习经历 -----
    function renderInternships(arr) {
        const sec = getSection('internships');
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!arr.length) {
            hideSection(sec);
            return;
        }
        arr.forEach(function (i) {
            const role = pick(i, 'role');
            ul.appendChild(makeExpItem(
                pick(i, 'period'),
                pick(i, 'company') + (role ? ' · ' + role : ''),
                pick(i, 'description')
            ));
        });
    }

    // ----- Section 4: 论文发表 -----
    function renderPublications(arr) {
        const sec = getSection('publications');
        if (!sec) return;
        const ul = sec.querySelector('ul.award-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!arr.length) {
            hideSection(sec);
            return;
        }
        arr.forEach(function (p) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            // authors 是对象数组（{ name, isMe, ... }）：旧实现直接 join 会得到 [object Object]
            strong.textContent = pickList(p, 'authors').map(authorText).join(T.listSep);
            li.appendChild(strong);
            li.appendChild(document.createTextNode('. "' + pick(p, 'title') + '." '));
            const em = document.createElement('em');
            em.textContent = pick(p, 'venue');
            li.appendChild(em);
            li.appendChild(document.createTextNode(', ' + (p.year || '') + '.'));
            ul.appendChild(li);
        });
    }

    // 作者文本：对象取 name，并按 isMe/isCoFirst/isCorresponding 追加角标
    function authorText(a) {
        if (typeof a === 'string') return a;
        if (!a) return '';
        let name = a.name || '';
        let marks = '';
        if (a.isCoFirst && name.indexOf('†') === -1) marks += '†';
        if (a.isCorresponding && name.indexOf('*') === -1) marks += '*';
        return name + marks;
    }

    // ----- Section 5: 获奖经历 -----
    function renderAwards(arr) {
        const sec = getSection('awards');
        if (!sec) return;
        const ul = sec.querySelector('ul.award-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!arr.length) {
            hideSection(sec);
            return;
        }
        arr.forEach(function (a) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = (a.year || '') + T.yearSuffix;
            li.appendChild(strong);
            li.appendChild(document.createTextNode('　' + pick(a, 'name')));
            ul.appendChild(li);
        });
    }

    // ----- Section 6: 技能清单 -----
    function renderSkills(skills) {
        const sec = getSection('skills');
        if (!sec) return;
        const h2 = sec.querySelector('h2');
        sec.innerHTML = '';
        if (h2) sec.appendChild(h2);

        // 真实 bug 修复：data.json 用的是 skills.tools（旧代码读 skills.frameworks → 永远缺一组）
        const groups = [
            { title: T.skillGroups[0], items: skills.languages || [] },
            { title: T.skillGroups[1], items: skills.tools || [] },
            { title: T.skillGroups[2], items: skills.spoken || [] }
        ].filter(function (g) { return g.items.length; });

        if (!groups.length) {
            sec.hidden = true;
            return;
        }

        groups.forEach(function (g) {
            const group = document.createElement('div');
            group.className = 'skill-group';
            const h3 = document.createElement('h3');
            h3.textContent = g.title;
            group.appendChild(h3);
            const tags = document.createElement('div');
            tags.className = 'tags';
            g.items.forEach(function (it) {
                const level = pick(it, 'level');
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = pick(it, 'name') + (level ? levelSuffix(level) : '');
                tags.appendChild(span);
            });
            group.appendChild(tags);
            sec.appendChild(group);
        });
    }

    function levelSuffix(level) {
        return isEnglish ? ' (' + level + ')' : '（' + level + '）';
    }

    // ----- helpers -----
    function makeExpItem(period, h3Text, pText) {
        const li = document.createElement('li');
        li.appendChild(makeExpPeriod(period));
        li.appendChild(makeExpBody(h3Text, pText));
        return li;
    }

    function makeExpPeriod(text) {
        const div = document.createElement('div');
        div.className = 'exp-period';
        div.textContent = text || '';
        return div;
    }

    function makeExpBody(h3Text, pText) {
        const div = document.createElement('div');
        div.className = 'exp-body';
        if (h3Text) {
            const h3 = document.createElement('h3');
            h3.textContent = h3Text;
            div.appendChild(h3);
        }
        if (pText) div.appendChild(makeP(pText));
        return div;
    }

    function makeP(text) {
        const p = document.createElement('p');
        p.textContent = text;
        return p;
    }

    function handleError(err) {
        console.error('[cv-renderer] 加载 data.json 失败：', err);
        while (root.firstChild) root.removeChild(root.firstChild);
        const p = document.createElement('p');
        p.className = 'cv-error';
        p.textContent = isEnglish
            ? 'Failed to load data.json (' + err.message + '). Please check that the file exists.'
            : '无法加载 data.json (' + err.message + ')。请检查文件是否存在。';
        root.appendChild(p);
    }
})();
