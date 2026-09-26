/* ============================================================
 * 404-search-probe.mjs — 验证 404 页「按 URL 关键词搜索」
 * ------------------------------------------------------------
 * 用一个最小静态服务器模拟 GitHub Pages 的 404 行为：
 *   未命中的路径返回 404.html 内容（同时保持 URL 不变），
 * 然后检查页面是否按路径里的关键词显示搜索入口。
 *
 * 用法：node tools/404-search-probe.mjs
 *
 * 注意：必须用本脚本自带的静态服务器，不能用 python -m http.server ——
 * 后者对 multi-segment 路径会做目录重定向，页面 JS 根本不会执行。
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const PORT = 8175;
const CDP_PORT = 9237;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.pdf': 'application/pdf'
};

const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!existsSync(file)) {
        // GitHub Pages 的行为：状态 404 + 404.html 内容，URL 不变
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(readFileSync(join(ROOT, '404.html')));
        return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findBrowser = () => [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
].find((c) => existsSync(c));

class CDP {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map();
        ws.addEventListener('message', (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (m.id && this.pending.has(m.id)) {
                const { resolve, reject, timer } = this.pending.get(m.id);
                clearTimeout(timer); this.pending.delete(m.id);
                m.error ? reject(new Error(m.error.message)) : resolve(m.result);
            }
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(method + ' timeout')); }, 30000);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify(payload));
        });
    }
    close() { try { this.ws.close(); } catch { /* ignore */ } }
}

const PROBE = `(() => {
  const box = document.querySelector('[data-404-search]');
  const hint = document.querySelector('[data-404-search-hint]');
  const btn = document.querySelector('[data-404-search-btn]');
  const sec = document.querySelector('[data-section]');
  // 用页面里同一套逻辑现场复算一次，便于区分「函数返回空」与「渲染没跑」
  const recalc = (() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const stop = ['en', 'zh', 'index', 'html', 'htm', 'blog', 'posts', 'pages'];
    const words = [];
    segments.forEach((seg) => {
      seg.replace(/\\.(html?|php|aspx?)$/i, '').split(/[-_+]+/).forEach((w) => {
        const clean = w.replace(/[^\\p{L}\\p{N}]+/gu, '').trim();
        if (!clean) return;
        if (stop.indexOf(clean.toLowerCase()) !== -1) return;
        if (/^\\d+$/.test(clean)) return;
        if (clean.length < 2) return;
        words.push(clean);
      });
    });
    return words.slice(0, 4).join(' ');
  })();
  const boxStyle = box ? getComputedStyle(box) : null;
  return {
    pathname: location.pathname,
    title: document.title,
    bodyChildren: document.body ? document.body.children.length : -1,
    hasPageContent: !!document.getElementById('page-content'),
    rendered: document.documentElement.dataset.dshRendered || null,
    renderError: document.documentElement.dataset.dshRenderError || null,
    sectionClass: sec ? sec.className : null,
    sectionHasError: sec ? sec.classList.contains('has-error') : null,
    hasSearchOverlay: !!document.getElementById('search-overlay'),
    hasSearchApi: !!(window.__SITE_SEARCH__ && window.__SITE_SEARCH__.open),
    recalcKeywords: recalc,
    boxPresent: !!box,
    boxHasHiddenAttr: box ? box.hasAttribute('hidden') : null,
    boxComputedDisplay: boxStyle ? boxStyle.display : null,
    boxVisible: box ? !box.hidden : null,
    hint: hint ? hint.textContent : null,
    btnVisible: btn ? !btn.hidden : null,
    btnText: btn ? btn.textContent : null
  };
})()`;



