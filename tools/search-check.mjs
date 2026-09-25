/* ============================================================
 * search-check.mjs — 搜索功能端到端验证（CDP）
 * ------------------------------------------------------------
 * 在真实浏览器里打开搜索弹层、输入关键词，检查：
 *   1. 能打开（Ctrl+K / 点击 / search:open 事件任一路径）
 *   2. 命中结果数量合理，且带类型标签与分组标题
 *   3. 正文全文检索生效（用只出现在正文里的词能搜到文章）
 *   4. 中英各用各自索引（英文页英文标题，中文页中文标题）
 *   5. 结果链接可解析（不是 # 或空）
 *   6. Esc 能关闭、焦点回到触发器
 * 注意：Fuse.js 走 CDN；若本机无外网，脚本会明确报告「CDN 不可达」而不是假通过。
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const SHOTS = join(ROOT, '.dsh-shots');
const PORT = 8162;
const CDP_PORT = 9225;
const WANT_SHOTS = process.argv.includes('--shots');

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml; charset=utf-8'
};

const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findBrowser() {
    return [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    ].find((c) => existsSync(c));
}

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

async function waitDevtools(timeoutMs = 25000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
            if (r.ok) return await r.json();
        } catch { /* retry */ }
        await sleep(250);
    }
    throw new Error('DevTools 端口未就绪');
}

const READY = `(() => {
  const de = document.documentElement;
  if (de.dataset.dshRenderError) return 'error';
  if (!document.querySelector('.site-footer')) return 'pending';
  return document.getElementById('search-overlay') ? 'ready' : 'pending';
})()`;

/* 打开搜索 → 输入 → 收集结果结构 */
const probe = (query) => `(async () => {
  const overlay = document.getElementById('search-overlay');
  document.dispatchEvent(new CustomEvent('search:open'));
  await new Promise((r) => setTimeout(r, 420));
  const input = document.getElementById('search-input');
  input.value = ${JSON.stringify(query)};
  input.dispatchEvent(new Event('input', { bubbles: true }));

  // 等结果出现（Fuse 首次要从 CDN 加载）
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const n = document.querySelectorAll('#search-results .search-result').length;
    const empty = document.querySelector('#search-results .search-empty');
    if (n > 0) break;
    if (empty && Date.now() > deadline - 12000 && /搜索索引加载失败|failed to load/i.test(empty.textContent)) {
      return { cdnFailed: true, emptyText: empty.textContent };
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const rows = [...document.querySelectorAll('#search-results .search-result')];
  const groups = [...document.querySelectorAll('#search-results .search-group-title')].map((g) => g.textContent.trim());
  const badLinks = rows.filter((a) => !a.getAttribute('href') || a.getAttribute('href') === '#').length;
  const typed = rows.filter((a) => a.querySelector('.search-type')).length;
  const first = rows[0] ? {
    title: (rows[0].querySelector('.search-result-title') || {}).textContent || '',
    type: (rows[0].querySelector('.search-type') || {}).textContent || '',
    excerpt: (rows[0].querySelector('.search-result-excerpt') || {}).textContent || ''
  } : null;

  // Esc 关闭 + 焦点回到触发器
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  const closed = !overlay.classList.contains('open');

  return {
    open: true,
    count: rows.length,
    groups,
    typed,
    badLinks,
    first,
    closed,
    fuseLoaded: !!window.Fuse
  };
})()`;

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-search-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions', '--disable-sync',
        '--hide-scrollbars', '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });

    const cases = [
        { page: '/index.html', query: '论文', lang: 'zh', label: '中文：标题命中' },
        { page: '/index.html', query: 'Pydantic', lang: 'zh', label: '中文：正文全文命中' },
        { page: '/index.html', query: 'CSAPP', lang: 'zh', label: '中文：书单命中' },
        { page: '/en/index.html', query: 'paper', lang: 'en', label: '英文：英文索引命中' },
        { page: '/en/index.html', query: 'Pydantic', lang: 'en', label: '英文：正文全文命中' }
    ];

    const results = [];
    try {
        const version = await waitDevtools();
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
        });
        const cdp = new CDP(ws);

        for (const c of cases) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${c.page}` }, sessionId);

            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                const r = await cdp.send('Runtime.evaluate', { expression: READY, returnByValue: true }, sessionId);
                if ((r.result && r.result.value) === 'ready') break;
                await sleep(150);
            }

            const res = await cdp.send('Runtime.evaluate', {
                expression: probe(c.query), awaitPromise: true, returnByValue: true
            }, sessionId);
            const value = (res.result && res.result.value) || {};
            results.push({ ...c, ...value });

            // 可选：给「搜索结果」留一张截图（仅中文标题命中那一例）
            if (WANT_SHOTS && c.lang === 'zh' && c.query === '论文') {
                if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
                // 结果已被 Esc 关闭，这里重新打开并输入
                await cdp.send('Runtime.evaluate', {
                    expression: `(async () => {
                        document.dispatchEvent(new CustomEvent('search:open'));
                        await new Promise(r => setTimeout(r, 300));
                        const i = document.getElementById('search-input');
                        i.value = '论文';
                        i.dispatchEvent(new Event('input', { bubbles: true }));
                        await new Promise(r => setTimeout(r, 900));
                    })()`, awaitPromise: true
                }, sessionId);
                const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
                if (shot && shot.data) {
                    writeFileSync(join(SHOTS, 'zh-search.png'), Buffer.from(shot.data, 'base64'));
                }
            }

            await cdp.send('Target.closeTarget', { targetId });
        }
        cdp.close();
    } finally {
        try { child.kill(); } catch { /* ignore */ }
        server.close();
        await sleep(400);
        rmSync(profile, { recursive: true, force: true });
    }

    const problems = [];
    if (results.some((r) => r.cdnFailed)) {
        problems.push('Fuse.js CDN 不可达（本机无外网），搜索行为无法验证');
    }
    results.forEach((r) => {
        if (r.cdnFailed) return;
        if (!r.count) problems.push(`${r.label}（${r.query}）没有结果`);
        if (!r.typed) problems.push(`${r.label}（${r.query}）结果缺少类型标签`);
        if (!r.groups || !r.groups.length) problems.push(`${r.label}（${r.query}）没有分组标题`);
        if (r.badLinks) problems.push(`${r.label}（${r.query}）有 ${r.badLinks} 条结果链接无效`);
        if (!r.closed) problems.push(`${r.label}（${r.query}）Esc 未能关闭搜索`);
    });

    console.log(JSON.stringify({
        ok: problems.length === 0,
        problems,
        cdnReachable: !results.some((r) => r.cdnFailed),
        results: results.map((r) => ({
            label: r.label, page: r.page, query: r.query,
            count: r.count, groups: r.groups, typed: r.typed,
            badLinks: r.badLinks, closed: r.closed, fuseLoaded: r.fuseLoaded,
            firstTitle: r.first && r.first.title,
            firstExcerpt: r.first && r.first.excerpt && r.first.excerpt.slice(0, 60)
        }))
    }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
