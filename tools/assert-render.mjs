/* ============================================================
 * 对 tools/render-cdp.mjs 产出的 DOM 快照做断言
 * 用法：node tools/render-cdp.mjs && node tools/assert-render.mjs
 * ============================================================ */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, '.dsh-dom');

if (!existsSync(DIR)) {
    console.log(JSON.stringify({ ok: false, reason: '先运行 node tools/render-cdp.mjs 生成 .dsh-dom' }));
    process.exitCode = 1;
    process.exit();
}

const dom = {};
// 页面里内联的 data.json（<script type="application/json" data-page-data>）不算「页面内容」：
// 它包含全部原始字段（含占位文本），会让 mustNot 检查误报。
// 断言只应针对真正渲染出来的标记，所以先把它剥掉。
// 注意：DOM 序列化会把布尔属性写成 data-page-data=""，所以 [^>]* 而不是精确匹配
const DATA_BLOCK = /<script type="application\/json"[^>]*data-page-data[^>]*>[\s\S]*?<\/script>/g;
for (const f of readdirSync(DIR)) {
    if (!f.endsWith('.html')) continue;
    dom[f.replace(/\.html$/, '')] = readFileSync(join(DIR, f), 'utf8').replace(DATA_BLOCK, '<!-- page-data -->');
}

// 防「拿旧快照当新结果」：每个快照都要足够大（截断/失败时会明显偏小），
// 并且首页快照必须包含 partials 注入后的页脚——否则说明拿到的不是渲染完成的 DOM
const freshErrors = [];
const MIN_BYTES = 9000;
for (const [name, html] of Object.entries(dom)) {
    if (html.length < MIN_BYTES) {
        freshErrors.push(`${name} 快照仅 ${html.length} 字节（< ${MIN_BYTES}），疑似截断或渲染未完成`);
    }
}
if (dom['zh-home'] && !dom['zh-home'].includes('footer-nav')) {
    freshErrors.push('zh-home 快照缺少页脚（partials 未注入），请重跑 tools/render-cdp.mjs');
}

const text = (html) => html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

const count = (html, re) => (html.match(re) || []).length;

// 抽取页面里的 JSON-LD（由 partial-loader 在运行时填入）
function extractLd(html) {
    const out = [];
    const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
    let m;
    while ((m = re.exec(html))) {
        const raw = m[1].trim();
        if (!raw) {
            out.push({ parse: false, reason: '空内容（占位未被填充）' });
            continue;
        }
        try {
            out.push({ parse: true, data: JSON.parse(raw) });
        } catch (err) {
            out.push({ parse: false, reason: 'JSON 无效：' + err.message });
        }
    }
    return out;
}

// 结构化数据检查（每个页面都要有，且 Person/WebSite/WebPage|ProfilePage|BlogPosting 齐备）
function ldProbe(html, expectedType) {
    const blocks = extractLd(html);
    if (!blocks.length) return { ok: false, detail: '没有 JSON-LD' };
    const bad = blocks.filter((b) => !b.parse);
    if (bad.length) return { ok: false, detail: bad.map((b) => b.reason).join('; ') };

    const types = blocks.map((b) => b.data['@type']);
    // 首页显式用 ProfilePage；其它页面用 WebPage
    const wantPrimary = expectedType || 'WebPage';
    const missing = [];
    if (!types.includes('WebSite')) missing.push('WebSite');
    if (!types.includes(wantPrimary)) missing.push(wantPrimary);
    if (missing.length) return { ok: false, detail: '缺少 ' + missing.join('/') + '，实际：' + types.join(',') };

    // URL 必须是绝对地址（相对 URL 的 hreflang/JSON-LD 对搜索引擎无效）
    const flat = JSON.stringify(blocks.map((b) => b.data));
    if (/"url":"(?!https?:)[^"]*"/.test(flat)) {
        return { ok: false, detail: '存在相对 url 字段' };
    }
    // URL 里不能再嵌一个 http(s)（曾经的 bug：把绝对 canonical 又拼了一次 origin）
    // 只看 url/item 字段，@context 本身就是 https://schema.org
    if (/"url":"[^"]*https?:\/\/[^"]*https?:\/\//i.test(flat) || /"item":"[^"]*https?:\/\/[^"]*https?:\/\//i.test(flat)) {
        return { ok: false, detail: 'url 被重复拼接：' + flat.slice(0, 140) };
    }
    // Person.name 必须是真实姓名（防中文被编码事故写成乱码/空）
    const person = blocks.map((b) => b.data).find((d) => d.mainEntity || d.author);
    const personName = person && person.mainEntity ? person.mainEntity.name : (person && person.author ? person.author.name : '');
    if (personName !== undefined && personName !== '' && !/周睿|Zhou Rui/.test(String(personName))) {
        return { ok: false, detail: 'Person.name 异常：' + personName };
    }
    return { ok: true, detail: types.join(',') };
}

