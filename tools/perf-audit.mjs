/* ============================================================
 * perf-audit.mjs — 首屏性能与布局稳定性审计（CDP）
 * ------------------------------------------------------------
 * 用真实浏览器测：
 *   1. 传输体积（按 URL 汇总，分本地/外部；外部 CDN 另计）
 *   2. 请求数与慢请求
 *   3. CLS（累计布局偏移，PerformanceObserver('layout-shift')）
 *   4. LCP（最大内容绘制）
 *   5. 图片是否有 width/height 或 aspect-ratio（缺了会抖）
 *   6. 首屏内 <script> 是否阻塞（无 defer/async 的同步脚本）
 *   7. 重复请求同一资源（缓存配置问题）
 *
 * 用法：node tools/perf-audit.mjs [--json]
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const PORT = 8167;
const CDP_PORT = 9230;

const PAGES = [
    '/index.html', '/about.html', '/projects.html', '/blog.html', '/cv.html',
    '/blog/2026-06-20-research-notes.html', '/blog/2026-05-08-python-config.html',
    '/en/index.html', '/en/cv.html', '/en/blog/2026-06-20-research-notes.html'
];

/* 体积预算（未压缩传输的粗略上限；本地文件走 gzip 后会更小） */
const BUDGET = {
    localBytes: 400 * 1024,     // 本地 HTML/CSS/JS/JSON 合计
    cls: 0.1,                   // 良好阈值
    lcpMs: 2500                 // 良好阈值
};

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf',
    '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8'
};

const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return;
    }
    // 模拟 GitHub Pages 的 gzip：让体积数字更接近线上
    const type = MIME[extname(file)] || 'application/octet-stream';
    const body = readFileSync(file);
    const compressible = /text|javascript|json|xml|svg/.test(type);
    const accept = String(req.headers['accept-encoding'] || '');
    if (compressible && /gzip/.test(accept)) {
        const zlib = require$('node:zlib');
        const gz = zlib.gzipSync(body, { level: 6 });
        res.writeHead(200, { 'content-type': type, 'content-encoding': 'gzip', 'cache-control': 'no-store' });
        res.end(gz);
        return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
});

// 在 ESM 里拿 zlib
import { gzipSync } from 'node:zlib';
function require$(name) { void name; return { gzipSync }; }

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
        this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
        ws.addEventListener('message', (ev) => {
            let m; try { m = JSON.parse(ev.data); } catch { return; }
            if (m.id && this.pending.has(m.id)) {
                const { resolve, reject, timer } = this.pending.get(m.id);
                clearTimeout(timer); this.pending.delete(m.id);
                m.error ? reject(new Error(m.error.message)) : resolve(m.result);
                return;
            }
            if (m.method) this.handlers.forEach((h) => h(m, this._sessionOf(m)));
        });
    }
    _sessionOf(m) { return m.sessionId || null; }
    on(handler) { this.handlers.push(handler); }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(method + ' timeout')); }, 40000);
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

const OBSERVERS = `(() => {
  window.__perfInjected = true;
  window.__perf = { cls: 0, shifts: [], lcp: 0, lcpEl: '', fcp: 0, longTasks: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) {
          window.__perf.cls += e.value;
          if (e.value > 0.001) window.__perf.shifts.push({
            value: Math.round(e.value * 10000) / 10000,
            at: Math.round(e.startTime),
            sources: (e.sources || []).map((s) => {
              const n = s.node;
              if (!n) return '';
              const tag = n.tagName ? n.tagName.toLowerCase() : '';
              const cls = n.className && typeof n.className === 'string' ? '.' + n.className.split(' ').slice(0, 2).join('.') : '';
              const id = n.id ? '#' + n.id : '';
              const rect = s.previousRect && s.currentRect
                ? ' y' + Math.round(s.previousRect.top) + '→' + Math.round(s.currentRect.top)
                : '';
              return tag + id + cls + rect;
            }).filter(Boolean).slice(0, 3)
          });
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      const es = list.getEntries();
      const last = es[es.length - 1];
      if (last) {
        window.__perf.lcp = last.startTime;
        window.__perf.lcpEl = last.element ? (last.element.tagName.toLowerCase() + (last.element.className ? '.' + String(last.element.className).split(' ')[0] : '')) : '';
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') window.__perf.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch (e) {}
})()`;

