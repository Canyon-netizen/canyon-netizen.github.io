/* ============================================================
 * render-cdp.mjs — 确定性渲染验证（Chrome DevTools Protocol）
 * ------------------------------------------------------------
 * 为什么不用 `--dump-dom`：那个方式拿到的 DOM 取决于「虚拟时间预算耗尽时页面
 * 跑到哪一步」，同一份代码两次运行结果会不一样（本工具踩过这个坑：一度把上一次
 * 运行的旧快照当成新结果来断言）。这里改成用 CDP：
 *   Edge --remote-debugging-port → 打开页面 → 轮询页面自报的渲染状态
 *   （documentElement.dataset.dshRendered / dshRenderError）→ 再取 DOM。
 * 状态由页面自己打，所以「渲染完成」是确定性信号，而不是猜时间。
 *
 * 用法：node tools/render-cdp.mjs [--shots]
 * 产出：.dsh-dom/<name>.html（DOM 快照）、可选 .dsh-shots/<name>.png
 * 退出码：有页面未就绪则为 1
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const OUT = join(ROOT, '.dsh-dom');
const SHOTS = join(ROOT, '.dsh-shots');
const PORT = 8160;
const CDP_PORT = 9223;
const WANT_SHOTS = process.argv.includes('--shots');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const PAGES = [
    { name: 'zh-home', path: '/index.html', h: 1400 },
    { name: 'zh-about', path: '/about.html' },
    { name: 'zh-research', path: '/research.html' },
    { name: 'zh-publications', path: '/publications.html' },
    { name: 'zh-projects', path: '/projects.html' },
    { name: 'zh-blog', path: '/blog.html' },
    { name: 'zh-talks', path: '/talks.html' },
    { name: 'zh-books', path: '/books.html' },
    { name: 'zh-hobbies', path: '/hobbies.html' },
    { name: 'zh-cv', path: '/cv.html' },
    { name: 'zh-article', path: '/blog/2026-06-20-research-notes.html', h: 1600 },
    { name: 'zh-article2', path: '/blog/2026-05-08-python-config.html', h: 1600 },
    { name: 'zh-404', path: '/404.html' },
    { name: 'en-article', path: '/en/blog/2026-06-20-research-notes.html', h: 1600 },
    { name: 'en-article2', path: '/en/blog/2026-05-08-python-config.html', h: 1600 },
    { name: 'en-home', path: '/en/index.html', h: 1400 },
    { name: 'en-about', path: '/en/about.html' },
    { name: 'en-research', path: '/en/research.html' },
    { name: 'en-publications', path: '/en/publications.html' },
    { name: 'en-projects', path: '/en/projects.html' },
    { name: 'en-blog', path: '/en/blog.html' },
    { name: 'en-talks', path: '/en/talks.html' },
    { name: 'en-books', path: '/en/books.html' },
    { name: 'en-hobbies', path: '/en/hobbies.html' },
    { name: 'en-cv', path: '/en/cv.html' },
    { name: 'dark-home', path: '/index.html', dark: true, h: 1400 }
];

/* ---------- 静态服务器（模拟 GitHub Pages，含 /en/ 与 /blog/ 子路径） ---------- */
const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404');
        return;
    }
    res.writeHead(200, {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store'
    });
    res.end(readFileSync(file));
});

function findBrowser() {
    return [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    ].find((c) => existsSync(c));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevtools(timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
            if (r.ok) return await r.json();
        } catch { /* 还没起来，继续等 */ }
        await sleep(250);
    }
    throw new Error('DevTools 端口未就绪');
}

/* ---------- 极简 CDP 客户端（Node 24 自带 WebSocket） ---------- */
class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject, timer } = this.pending.get(msg.id);
                clearTimeout(timer);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(msg.error.message));
                else resolve(msg.result);
            } else if (msg.method) {
                this.listeners.forEach((fn) => {
                    try { fn(msg); } catch { /* 监听器异常不影响主流程 */ }
                });
            }
        });
    }

    on(fn) { this.listeners.push(fn); }

    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(method + ' 超时'));
            }, 30000);
            this.pending.set(id, { resolve, reject, timer });
            this.ws.send(JSON.stringify(payload));
        });
    }

    close() { try { this.ws.close(); } catch { /* ignore */ } }
}

async function connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
        ws.addEventListener('open', res, { once: true });
        ws.addEventListener('error', () => rej(new Error('WebSocket 连接失败')), { once: true });
    });
    return new CDP(ws);
}

// 页面自报状态（由 page-renderer.js / cv-renderer.js / article.js 写入）
// 文章页的正文是静态的，但 article.js 会异步拉 data.json 渲染相邻文章、分享与语言切换；
// 它同样会打 dshRendered 标记，所以这里直接等标记即可。
const READY_PROBE = `(() => {
  const de = document.documentElement;
  if (de.dataset.dshRenderError) return 'error';
  if (de.dataset.dshRendered) return 'ready';
  if (!document.querySelector('[data-section]') && !document.getElementById('cv-content')
      && !document.querySelector('.article-shell')) return 'ready';
  return 'pending';
})()`;

async function waitReady(cdp, sessionId, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    let last = 'pending';
    while (Date.now() < deadline) {
        const r = await cdp.send('Runtime.evaluate', {
            expression: READY_PROBE, returnByValue: true
        }, sessionId);
        last = (r.result && r.result.value) || 'pending';
        if (last === 'ready' || last === 'error') return last;
        await sleep(150);
    }
    return last;
}