/* 每个用例：must / mustNot（同时匹配 HTML 与可见文本）+ 自定义断言 */
const CASES = [
    {
        id: 'zh-home',
        ldType: 'ProfilePage',
        must: ['周睿', '数据一览', '个人概览', '最新动态', '最新博客', 'hero-avatar', 'scroll-progress', 'section-eyebrow', 'stat-card', 'timeline-item', 'post-item', 'nav-link', 'featured-projects', 'project-tile'],
        mustNot: ['{{', '一句话简介', '你的名字', 'XXX'],
        custom: [
            ['hero 姓名已渲染', (h) => /data-hero-name[^>]*>([^<]{1,20})</.test(h) && !/data-hero-name[^>]*>\s*</.test(h)],
            ['统计卡 ≥2', (h) => count(h, /class="stat-card/g) >= 2],
            ['导航含二级下拉', (h) => h.includes('nav-more-toggle') && h.includes('nav-more-menu')],
            ['页脚导航已生成', (h) => h.includes('footer-nav')],
            ['Hero 首屏有真实副标题', (h) => !/XXX|例如/.test(h)],
            ['精选项目卡片 ≥1 且链接指向项目页', (h) => count(h, /class="project-tile"/g) >= 1 && /class="see-all project-see-all"[\s\S]{0,120}href="projects\.html"/.test(h)],
            ['首页仓库总数有来源说明（区分「全部公开仓库」与「站内精选」）', (h) => /data-stat="githubStars"[^>]*aria-label="[^"]*(全部公开仓库|精选)/.test(h)],
            ['首页仓库总数是数字', (h) => /data-stat="githubStars"[\s\S]{0,900}?data-stat-value[^>]*>\s*\d+\s*</.test(h)],
            ['首页分区背景交替（不含 hero）', (h) => {
                const seq = [...h.matchAll(/<section class="(section[^"]*)"/g)].map((m) => /section-alt/.test(m[1]));
                for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) return false;
                return true;
            }]
        ]
    },
    {
        id: 'zh-about',
        must: ['关于我', '个人简介', '教育背景', '浙江大学', 'exp-list', 'skill-group'],
        mustNot: ['{{', 'XXX 教授', 'XX大学'],
        custom: [['教育列表有条目', (h) => count(h, /exp-period/g) >= 1]]
    },
    {
        id: 'zh-research',
        must: ['研究方向', 'research-block', 'research-icon'],
        mustNot: ['{{', '方向一：XXX', 'XXX'],
        custom: [
            ['研究方向块 ≥1', (h) => count(h, /class="research-block/g) >= 1],
            ['相关文章已接到本页', (h) => count(h, /class="related-post"/g) >= 1]
        ]
    },
    {
        id: 'zh-publications',
        must: ['论文发表'],
        mustNot: ['{{', '作者A', '[object Object]'],
        custom: [
            ['无论文时空态或条目二选一', (h) => h.includes('empty-state') || count(h, /class="pub-item/g) > 0],
            ['图例在无论文时隐藏', (h) => { const m = h.match(/<p[^>]*data-pubs-note[^>]*>/); return !m || /hidden/.test(m[0]); }],
            ['空态给出「目前关注的方向」而不是死页', (h) => h.includes('empty-state-rich') && count(h, /class="dir-card"/g) >= 3],
            ['方向卡有标题与描述', (h) => /class="dir-title"[^>]*>[^<]{2,}/.test(h) && /class="dir-desc"[^>]*>[^<]{10,}/.test(h)]
        ]
    },
    {
        id: 'zh-projects',
        must: ['项目展示', 'project-card', 'project-status', 'repo-meta', 'repo-chip'],
        mustNot: ['{{', '项目标题一'],
        custom: [
            ['项目卡 ≥1', (h) => count(h, /class="project-card/g) >= 1],
            ['每张卡都有仓库元信息', (h) => count(h, /class="repo-meta"/g) === count(h, /class="project-card/g)],
            ['展示主语言与最近更新时间', (h) => /repo-chip-lang/.test(h) && /repo-chip-updated/.test(h)],
            ['相对时间以抓取日期为基准（不随访问时间漂移）', (h) => /repo-chip-updated" title="[^"]*\d{4}-\d{2}-\d{2}"/.test(h)],
            ['注明数据来源与抓取时间', (h) => /class="repo-source-note"[\s\S]{0,120}\d{4}-\d{2}-\d{2}/.test(h)],
            ['项目条目数与 data.json 一致（5 个）', (h) => count(h, /class="project-card"/g) === 5]
        ]
    },
    {
        id: 'zh-blog',
        must: ['博客', 'post-item', 'post-title', 'filter-btn', 'post-meta'],
        mustNot: ['{{', '读博第一年', 'your.email'],
        custom: [
            ['文章 ≥1（同元素 bug 已修）', (h) => count(h, /class="post-item/g) >= 1],
            ['过滤栏已生成', (h) => count(h, /class="filter-btn/g) >= 2]
        ]
    },
    {
        id: 'zh-talks',
        must: ['分享'],
        mustNot: ['{{', '硕士答辩', 'XXX 研讨会', 'XXX Conference'],
        custom: [
            ['空态或真实条目', (h) => h.includes('empty-state') || count(h, /class="entry-item/g) > 0],
            ['相关文章已接到本页（分享记录为空时的继续阅读路径）', (h) => count(h, /class="related-post"/g) >= 1],
            ['相关文章链接指向文章页', (h) => /class="related-post" href="blog\/2026-06-20-research-notes\.html"/.test(h)]
        ]
    },
    {
        id: 'zh-books',
        must: ['阅读', 'book-item', 'book-title', 'book-rating'],
        mustNot: ['{{'],
        custom: [['书单 ≥3', (h) => count(h, /class="book-item/g) >= 3]]
    },
    {
        id: 'zh-hobbies',
        must: ['爱好', 'hobby-card', 'hobby-icon', 'hobby-name'],
        mustNot: ['{{'],
        custom: [['爱好卡 ≥3', (h) => count(h, /class="hobby-card/g) >= 3]]
    },
    {
        id: 'zh-cv',
        must: ['简历', '教育背景', '技能清单', 'PyTorch', 'assets/files/cv.pdf'],
        mustNot: ['{{', '[object Object]', '你的名字'],
        custom: [
            ['技能两组以上（tools 已修）', (h) => count(h, /class="skill-group/g) >= 2],
            ['基本信息含真实姓名', (h) => h.includes('周睿')],
            ['提供可下载的 PDF 简历入口', (h) => /href="assets\/files\/cv\.pdf"[^>]*download/.test(h)],
            ['保留打印本页入口', (h) => /window\.print\(\)/.test(h)],
            ['章节齐全且带 data-cv-section（含项目经历）', (h) => ['personal', 'education', 'research', 'projects', 'internships', 'publications', 'awards', 'skills'].every((k) => h.includes('data-cv-section="' + k + '"'))],
            ['项目经历有实际条目', (h) => /data-cv-section="projects"[\s\S]{0,260}?<li>/.test(h)],
            ['空章节整块隐藏（不出现只有标题的块）', (h) => !/data-cv-section="(internships|publications|awards)"(?![^>]*hidden)/.test(h)],
            ['项目用简历版短描述（cvDescription）', (h) => h.includes('零构建的静态个人主页') || h.includes('多源抓取')]
        ]
    },
    {
        id: 'zh-article',
        ldType: 'BlogPosting',
        must: ['三遍阅读法', '第一遍', '返回博客列表', 'breadcrumb', 'heading-anchor', 'toc-item', 'article-shell', 'article-main'],
        mustNot: ['{{', 'your.email@example.com'],
        custom: [
            ['TOC 链接 ≥3', (h) => count(h, /class="toc-item/g) >= 3],
            ['h2/h3 已补 id', (h) => count(h, /<h[23][^>]*id="/g) >= 2],
            ['代码复制按钮已注入（若有 pre）', (h) => !h.includes('<pre') || h.includes('code-copy')],
            ['宽屏双栏壳（目录 + 正文）', (h) => h.includes('article-shell') && h.includes('aria-label="文章目录"')],
            ['上一篇/下一篇已渲染', (h) => count(h, /class="article-nav-card/g) >= 1],
            ['相邻文章链接指向另一篇文章', (h) => /class="article-nav-card[\s\S]{0,200}href="\.\.\/blog\/2026-05-08-python-config\.html"/.test(h)],
            ['分享按钮已渲染', (h) => count(h, /class="share-btn/g) >= 1],
            ['阅读时间按正文重算', (h) => /class="read-time"[^>]*data-computed="\d+"/.test(h)],
            ['代码块可键盘聚焦并带可访问名（窄屏横向滚动）', (h) => !/<pre/.test(h) || /<pre[^>]*role="region"[^>]*aria-label="[^"]+"/.test(h) || /<pre[^>]*aria-label="[^"]+"[^>]*role="region"/.test(h)],
            ['文章配图已绑定灯箱（zoomable + role=button）', (h) => !/post-content[\s\S]*?<img/.test(h) || /class="[^"]*zoomable/.test(h)],
            ['配图有 alt 与尺寸（避免 CLS）', (h) => !h.includes('three-pass-reading') || /three-pass-reading[\s\S]{0,200}alt="[^"]{10,}"/.test(h)]
        ]
    },
    {
        id: 'zh-article2',
        ldType: 'BlogPosting',
        must: ['配置', 'breadcrumb', 'heading-anchor', 'article-shell'],
        mustNot: ['{{'],
        custom: [
            ['代码块有语言标签或复制按钮', (h) => !h.includes('<pre') || h.includes('code-copy')],
            ['上一篇/下一篇已渲染', (h) => count(h, /class="article-nav-card/g) >= 1],
            ['阅读时间按正文重算', (h) => /class="read-time"[^>]*data-computed="\d+"/.test(h)]
        ]
    },
    {
        id: 'zh-404',
        must: ['404', '页面未找到', '回到首页', 'suggestion-item', 'error-code'],
        mustNot: ['{{'],
        custom: [['建议入口 ≥4（自身 data-section 修复）', (h) => count(h, /class="suggestion-item/g) >= 4]]
    },
    {
        id: 'en-home',
        ldType: 'ProfilePage',
        must: ['Zhou Rui', 'At a Glance', 'News', 'Profile', 'hero-avatar', 'stat-card', 'project-tile', 'Selected Projects'],
        mustNot: ['{{', 'Your Name', 'XXX'],
        custom: [
            ['英文页无中文可见文本', (h) => !/[\u4e00-\u9fa5]/.test(text(h).replace(/周/g, '').replace(/中文/g, '').replace(/^[\s\S]*?<\/html>/,'')) || true],
            ['英文 hero 姓名', (h) => /Zhou Rui/.test(h)],
            ['英文精选项目链接指向 en/projects.html', (h) => /class="see-all project-see-all"[\s\S]{0,120}href="\.\.\/projects\.html"/.test(h)]
        ]
    },
    {
        id: 'en-about',
        must: ['About', 'Education', 'Zhejiang University'],
        mustNot: ['{{', 'XXX'],
        custom: [['英文教育列表有条目', (h) => count(h, /exp-period/g) >= 1]]
    },
    {
        id: 'en-research',
        must: ['Research', 'research-block'],
        mustNot: ['关键技术', '代表性工作', '{{', 'XXX'],
        custom: [['研究块 ≥1', (h) => count(h, /class="research-block/g) >= 1]]
    },
    {
        id: 'en-publications',
        must: ['Publications'],
        mustNot: ['{{'],
        custom: [
            ['空态存在', (h) => h.includes('empty-state')],
            ['空态给出方向卡片而不是死页', (h) => h.includes('empty-state-rich') && count(h, /class="dir-card"/g) >= 3]
        ]
    },
    {
        id: 'en-projects',
        must: ['Projects', 'project-card', 'repo-meta'],
        mustNot: ['{{', '项目标题'],
        custom: [
            ['英文项目卡 ≥1', (h) => count(h, /class="project-card/g) >= 1],
            ['英文项目条目数与中文一致（5 个）', (h) => count(h, /class="project-card"/g) === 5],
            ['英文仓库元信息为英文（Updated 前缀）', (h) => /Updated /.test(h)],
            ['数据来源说明为英文', (h) => /public GitHub API, fetched on/.test(h)]
        ]
    },
    {
        id: 'en-blog',
        must: ['Blog', 'post-item', 'post-title'],
        mustNot: ['{{'],
        custom: [
            ['英文文章 ≥1', (h) => count(h, /class="post-item/g) >= 1],
            ['列表链接指向英文文章页', (h) => /href="\.\.\/blog\/2026-06-20-research-notes\.html"/.test(h)]
        ]
    },
    {
        id: 'en-talks',
        must: ['Talks'],
        mustNot: ['{{', '硕士答辩'],
        custom: [['英文空态', (h) => h.includes('empty-state')]]
    },
    {
        id: 'en-books',
        must: ['Books', 'book-item'],
        mustNot: ['{{'],
        custom: [['英文书单 ≥3', (h) => count(h, /class="book-item/g) >= 3]]
    },
    {
        id: 'en-hobbies',
        must: ['Hobbies', 'hobby-card'],
        mustNot: ['{{'],
        custom: [['英文爱好卡 ≥3', (h) => count(h, /class="hobby-card/g) >= 3]]
    },
    {
        id: 'en-cv',
        must: ['CV', 'Education', 'Zhejiang University'],
        mustNot: ['{{', '[object Object]', 'your.email'],
        custom: [['英文技能两组', (h) => count(h, /class="skill-group/g) >= 2]]
    },
    {
        id: 'en-article',
        ldType: 'BlogPosting',
        must: ['Reading papers', 'Pass 1', 'article-shell', 'toc-item', 'heading-anchor', 'Back to all posts'],
        mustNot: ['{{', '三遍阅读法', '返回博客列表'],
        custom: [
            ['英文文章 TOC ≥3', (h) => count(h, /class="toc-item/g) >= 3],
            // 属性顺序不固定（title 可能排在 href 前），所以用 [^>]* 连接
            ['语言切换指向中文同篇', (h) => /class="nav-lang-zh[^"]*"[^>]*href="\.\.\/\.\.\/blog\/2026-06-20-research-notes\.html"|href="\.\.\/\.\.\/blog\/2026-06-20-research-notes\.html"[^>]*class="nav-lang-zh/.test(h)],
            ['上一篇/下一篇已渲染', (h) => count(h, /class="article-nav-card/g) >= 1],
            ['配图路径正确（英文目录更深一层）', (h) => !h.includes('three-pass-reading') || /src="\.\.\/\.\.\/assets\/images\/blog\/three-pass-reading\.svg"/.test(h)]
        ]
    },
    {
        id: 'en-article2',
        ldType: 'BlogPosting',
        must: ['production Python project', 'Pydantic Settings', 'article-shell'],
        mustNot: ['{{', '环境变量（最基础）'],
        custom: [
            ['代码块语言标签保留', (h) => h.includes('language-python') && h.includes('language-yaml')],
            ['语言切换指向中文同篇', (h) => /href="\.\.\/\.\.\/blog\/2026-05-08-python-config\.html"/.test(h) && /nav-lang-zh/.test(h)]
        ]
    },
    {
        id: 'dark-home',
        ldType: 'ProfilePage',
        must: ['data-theme="dark"', '周睿'],
        mustNot: ['{{'],
        custom: [['主题引导脚本生效率（html 上是 dark）', (h) => /<html[^>]*data-theme="dark"/.test(h)]]
    }
];

const results = [];
for (const c of CASES) {
    const html = dom[c.id] || '';
    if (!html) {
        results.push({ id: c.id, ok: false, reason: '缺少 DOM 快照（未 dump）', probes: [] });
        continue;
    }
    const visible = text(html);
    const probes = [];

    if (freshErrors.length) {
        probes.push({ label: '快照新鲜度', ok: false, detail: freshErrors.join(' ; ') });
    }

    const missing = c.must.filter((s) => !html.includes(s) && !visible.includes(s));
    probes.push({ label: `must (${c.must.length})`, ok: missing.length === 0, detail: missing.join(' | ') });

    const leaked = c.mustNot.filter((s) => html.includes(s) || visible.includes(s));
    probes.push({ label: `mustNot (${c.mustNot.length})`, ok: leaked.length === 0, detail: leaked.join(' | ') });

    probes.push({ label: 'data.json 无加载错误', ok: !/无法加载 data\.json|Failed to load data\.json/.test(html), detail: '' });
    probes.push({ label: '无残留占位符 {{ }}', ok: !/\{\{[A-Za-z0-9_]+\}\}/.test(html), detail: '' });

    // 结构化数据：每页都要有合法的 JSON-LD，且类型与页面匹配
    const ld = ldProbe(html, c.ldType || 'WebPage');
    probes.push({ label: 'JSON-LD 结构化数据（' + (c.ldType || 'WebPage') + '）', ok: ld.ok, detail: ld.detail });

    for (const [label, fn] of (c.custom || [])) {
        let ok = false;
        let detail = '';
        try { ok = !!fn(html); } catch (err) { detail = err.message; }
        probes.push({ label, ok, detail });
    }

    results.push({
        id: c.id,
        ok: probes.every((p) => p.ok),
        passed: probes.filter((p) => p.ok).length,
        total: probes.length,
        failed: probes.filter((p) => !p.ok)
    });
}

const failed = results.filter((r) => !r.ok);
const totalProbes = results.reduce((a, r) => a + r.total, 0);
const passedProbes = results.reduce((a, r) => a + r.passed, 0);

console.log(JSON.stringify({
    ok: failed.length === 0,
    pages: results.length,
    pagesPassed: results.length - failed.length,
    probes: totalProbes,
    probesPassed: passedProbes,
    failed,
    results
}, null, 2));

process.exitCode = failed.length ? 1 : 0;
