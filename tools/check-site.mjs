/* ============================================================
 * 站点自检脚本（无第三方依赖）
 * 用法：node tools/check-site.mjs
 * 检查项：
 *   1. 所有 .js 语法（node --check 等价方式：new Function / vm 编译）
 *   2. 所有 .json 可解析（data.json / manifest.json / search-index*.json）
 *   3. 每个页面：模板 include 对应的 partial 是否存在、引用的本地 css/js/图片是否存在
 *   4. 每个页面的 data-section 是否都有渲染器实现（对照 page-renderer.js 的 RENDERERS）
 *   5. 站内 HTML 链接（*.html）是否存在
 *   6. 占位符残留扫描（{{...}} / __BASE__ / 明显的 XXX 占位文案）
 * 退出码：存在 error 级问题则为 1。
 * ============================================================ */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();
const errors = [];
const warnings = [];
const info = [];

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.dsh']);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (IGNORE_DIRS.has(name)) continue;
        if (name.startsWith('.dsh-')) continue; // 验证脚本产生的临时文件
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const allFiles = walk(ROOT);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

/* ---------- 1. JS 语法 ---------- */
const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
for (const f of jsFiles) {
    const code = readFileSync(f, 'utf8');
    try {
        new vm.Script(code, { filename: f });
    } catch (err) {
        errors.push({ kind: 'js-syntax', file: rel(f), message: err.message });
    }
}
info.push(`JS 校验 ${jsFiles.length} 个文件`);

/* ---------- 2. JSON ---------- */
const jsonFiles = allFiles.filter((f) => f.endsWith('.json'));
const jsonData = {};
for (const f of jsonFiles) {
    try {
        jsonData[rel(f)] = JSON.parse(readFileSync(f, 'utf8'));
    } catch (err) {
        errors.push({ kind: 'json-parse', file: rel(f), message: err.message });
    }
}
info.push(`JSON 校验 ${jsonFiles.length} 个文件`);

/* ---------- data.json 结构轻校验 ---------- */
const data = jsonData['data.json'];
if (data) {
    const need = ['personal', 'stats', 'news', 'overview', 'publications', 'projects',
        'books', 'hobbies', 'posts', 'researchDirections', 'education', 'skills'];
    for (const k of need) {
        if (!(k in data)) warnings.push({ kind: 'data-missing-key', file: 'data.json', message: k });
    }
    // 作者字段必须是字符串或对象数组（对象数组要能被渲染器处理）
    (data.publications || []).forEach((p, i) => {
        if (!Array.isArray(p.authors)) return;
        p.authors.forEach((a, j) => {
            if (typeof a !== 'string' && (typeof a !== 'object' || a === null)) {
                errors.push({ kind: 'data-author-type', file: 'data.json', message: `publications[${i}].authors[${j}] 类型异常` });
            }
        });
    });
    // 明显的占位文案（会直接出现在展示层）
    const raw = readFileSync(join(ROOT, 'data.json'), 'utf8');
    const placeholderPatterns = [/你的名字/, /XXX 教授/, /XXXXX/, /your\.email@example\.com/, /Your Name/];
    for (const re of placeholderPatterns) {
        if (re.test(raw)) warnings.push({ kind: 'placeholder-in-data', file: 'data.json', message: String(re) });
    }
} else {
    errors.push({ kind: 'missing-data-json', file: 'data.json', message: 'data.json 不存在或无法解析' });
}