async function main() {
    const browser = findBrowser();
    if (!browser) {
        console.log(JSON.stringify({ ok: false, reason: '未找到 Edge/Chrome' }));
        process.exitCode = 1;
        return;
    }

    // 顺带把控制台错误/异常抓出来，便于定位「渲染没跑」的真实原因
    const collectedErrors = [];

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });
    if (WANT_SHOTS) {
        rmSync(SHOTS, { recursive: true, force: true });
        mkdirSync(SHOTS, { recursive: true });
    }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));

    const profile = join(ROOT, '.dsh-edge-cdp-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });

    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions', '--disable-sync',
        '--disable-background-networking', '--hide-scrollbars',
        '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profile,
        'about:blank'
    ], { stdio: 'ignore' });

    const results = [];

    try {
        const version = await waitForDevtools();
        const cdp = await connect(version.webSocketDebuggerUrl);

        let firstTarget = true;
        for (const page of PAGES) {
            // 每页都新建 target：复用启动时的 about:blank 容易在「第一次导航还没生效」
            // 时就被测量（本工具踩过：首页快照只剩 2.5KB）
            const targetId = (await cdp.send('Target.createTarget', { url: 'about:blank' })).targetId;
            firstTarget = false;

            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });

            // 只记录当前页面的报错（换页前清空）
            collectedErrors.length = 0;
            const onMsg = (msg) => {
                if (msg.sessionId !== sessionId) return;
                if (msg.method === 'Runtime.exceptionThrown') {
                    const d = msg.params.exceptionDetails || {};
                    collectedErrors.push('exception: ' + (d.exception && d.exception.description || d.text || '?'));
                }
                if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
                    collectedErrors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
                }
                if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
                    collectedErrors.push('log: ' + msg.params.entry.text);
                }
            };
            cdp.on(onMsg);
            await cdp.send('Runtime.enable', {}, sessionId);
            await cdp.send('Page.enable', {}, sessionId);
            await cdp.send('Log.enable', {}, sessionId).catch(() => {});

            await cdp.send('Emulation.setDeviceMetricsOverride', {
                width: 1440, height: page.h || 1000, deviceScaleFactor: 1, mobile: false
            }, sessionId);

            if (page.dark) {
                await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` }, sessionId);
                await sleep(600);
                await cdp.send('Runtime.evaluate', {
                    expression: "try{localStorage.setItem('site-theme','dark')}catch(e){}"
                }, sessionId);
            } else {
                await cdp.send('Runtime.evaluate', {
                    expression: "try{localStorage.removeItem('site-theme')}catch(e){}"
                }, sessionId);
            }

            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${page.path}` }, sessionId);
            await sleep(400);
            let state = await waitReady(cdp, sessionId);
            if (state === 'pending') {
                // 再等一轮：数据量小，多等一会儿就能区分「慢」和「真的没渲染」
                await sleep(1500);
                state = await waitReady(cdp, sessionId, 8000);
            }

            const domRes = await cdp.send('Runtime.evaluate', {
                expression: 'document.documentElement.outerHTML', returnByValue: true
            }, sessionId);
            let html = (domRes.result && domRes.result.value) || '';

            // Runtime.evaluate 对超长字符串会截断（本工具踩过：11.9KB 的地方被截到 11.7KB），
            // 因此正式快照走 DOM.getOuterHTML，保证拿到完整 DOM。
            try {
                await cdp.send('DOM.enable', {}, sessionId);
                const doc = await cdp.send('DOM.getDocument', { depth: 1 }, sessionId);
                const outer = await cdp.send('DOM.getOuterHTML', { nodeId: doc.root.nodeId }, sessionId);
                if (outer && outer.outerHTML && outer.outerHTML.length > html.length) {
                    html = outer.outerHTML;
                }
            } catch { /* 退回 evaluate 的结果 */ }
            writeFileSync(join(OUT, page.name + '.html'), html, 'utf8');

            if (WANT_SHOTS) {
                const shot = await cdp.send('Page.captureScreenshot',
                    { format: 'png', captureBeyondViewport: true }, sessionId);
                if (shot && shot.data) {
                    writeFileSync(join(SHOTS, page.name + '.png'), Buffer.from(shot.data, 'base64'));
                }
            }

            const sections = await cdp.send('Runtime.evaluate', {
                expression: `(() => {
                  const out = [];
                  const de = document.documentElement;
                  out.push('rendered=' + (de.dataset.dshRendered || '-'));
                  out.push('renderError=' + (de.dataset.dshRenderError || '-'));
                  document.querySelectorAll('[data-section]').forEach((s) => {
                    out.push(s.getAttribute('data-section') + ':' + s.innerHTML.length);
                  });
                  return out.join(' ');
                })()`,
                returnByValue: true
            }, sessionId).then((r) => (r.result && r.result.value) || '').catch(() => '');

            results.push({
                name: page.name,
                path: page.path,
                state,
                bytes: html.length,
                sectionsTiles: sections,
                errors: collectedErrors.slice(0, 6)
            });

            cdp.listeners = cdp.listeners.filter((fn) => fn !== onMsg);
            await cdp.send('Target.closeTarget', { targetId });
        }

        cdp.close();
    } finally {
        try { child.kill(); } catch { /* ignore */ }
        server.close();
        await sleep(400);
        rmSync(profile, { recursive: true, force: true });
    }

    const bad = results.filter((r) => r.state !== 'ready' || r.bytes < 3000);
    console.log(JSON.stringify({ ok: bad.length === 0, pages: results.length, bad, results }, null, 2));
    process.exitCode = bad.length ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