const COLLECT = `(() => {
  const p = window.__perf || {};
  const mark = window.__perfInjected === true;
  const imgs = [...document.querySelectorAll('img')].map((img) => ({
    src: (img.getAttribute('src') || '').slice(0, 60),
    hasDims: !!(img.getAttribute('width') && img.getAttribute('height')) || !!img.style.aspectRatio,
    lazy: img.getAttribute('loading') === 'lazy',
    above: img.getBoundingClientRect().top < window.innerHeight
  }));
  const blocking = [...document.querySelectorAll('script[src]')]
    .filter((s) => !s.defer && !s.async && !s.type)
    .map((s) => s.getAttribute('src'));
  const inlineHeads = [...document.querySelectorAll('head script:not([src])')].length;
  return {
    injected: mark,
    cls: Math.round((p.cls || 0) * 10000) / 10000,
    shifts: (p.shifts || []).slice(0, 8),
    lcp: Math.round(p.lcp || 0),
    lcpEl: p.lcpEl || '',
    fcp: Math.round(p.fcp || 0),
    imgs,
    blocking,
    inlineHeads
  };
})()`;

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-perf-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions', '--disable-sync',
        '--hide-scrollbars', '--remote-debugging-port=' + CDP_PORT,
        '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });

    const results = [];
    try {
        const version = await waitDevtools();
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
        });
        const cdp = new CDP(ws);

        for (const path of PAGES) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Runtime.enable', {}, sessionId);
            await cdp.send('Network.enable', {}, sessionId);
            await cdp.send('Emulation.setDeviceMetricsOverride',
                { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

            const requests = new Map();
            const byId = new Map();
            const handler = (msg) => {
                if (msg.sessionId !== sessionId) return;
                if (msg.method === 'Network.responseReceived') {
                    const r = msg.params.response;
                    const rec = {
                        requestId: msg.params.requestId,
                        url: r.url,
                        status: r.status,
                        type: msg.params.type,
                        encoded: r.encodedDataLength || 0,
                        mime: r.mimeType || ''
                    };
                    requests.set(r.url, rec);
                    byId.set(msg.params.requestId, rec);
                }
                if (msg.method === 'Network.loadingFinished') {
                    const rec = byId.get(msg.params.requestId);
                    if (rec) rec.encoded = Math.max(rec.encoded, msg.params.encodedDataLength || 0);
                }
            };
            cdp.on(handler);

            // 观察器必须在导航开始时就在场（layout-shift / LCP 越早订阅越全）；
            // addScriptToEvaluateOnNewDocument 需要先 Page.enable 才可靠生效
            await cdp.send('Page.enable', {}, sessionId);
            const inject = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVERS }, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` }, sessionId);

            // 等渲染完成 + 一段观察窗口（布局偏移多在图片/字体到位后发生）
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                const r = await cdp.send('Runtime.evaluate', {
                    expression: `document.documentElement.dataset.dshRendered ? 'y' : (document.querySelector('.site-footer') ? 'f' : 'n')`,
                    returnByValue: true
                }, sessionId);
                if ((r.result && r.result.value) === 'y') break;
                await sleep(150);
            }
            await sleep(2200);

            const res = await cdp.send('Runtime.evaluate', { expression: COLLECT, returnByValue: true }, sessionId);
            const data = (res.result && res.result.value) || {};

            const list = [...requests.values()];
            const local = list.filter((r) => r.url.startsWith(`http://127.0.0.1:${PORT}`));
            const external = list.filter((r) => !r.url.startsWith(`http://127.0.0.1:${PORT}`));
            const sum = (arr) => arr.reduce((a, b) => a + (b.encoded || 0), 0);

            // 同一资源重复请求
            const counts = {};
            local.forEach((r) => { counts[r.url] = (counts[r.url] || 0) + 1; });
            const dupes = Object.entries(counts).filter(([, n]) => n > 1).map(([u, n]) => u.replace(`http://127.0.0.1:${PORT}`, '') + ' x' + n);

            const imgsNoDims = (data.imgs || []).filter((i) => !i.hasDims).map((i) => i.src);
            const eagerAbove = (data.imgs || []).filter((i) => i.above && !i.lazy).map((i) => i.src);

            results.push({
                path,
                localBytes: sum(local),
                externalBytes: sum(external),
                requests: list.length,
                externalRequests: external.length,
                cls: data.cls,
                shifts: data.shifts,
                lcp: data.lcp,
                lcpEl: data.lcpEl,
                fcp: data.fcp,
                blockingScripts: data.blocking,
                imgsNoDims,
                imgCount: (data.imgs || []).length,
                eagerAbove,
                dupes
            });
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
    results.forEach((r) => {
        if (r.cls > BUDGET.cls) problems.push(`${r.path} :: CLS ${r.cls} > ${BUDGET.cls}（${JSON.stringify(r.shifts)}）`);
        if (r.lcp && r.lcp > BUDGET.lcpMs && r.path === '/index.html') problems.push(`${r.path} :: LCP ${r.lcp}ms > ${BUDGET.lcpMs}ms (${r.lcpEl})`);
        if (r.localBytes > BUDGET.localBytes) problems.push(`${r.path} :: 本地传输 ${Math.round(r.localBytes / 1024)}KB > ${Math.round(BUDGET.localBytes / 1024)}KB`);
        if (r.blockingScripts.length) problems.push(`${r.path} :: 同步阻塞脚本 ${r.blockingScripts.join(', ')}`);
        if (r.imgsNoDims.length) problems.push(`${r.path} :: ${r.imgsNoDims.length} 张图缺 width/height（会抖）：${r.imgsNoDims.slice(0, 3).join(', ')}`);
        if (r.dupes.length) problems.push(`${r.path} :: 重复请求 ${r.dupes.join(', ')}`);
    });

    console.log(JSON.stringify({
        ok: problems.length === 0,
        budget: BUDGET,
        problems,
        pages: results.map((r) => ({
            path: r.path,
            localKB: Math.round(r.localBytes / 1024),
            externalKB: Math.round(r.externalBytes / 1024),
            requests: r.requests,
            cls: r.cls,
            lcp: r.lcp,
            lcpEl: r.lcpEl,
            fcp: r.fcp,
            imgs: r.imgCount,
            shifts: r.shifts
        }))
    }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
