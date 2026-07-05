// ========================================
// CV 渲染器：从 data.json 读取并填充 #cv-content
// ========================================
(function () {
    'use strict';

    const root = document.getElementById('cv-content');
    if (!root) return;

    // 等待 partials 注入完成后再开始 fetch（FOUC 防护 + partial 优先级）
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
            .then(renderAll)
            .catch(handleError);
    }

    function renderAll(data) {
        renderPersonal(data.personal);
        renderList('ul.exp-list', 0, data.education, renderEducationItem);
        renderList('ul.exp-list', 1, data.research, renderResearchItem);
        renderList('ul.exp-list', 2, data.internships, renderInternshipItem);
        renderList('ul.award-list', 0, data.publications, renderPublicationItem);
        renderList('ul.award-list', 1, data.awards, renderAwardItem);
        renderSkills(data.skills);
        document.dispatchEvent(new CustomEvent('cv:rendered'));
    }

    function getSection(index) {
        return root.querySelectorAll('section.content-block')[index];
    }

    function getList(sectionIndex) {
        const sec = getSection(sectionIndex);
        return sec ? sec.querySelector('ul') : null;
    }

    function renderList(listSelector, sectionIndex, arr, itemFn) {
        const sec = getSection(sectionIndex);
        if (!sec) return;
        const ul = sec.querySelector(listSelector);
        if (!ul) return;
        ul.innerHTML = '';
        (arr || []).forEach(function (item) {
            ul.appendChild(itemFn(item));
        });
    }

    // ----- Section 1: 基本信息 -----
    function renderPersonal(p) {
        if (!p) return;
        const sec = getSection(0);
        if (!sec) return;
        const ul = sec.querySelector('ul.info-list');
        if (!ul) return;
        ul.innerHTML = '';

        const rows = [
            { label: '姓名：', value: p.name },
            { label: '邮箱：', value: p.email },
            { label: '电话：', value: p.phone },
            { label: '地址：', value: p.address && p.address.full },
            { label: 'GitHub：', value: p.online && p.online.github ? 'github.com/' + p.online.github : null },
            { label: '个人主页：', value: p.online && p.online.homepage ? p.online.homepage.replace(/^https?:\/\//, '') : null },
        ];
        if (p.online && p.online.scholar) {
            rows.push({ label: 'Google Scholar：', value: p.online.scholar });
        }

        rows.forEach(function (r) {
            if (!r.value) return;
            const li = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = r.label;
            li.appendChild(strong);
            li.appendChild(document.createTextNode(' ' + r.value));
            ul.appendChild(li);
        });
    }

    // ----- Section 2: 教育背景 -----
    function renderEducationItem(e) {
        const li = document.createElement('li');
        li.appendChild(makeExpPeriod(e.period));
        li.appendChild(makeExpBody(
            (e.school || '') + (e.department ? ' · ' + e.department : ''),
            e.degree ? ((e.advisor ? (e.degree + '　　导师：' + e.advisor) : e.degree)) : null
        ));
        return li;
    }

    // ----- Section 3: 研究经历 -----
    function renderResearchItem(r) {
        const li = document.createElement('li');
        li.appendChild(makeExpPeriod(r.period));
        const body = makeExpBody(r.title, null);
        if (r.description) body.appendChild(makeP(r.description));
        if (r.contributions && r.contributions.length) {
            body.appendChild(makeP('主要贡献：' + r.contributions.join('、')));
        }
        li.appendChild(body);
        return li;
    }

    // ----- Section 4: 实习经历 -----
    function renderInternshipItem(i) {
        const li = document.createElement('li');
        li.appendChild(makeExpPeriod(i.period));
        li.appendChild(makeExpBody(
            (i.company || '') + (i.role ? ' · ' + i.role : ''),
            i.description
        ));
        return li;
    }

    // ----- Section 5: 论文发表 -----
    function renderPublicationItem(p) {
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = (p.authors || []).join(', ');
        li.appendChild(strong);
        li.appendChild(document.createTextNode('. "' + (p.title || '') + '." '));
        const em = document.createElement('em');
        em.textContent = p.venue || '';
        li.appendChild(em);
        li.appendChild(document.createTextNode(', ' + (p.year || '') + '.'));
        return li;
    }

    // ----- Section 6: 获奖经历 -----
    function renderAwardItem(a) {
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = (a.year || '') + ' 年';
        li.appendChild(strong);
        li.appendChild(document.createTextNode('　' + (a.name || '')));
        return li;
    }

    // ----- Section 7: 技能清单 -----
    function renderSkills(skills) {
        const sec = getSection(6);
        if (!sec) return;
        // 清空原 sec 内容（除 h2 外）
        const h2 = sec.querySelector('h2');
        sec.innerHTML = '';
        if (h2) sec.appendChild(h2);

        const groups = [
            { title: '编程语言', items: skills.languages || [] },
            { title: '框架与工具', items: skills.frameworks || [] }
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
        // 清空 root 内容并显示错误（避免显示空 section）
        while (root.firstChild) root.removeChild(root.firstChild);
        const p = document.createElement('p');
        p.className = 'cv-error';
        p.style.cssText = 'color: var(--color-error, #c00); padding: 1rem; border: 1px solid currentColor; border-radius: 4px;';
        p.textContent = '无法加载 data.json (' + err.message + ')。请检查文件是否存在。';
        root.appendChild(p);
    }
})();
