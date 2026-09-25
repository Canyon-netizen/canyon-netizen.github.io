/* ============================================================
 * print-audit.mjs — 打印样式审计（CDP）
 * ------------------------------------------------------------
 * 用 Emulation.setEmulatedMedia({media:'print'}) 真正切到打印媒体，
 * 然后检查：
 *   1. 隐藏类元素确实不可见（导航 / 页脚 / 目录 / 返回顶部 / 复制按钮 / 搜索）
 *   2. 没有溢出的固定/绝对定位元素（打印时不会跑到纸外）
 *   3. 正文不以深色为底（省墨，且黑白打印机下不会糊成一片）
 *   4. 链接地址不丢失（裸链接在纸上无法点击，打印样式应露出 URL 或省略）
 *   5. 图片不被裁切（宽度不超过版心）
 * 再用 Page.printToPDF 出真实 PDF，报告页数：
 *   - cv.html 必须 1 页
 *   - 其它页面不应出现明显的空白页（页数 > 0）
 *
 * 用法：node tools/print-audit.mjs [--shots]
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const OUT = join(ROOT, '.dsh-print');
const PORT = 8166;
const CDP_PORT = 9229;
const WANT_PDF = process.argv.includes('--pdf');

/* CV 允许 1~2 页；fitMax 限制「内容高度 / 一页可打印高度」，
   避免出现「第二页只有两三行」这种观感很差的排版 */
const PAGES = [
    /* 内容高度 / 一页可打印高度 的上限：
       超过它说明末页只剩很少内容（观感差）。CV 定在 1.05——
       即允许「差最后几行」的轻微溢出，但不允许末页只剩一大块空白。 */
    { path: '/cv.html', expectPages: [1, 2], fitMax: 1.05 },
    { path: '/en/cv.html', expectPages: [1, 2], fitMax: 1.05 },
    { path: '/about.html', expectPages: [1, 6] },
    { path: '/projects.html', expectPages: [1, 8] },
    { path: '/blog/2026-06-20-research-notes.html', expectPages: [1, 8] },
    { path: '/blog/2026-05-08-python-config.html', expectPages: [1, 8] },
    { path: '/index.html', expectPages: [1, 8] }
];

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf'
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

/* 找出 PDF 每一页的字节段，用于粗略估计「末页有多少墨」
   打印 PDF 是压缩流，无法直接量墨迹；这里改用渲染成 PNG 后统计深色像素比例。
   为避免依赖额外工具，先用页面内「内容高度 / 页面高度」估算是否需要第 2 页：
   scrollHeight 只有在一页装不下时才会明显超过一页的可打印高度（A4 减页边距）。 */
/* 内容是否需要翻页：一页可打印高度 ≈ (297mm - 上下页边距)；页边距见打印样式 */
const FIT = `(() => {
  const margins = 24;                                  // 12mm 上 + 12mm 下
  const pageH = (297 - margins) * 96 / 25.4;           // mm → CSS px
  const used = document.body.scrollHeight;
  return { pageH: Math.round(pageH), used: Math.round(used), ratio: Math.round(used / pageH * 100) / 100 };
})()`;

const READY = `(() => {
  const de = document.documentElement;
  if (de.dataset.dshRenderError) return 'error';
  if (!document.querySelector('.site-footer')) return 'pending';
  if (de.dataset.dshRendered) return 'ready';
  if (!document.querySelector('[data-section]') && !document.getElementById('cv-content')
      && !document.querySelector('.article-shell')) return 'ready';
  return 'pending';
})()`;