const CASES = [
    { path: '/blog/2026-06-20-research-notes-old.html', expectKeywords: true },
    { path: '/en/papers/attention-mechanism.html', expectKeywords: true },
    { path: '/en/projects/steer3d.html', expectKeywords: true },
    { path: '/xyzzy.html', expectKeywords: true },
    { path: '/en/', expectKeywords: false }
];

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-404probe-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--disable-extensions', '--hide-scrollbars',
        '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });

    const results = [];
    try {
        let version;
        for (let i = 0; i < 80; i++) {
            try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch { /* retry */ }
            await sleep(250);
        }
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        const cdp = new CDP(ws);

        for (const c of CASES) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Runtime.enable', {}, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${c.path}` }, sessionId);
            await sleep(2000);
            const r = await cdp.send('Runtime.evaluate', { expression: PROBE, returnByValue: true }, sessionId);
            const row = { ...c, ...(r.result && r.result.value ? r.result.value : {}) };

            // 交互：点链接应打开搜索弹层并把关键词带进去
            if (row.boxVisible === true) {
                const click = await cdp.send('Runtime.evaluate', {
                    expression: `(async () => {
                        const t = document.querySelector('[data-404-search-link]')
                            || document.querySelector('[data-404-search-btn]');
                        t.click();
                        const results = document.getElementById('search-results');
                        const dl = Date.now() + 8000;
                        while (Date.now() < dl) {
                            if (results && results.querySelectorAll('.search-result').length > 0) break;
                            await new Promise((r) => setTimeout(r, 200));
                        }
                        const overlay = document.getElementById('search-overlay');
                        const input = document.getElementById('search-input');
                        const keyword = input ? input.value.trim() : '';
                        const single = keyword.split(/\\s+/)[0] || '';

                        // 404 页本身是中英同一份 HTML，索引按**路径**选语言
                        // （页面脚本用 location.pathname 判断），所以对照词也按路径选
                        const isEn = /^\\/en(\\/|$)/.test(location.pathname);
                        const control = isEn ? 'paper' : '论文';
                        const pathResultCount = results ? results.querySelectorAll('.search-result').length : 0;
                        window.__SITE_SEARCH__.close();
                        await new Promise((r) => setTimeout(r, 250));
                        window.__SITE_SEARCH__.open(control);
                        const dl2 = Date.now() + 8000;
                        while (Date.now() < dl2) {
                            if (results && results.querySelectorAll('.search-result').length > 0) break;
                            await new Promise((r) => setTimeout(r, 200));
                        }
                        const controlCount = results ? results.querySelectorAll('.search-result').length : 0;

                        return {
                            overlayOpen: !!overlay && overlay.classList.contains('open'),
                            inputValue: keyword,
                            resultCount: pathResultCount,
                            singleKeyword: single,
                            controlKeyword: control,
                            controlResultCount: controlCount,
                            fuseLoaded: !!window.Fuse
                        };
                    })()`,
                    awaitPromise: true, returnByValue: true
                }, sessionId);
                Object.assign(row, (click.result && click.result.value) || {});
            }
            results.push(row);
            await cdp.send('Target.closeTarget', { targetId });
        }
        cdp.close();
    } finally {
        try { child.kill(); } catch { /* ignore */ }
        server.close();
        await sleep(300);
        rmSync(profile, { recursive: true, force: true });
    }

    const problems = [];
    results.forEach((r) => {
        if (r.boxVisible === true && r.expectKeywords) {
            if (!r.hint || !r.hint.trim()) problems.push(r.path + ' :: 显示了搜索入口但没有关键词提示');
            if (!r.btnVisible) problems.push(r.path + ' :: 有提示但没有搜索按钮');
            if (!r.overlayOpen) problems.push(r.path + ' :: 点按钮没有打开搜索弹层');
            if (!r.inputValue) problems.push(r.path + ' :: 搜索框没有被预填关键词');
            if (r.inputValue && r.recalcKeywords && r.inputValue.trim() !== r.recalcKeywords) {
                problems.push(r.path + ' :: 预填关键词与路径不符（' + r.inputValue + ' ≠ ' + r.recalcKeywords + '）');
            }
            // 搜索机制必须可用：用保证能命中的词验证（路径关键词可能确实查不到，
            // 例如中文页只索引中文内容，英文路径词查不到是对的）
            if (!r.controlResultCount) {
                problems.push(r.path + ' :: 搜索机制没给出结果（用必然命中的词「论文」也没结果，Fuse=' + r.fuseLoaded + '）');
            }
        } else if (r.expectKeywords && r.boxVisible !== true) {
            problems.push(r.path + ' :: 路径里有可检索词，但没有显示搜索入口（hint=' + r.hint + '）');
        }
        if (!r.expectKeywords && r.boxVisible === true) {
            problems.push(r.path + ' :: 路径里没有可检索词，却显示了搜索入口');
        }
    });

    console.log(JSON.stringify({ ok: problems.length === 0, problems, results }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => { console.error(JSON.stringify({ ok: false, error: String(e && e.message || e) })); process.exit(1); });
