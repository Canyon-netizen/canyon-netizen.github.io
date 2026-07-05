// ========================================
// CV 渲染器：从 data.json 读取并填充 #cv-content
// 支持中英文双语（根据 page meta.htmlLang 切换）
// ========================================
(function () {
    'use strict';

    const root = document.getElementById('cv-content');
    if (!root) return;

    document.addEventListener('partials:loaded', init);

    const meta = window.__PAGE_META__ || {};
    const isEnglish = meta.htmlLang === 'en' || /^\/en\//.test(location.pathname);

    // 字段取词辅助：英文版优先用 xxxEn 字段，否则原字段
    function pick(obj, base) {
        if (!obj) return '';
        if (isEnglish && obj[base + 'En'] != null) return obj[base + 'En'];
        return obj[base] != null ? obj[base] : '';
    }

    // 文案：section 标题 + 行内 label
    const T = {
        sectionTitles: isEnglish
            ? ['Basic Information', 'Education', 'Research', 'Internships', 'Publications', 'Awards', 'Skills']
            : ['基本信息', '教育背景', '研究经历', '实习经历', '论文发表', '获奖经历', '技能清单'],
        skillGroups: isEnglish
            ? ['Programming Languages', 'Frameworks & Tools']
            : ['编程语言', '框架与工具'],
        personalLabels: isEnglish
            ? ['Name:', 'Email:', 'Phone:', 'Address:', 'GitHub:', 'Homepage:', 'Google Scholar:']
            : ['姓名：', '邮箱：', '电话：', '地址：', 'GitHub：', '个人主页：', 'Google Scholar：'],
        contributionPrefix: isEnglish ? 'Contributions: ' : '主要贡献：',
        noData: isEnglish ? '(none yet)' : '（暂无）',
    };

    function init() {
        const basePath = meta.basePath || '';
        const dataUrl = basePath + 'data.json';

        fetch(dataUrl, { credentials: 'same-origin' })
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(renderAll)
            .catch(handleError);
    }

    function renderAll(data) {
        // 重建 7 个 section 外骨架（根据 isEnglish 决定哪些）
        rebuildSections();
        renderPersonal(data.personal);
        renderEducation(data.education || []);
        renderResearch(data.research || []);
        renderInternships(data.internships || []);
        renderPublications(data.publications || []);
        renderAwards(data.awards || []);
        renderSkills(data.skills || {});
        document.dispatchEvent(new CustomEvent('cv:rendered'));
    }

    // 重建 section 外骨架（清空 root，按双语需要构造 7 个 section）
    function rebuildSections() {
        while (root.firstChild) root.removeChild(root.firstChild);
        for (let i = 0; i < T.sectionTitles.length; i++) {
            const sec = document.createElement('section');
            sec.className = 'content-block';
            const h2 = document.createElement('h2');
            h2.textContent = T.sectionTitles[i];
            sec.appendChild(h2);
            // section 0/1/2/3/4/5 需要 ul 容器
            if (i < 6) {
                const ul = document.createElement('ul');
                // 0: info-list, 1/2/3: exp-list, 4/5: award-list
                if (i === 0) ul.className = 'info-list';
                else if (i <= 3) ul.className = 'exp-list';
                else ul.className = 'award-list';
                sec.appendChild(ul);
            }
            // section 6 (Skills) 不需要预创建 ul
            root.appendChild(sec);
        }
    }

    function getSection(index) {
        return root.querySelectorAll('section.content-block')[index];
    }

    // ----- Section 0: 基本信息 -----
    function renderPersonal(p) {
        if (!p) return;
        const sec = getSection(0);
        if (!sec) return;
        const ul = sec.querySelector('ul.info-list');
        if (!ul) return;
        ul.innerHTML = '';

        const online = p.online || {};
        const rows = [
            { value: pick(p, 'name') },
            { value: pick(p, 'email') },
            { value: pick(p, 'phone') },
            { value: p.address && (isEnglish
                ? [p.address.university, pick(p.address, 'city'), pick(p.address, 'country')].filter(Boolean).join(', ')
                : p.address.full) },
            { value: online.github ? 'github.com/' + online.github : '' },
            { value: online.homepage ? online.homepage.replace(/^https?:\/\//, '') : '' },
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
    }

    // ----- Section 1: 教育背景 -----
    function renderEducation(arr) {
        const sec = getSection(1);
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        arr.forEach(function (e) {
            ul.appendChild(makeExpItem(
                e.period,
                pick(e, 'school') + (e.department ? ' · ' + pick(e, 'department') : ''),
                makeEduP(e)
            ));
        });
    }

    function makeEduP(e) {
        if (isEnglish) {
            // English: "Advisor: Prof. XXX　　GPA: X.X/4.0"
            const parts = [];
            const advisor = e.advisor;
            if (advisor) parts.push('Advisor: ' + advisor);
            if (e.gpa) parts.push('GPA: ' + e.gpa);
            return parts.length ? parts.join('　　') : null;
        } else {
            // Chinese: "博士研究生　　导师：XXX 教授"
            const degree = pick(e, 'degree');
            const advisor = e.advisor;
            if (!degree) return null;
            return advisor ? (degree + '　　导师：' + advisor) : degree;
        }
    }

    // ----- Section 2: 研究经历 -----
    function renderResearch(arr) {
        const sec = getSection(2);
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        arr.forEach(function (r) {
            const li = document.createElement('li');
            li.appendChild(makeExpPeriod(r.period));
            const body = document.createElement('div');
            body.className = 'exp-body';
            const h3 = document.createElement('h3');
            h3.textContent = r.title || '';
            body.appendChild(h3);
            if (r.description) body.appendChild(makeP(r.description));
            if (r.contributions && r.contributions.length) {
                body.appendChild(makeP(T.contributionPrefix + r.contributions.join('、')));
            }
            li.appendChild(body);
            ul.appendChild(li);
        });
    }

    // ----- Section 3: 实习经历 -----
    function renderInternships(arr) {
        const sec = getSection(3);
        if (!sec) return;
        const ul = sec.querySelector('ul.exp-list');
        if (!ul) return;
        ul.innerHTML = '';
        arr.forEach(function (i) {
            ul.appendChild(makeExpItem(
                i.period,
                (i.company || '') + (i.role ? ' · ' + i.role : ''),
                i.description
            ));
        });
    }

    // ----- Section 4: 论文发表 -----
    function renderPublications(arr) {
        const sec = getSection(4);
        if (!sec) return;
        const ul = sec.querySelector('ul.award-list');
        if (!ul) return;
        ul.innerHTML = '';
        arr.forEach(function (p) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = (p.authors || []).join(', ');
            li.appendChild(strong);
            li.appendChild(document.createTextNode('. "' + (p.title || '') + '." '));
            const em = document.createElement('em');
            em.textContent = p.venue || '';
            li.appendChild(em);
            li.appendChild(document.createTextNode(', ' + (p.year || '') + '.'));
            ul.appendChild(li);
        });
    }

    // ----- Section 5: 获奖经历 -----
    function renderAwards(arr) {
        const sec = getSection(5);
        if (!sec) return;
        const ul = sec.querySelector('ul.award-list');
        if (!ul) return;
        ul.innerHTML = '';
        arr.forEach(function (a) {
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = (a.year || '') + (isEnglish ? '' : ' 年');
            li.appendChild(strong);
            li.appendChild(document.createTextNode('　' + (a.name || '')));
            ul.appendChild(li);
        });
    }

    // ----- Section 6: 技能清单 -----
    function renderSkills(skills) {
        const sec = getSection(6);
        if (!sec) return;
        // 只保留 h2
        const h2 = sec.querySelector('h2');
        sec.innerHTML = '';
        if (h2) sec.appendChild(h2);

        const groups = [
            { title: T.skillGroups[0], items: skills.languages || [] },
            { title: T.skillGroups[1], items: skills.frameworks || [] }
        ];
        groups.forEach(function (g) {
            if (!g.items.length) return;
            const group = document.createElement('div');
            group.className = 'skill-group';
            const h3 = document.createElement('h3');
            h3.textContent = g.title;
            group.appendChild(h3);
            const tags = document.createElement('div');
            tags.className = 'tags';
            g.items.forEach(function (it) {
                const span = document.createElement('span');
                span.className = 'tag';
                span.textContent = it.name + (it.level ? ('（' + it.level + '）') : '');
                tags.appendChild(span);
            });
            group.appendChild(tags);
            sec.appendChild(group);
        });
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
        if (pText) {
            div.appendChild(makeP(pText));
        }
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
        p.style.cssText = 'color: var(--color-error, #c00); padding: 1rem; border: 1px solid currentColor; border-radius: 4px;';
        const msg = isEnglish
            ? 'Failed to load data.json (' + err.message + '). Please check the file exists.'
            : '无法加载 data.json (' + err.message + ')。请检查文件是否存在。';
        p.textContent = msg;
        root.appendChild(p);
    }
})();