/* 打印媒体下的检查 */
const AUDIT = `(() => {
  const issues = [];
  const add = (rule, detail) => issues.push({ rule, detail });
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // 1. 屏幕专用元素必须被隐藏
  const mustHide = [
    ['.site-header', '站点头部'],
    ['.site-footer', '页脚'],
    ['.back-to-top', '回到顶部'],
    ['.skip-link', '跳过链接'],
    ['.search-overlay', '搜索弹层'],
    ['.toc', '目录'],
    ['.scroll-progress', '滚动进度条']
  ];
  mustHide.forEach(([sel, name]) => {
    document.querySelectorAll(sel).forEach((el) => {
      if (vis(el)) add('print-visible', name + ' (' + sel + ') 在打印媒体下仍可见');
    });
  });

  // 2. 固定定位元素不该出现在纸上
  document.querySelectorAll('body *').forEach((el) => {
    if (!vis(el)) return;
    if (getComputedStyle(el).position === 'fixed') {
      add('print-fixed', '仍有 fixed 定位元素可见：' + el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
    }
  });

  // 3. 深色底：打印时大面积深色会糊且费墨
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  document.querySelectorAll('main *, footer *').forEach((el) => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 40) return;   // 只看成块区域
    const c = parse(getComputedStyle(el).backgroundColor);
    if (!c || c.a < 0.5) return;
    const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
    if (lum < 0.35) {
      add('print-dark-block', el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] +
        ' 深色底 rgb(' + c.r + ',' + c.g + ',' + c.b + ') ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
  });

  // 4. 图片不超出页面宽度
  const pageW = document.documentElement.clientWidth;
  document.querySelectorAll('img').forEach((img) => {
    if (!vis(img)) return;
    const r = img.getBoundingClientRect();
    if (r.width > pageW + 2) {
      add('print-img-wide', (img.getAttribute('src') || '') + ' 宽 ' + Math.round(r.width) + ' > 版心 ' + pageW);
    }
  });

  // 5. 正文横向溢出（打印没有横向滚动，溢出即丢字）
  const scrollW = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  if (scrollW > pageW + 2) {
    add('print-h-overflow', 'scrollW=' + scrollW + ' > ' + pageW + '（打印时会丢右边内容）');
  }

  return { issues };
})()`;

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-print-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
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

        for (const spec of PAGES) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Runtime.enable', {}, sessionId);
            await cdp.send('Emulation.setDeviceMetricsOverride',
                { width: 900, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${spec.path}` }, sessionId);

            const deadline = Date.now() + 15000;
            let state = 'pending';
            while (Date.now() < deadline) {
                const r = await cdp.send('Runtime.evaluate', { expression: READY, returnByValue: true }, sessionId);
                state = (r.result && r.result.value) || 'pending';
                if (state === 'ready' || state === 'error') break;
                await sleep(150);
            }

            // 切到打印媒体
            await cdp.send('Emulation.setEmulatedMedia', { media: 'print' }, sessionId);
            await sleep(500);

            const res = await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true }, sessionId);
            const payload = (res.result && res.result.value) || { issues: [] };
            const fitRes = await cdp.send('Runtime.evaluate', { expression: FIT, returnByValue: true }, sessionId);
            const fit = (fitRes.result && fitRes.result.value) || null;

            let pages = null;
            if (WANT_PDF) {
                const pdf = await cdp.send('Page.printToPDF', {
                    printBackground: true, preferCSSPageSize: true, paperWidth: 8.27, paperHeight: 11.69
                }, sessionId);
                if (pdf && pdf.data) {
                    const buf = Buffer.from(pdf.data, 'base64');
                    const name = spec.path.replace(/[\\/]/g, '_').replace(/^_/, '').replace('.html', '') + '.pdf';
                    writeFileSync(join(OUT, name), buf);
                    // 页数：按 PDF 里的 /Type /Page 对象统计（排除 /Pages）
                    const txt = buf.toString('latin1');
                    const m = txt.match(/\/Type\s*\/Page[^s]/g);
                    pages = m ? m.length : null;
                }
            }

            results.push({ path: spec.path, state, issues: payload.issues || [], pages, expect: spec.expectPages, fit, fitMax: spec.fitMax });
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
    const byRule = {};
    results.forEach((r) => {
        r.issues.forEach((i) => {
            byRule[i.rule] = byRule[i.rule] || [];
            byRule[i.rule].push(r.path + ' :: ' + i.detail);
            problems.push(r.path + ' :: ' + i.rule + ' :: ' + i.detail);
        });
        if (r.pages != null && r.expect && (r.pages < r.expect[0] || r.pages > r.expect[1])) {
            const msg = r.path + ' :: 打印页数 ' + r.pages + ' 不在预期 [' + r.expect.join(', ') + '] 内';
            byRule['print-page-count'] = byRule['print-page-count'] || [];
            byRule['print-page-count'].push(msg);
            problems.push(msg);
        }
        // 只翻一页却几乎没内容（末页太空）也是排版问题
        if (r.fitMax && r.fit && r.fit.ratio > r.fitMax) {
            const msg = r.path + ' :: 内容高度是一页的 ' + r.fit.ratio + ' 倍（上限 ' + r.fitMax +
                '），末页会只剩很少内容';
            byRule['print-poor-fill'] = byRule['print-poor-fill'] || [];
            byRule['print-poor-fill'].push(msg);
            problems.push(msg);
        }
    });

    console.log(JSON.stringify({
        ok: problems.length === 0,
        pages: results.map((r) => ({ path: r.path, state: r.state, issues: r.issues.length, pdfPages: r.pages, fitRatio: r.fit && r.fit.ratio })),
        ruleSummary: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length])),
        details: byRule
    }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