/* ---------- RSS / sitemap 结构校验（由 tools/make-feeds.py 生成） ---------- */
function checkXmlFeed(file, requiredTags, isSitemap) {
    if (!existsSync(join(ROOT, file))) {
        errors.push({ kind: 'missing-feed', file, message: `${file} 不存在，请运行 python tools/make-feeds.py` });
        return;
    }
    const xml = readFileSync(join(ROOT, file), 'utf8');
    if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(xml.trim())) {
        warnings.push({ kind: 'feed-header', file, message: '缺少标准 XML 声明' });
    }
    for (const tag of requiredTags) {
        if (!xml.includes(`<${tag}`)) errors.push({ kind: 'feed-missing-tag', file, message: `缺少 <${tag}>` });
    }
    const opens = (xml.match(/<item>/g) || []).length + (xml.match(/<url>/g) || []).length;
    const closes = (xml.match(/<\/item>/g) || []).length + (xml.match(/<\/url>/g) || []).length;
    if (opens !== closes) errors.push({ kind: 'feed-unbalanced', file, message: `条目标签不配对：${opens} 开 / ${closes} 闭` });
    if (isSitemap) {
        // sitemap 里的每个 loc 都必须是绝对地址
        const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
        const bad = locs.filter((l) => !/^https:\/\//.test(l));
        if (bad.length) errors.push({ kind: 'sitemap-relative-loc', file, message: bad.slice(0, 3).join(', ') });
        if (!locs.length) errors.push({ kind: 'sitemap-empty', file, message: 'sitemap 没有任何 URL' });
        info.push(`sitemap：${locs.length} 个 URL`);
    } else {
        const titles = (xml.match(/<title>/g) || []).length;
        const items = (xml.match(/<item>/g) || []).length;
        info.push(`rss：${items} 篇文章`);
        if (titles !== items + 1) {
            warnings.push({ kind: 'rss-title-count', file, message: `<title> 数量 ${titles} 与 channel+item 不匹配` });
        }
    }
}
checkXmlFeed('rss.xml', ['channel', 'title', 'link', 'description', 'item'], false);
checkXmlFeed('rss-en.xml', ['channel', 'title', 'link', 'description', 'item'], false);
checkXmlFeed('sitemap.xml', ['urlset', 'url', 'loc'], true);

/* ---------- 搜索索引结构校验（由 tools/make-search-index.py 生成） ---------- */
for (const file of ['search-index.json', 'search-index-en.json']) {
    const idx = jsonData[file];
    if (!Array.isArray(idx)) {
        errors.push({ kind: 'search-index-missing', file, message: '不存在或不是数组，请运行 python tools/make-search-index.py' });
        continue;
    }
    if (!idx.length) errors.push({ kind: 'search-index-empty', file, message: '索引为空' });
    const byType = {};
    let noUrl = 0;
    idx.forEach((it) => {
        byType[it.type] = (byType[it.type] || 0) + 1;
        if (!it.url) noUrl++;
    });
    if (noUrl) errors.push({ kind: 'search-index-url', file, message: `${noUrl} 条缺少 url` });
    // 文章条目必须带正文，否则全文检索失效
    const posts = idx.filter((it) => it.type === 'post');
    const withBody = posts.filter((it) => it.body && it.body.length > 50).length;
    if (posts.length && withBody < posts.length) {
        warnings.push({ kind: 'search-index-body', file, message: `${posts.length - withBody} 篇文章缺少 body（全文检索会漏）` });
    }
    info.push(`${file}：${idx.length} 条 ${JSON.stringify(byType)}`);
}

/* ---------- 3~6. HTML ---------- */
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
const partials = allFiles.filter((f) => rel(f).startsWith('partials/')).map(rel);

// 渲染器清单
const rendererSrc = existsSync(join(ROOT, 'assets/js/page-renderer.js'))
    ? readFileSync(join(ROOT, 'assets/js/page-renderer.js'), 'utf8')
    : '';
const RENDERERS = new Set();
{
    const block = rendererSrc.match(/const RENDERERS\s*=\s*\{([\s\S]*?)\};/);
    if (block) {
        for (const m of block[1].matchAll(/'([^']+)'\s*:/g)) RENDERERS.add(m[1]);
    }
    if (!RENDERERS.size) warnings.push({ kind: 'renderers-not-parsed', file: 'assets/js/page-renderer.js', message: '未能解析 RENDERERS 清单' });
}

const cssSrc = existsSync(join(ROOT, 'assets/css/style.css'))
    ? readFileSync(join(ROOT, 'assets/css/style.css'), 'utf8')
    : '';
const CSS_CLASSES = new Set();
for (const m of cssSrc.matchAll(/\.([a-zA-Z][\w-]*)/g)) CSS_CLASSES.add(m[1]);

for (const f of htmlFiles) {
    const r = rel(f);
    const isPartial = r.startsWith('partials/');
    // tools/ 下是本地验证用的辅助页面，不参与站点页面检查
    if (r.startsWith('tools/')) continue;
    const html = readFileSync(f, 'utf8');
    const dir = dirname(f);

    // 3a. template include
    for (const m of html.matchAll(/<template\s+data-include="([^"]+)"/g)) {
        const want = `partials/${m[1]}.html`;
        if (!existsSync(join(ROOT, want))) {
            errors.push({ kind: 'missing-partial', file: r, message: want });
        }
    }

    // 3b. 本地资源引用
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = m[1];
        if (/^(https?:|mailto:|tel:|#|data:|\/\/)/.test(url)) continue;
        const clean = url.split('#')[0].split('?')[0];
        if (!clean) continue;
        if (/\.(html|css|js|svg|png|jpe?g|webp|ico|json|xml|pdf|txt)$/i.test(clean) || clean.endsWith('/')) {
            // 相对路径要相对**当前页面所在目录**解析：blog/ 与 en/blog/ 下的页面
            // 用 ../ 或 ../../ 指回根目录，直接按根目录拼会误报。
            // 以 / 开头的是「站点根绝对路径」（404 页必须这么写，因为它会出现在任意深度），
            // 要相对仓库根解析。
            if (/__BASE|{{/.test(clean)) continue;
            const target = clean.startsWith('/') ? resolve(ROOT, '.' + clean) : resolve(dir, clean);
            if (!existsSync(target)) {
                // 可选资源：仓库里没有也不算缺陷（例如简历 PDF 待用户提供）
                const optional = /\.pdf$/i.test(clean);
                const bucket = optional ? warnings : errors;
                bucket.push({
                    kind: optional ? 'optional-asset-missing' : 'broken-local-ref',
                    file: r,
                    message: url
                });
            }
        }
    }

    // 4. data-section 与渲染器对照
    for (const m of html.matchAll(/data-section="([^"]+)"/g)) {
        const name = m[1];
        if (RENDERERS.size && !RENDERERS.has(name)) {
            errors.push({ kind: 'unknown-section', file: r, message: `${name} 没有对应渲染器` });
        }
    }

    // 5. 站内 html 链接
    for (const m of html.matchAll(/href="([^"#]+\.html)(?:#[^"]*)?"/g)) {
        const url = m[1];
        if (/^(https?:|mailto:)/.test(url)) continue;
        if (/__BASE|{{/.test(url)) continue;
        if (!existsSync(resolve(dir, url))) {
            errors.push({ kind: 'broken-page-link', file: r, message: url });
        }
    }

    // 5b. 结构化数据占位（JSON-LD 由 partial-loader 在运行时填入）
    // 槽位来自 head-base 片段，所以只要页面引用了该片段就算通过
    const hasHeadBase = /data-include="head-base"/.test(html);
    if (!hasHeadBase && !/data-ldjson="site"/.test(html) && !isPartial) {
        warnings.push({ kind: 'no-ldjson-slot', file: r, message: '页面既没有引入 head-base，也没有 JSON-LD 注入槽' });
    }

    // 6. 占位符残留（partial-loader 注入前允许，注入后必须替换干净）
    if (isPartial) continue;

    const leftover = html.match(/\{\{[a-zA-Z_][\w]*\}\}/g);
    if (leftover) {
        warnings.push({ kind: 'placeholder-in-page', file: r, message: [...new Set(leftover)].join(',') });
    }

    // 7. 页面元信息完整性
    if (!/window\.__PAGE_META__/.test(html)) {
        warnings.push({ kind: 'no-page-meta', file: r, message: '缺少 __PAGE_META__' });
    }
    if (!/rel="canonical"/.test(html)) {
        warnings.push({ kind: 'no-canonical', file: r, message: '缺少 canonical' });
    }
    if (!/<h1/.test(html) && !/data-section="personal-hero"/.test(html)) {
        warnings.push({ kind: 'no-h1', file: r, message: '页面没有 h1/hero' });
    }
}

/* ---------- 汇总 ---------- */
const result = {
    root: ROOT,
    counts: {
        html: htmlFiles.length,
        js: jsFiles.length,
        json: jsonFiles.length,
        partials: partials.length,
        renderers: [...RENDERERS],
        cssClasses: CSS_CLASSES.size
    },
    info,
    errors,
    warnings
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = errors.length ? 1 : 0;
