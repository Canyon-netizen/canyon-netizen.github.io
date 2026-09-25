/* ============================================================
 * responsive-audit.mjs — 多断点响应式审计（CDP）
 * ------------------------------------------------------------
 * 逐页 × 逐宽度在真实浏览器里检查：
 *   1. 横向溢出（scrollWidth > clientWidth，并指出是哪个元素撑破）
 *   2. 内容被裁（overflow:hidden 容器里内容更宽/更高）
 *   3. 元素超出视口左右边界
 *   4. 交互目标过小（链接/按钮 < 24×24，WCAG 2.2 AA 目标尺寸）
 *   5. 字号过小（< 12px 的正文/标签）
 *   6. 关键布局退化（导航与页脚在窄屏下不重叠）
 *
 * 用法：node tools/responsive-audit.mjs [--widths=360,768,1440]
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const SHOTS = join(ROOT, '.dsh-shots');
const PORT = 8163;
const CDP_PORT = 9226;
const WANT_SHOTS = process.argv.includes('--shots');
const widthArg = (process.argv.find((a) => a.startsWith('--widths=')) || '').split('=')[1];

/* 宽度覆盖小屏手机 → 超宽屏；375/768/1024/1440 是常见断点 */
const WIDTHS = widthArg
    ? widthArg.split(',').map(Number).filter(Boolean)
    : [320, 375, 414, 600, 768, 900, 1024, 1280, 1440, 1920, 2560];

const PAGES = [
    '/index.html', '/about.html', '/research.html', '/publications.html',
    '/projects.html', '/blog.html', '/talks.html', '/books.html', '/hobbies.html',
    '/cv.html', '/blog/2026-06-20-research-notes.html', '/blog/2026-05-08-python-config.html',
    '/404.html', '/en/index.html', '/en/cv.html', '/en/blog/2026-06-20-research-notes.html'
];

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
  if (de.dataset.dshRendered) return 'ready';
  if (!document.querySelector('[data-section]') && !document.getElementById('cv-content')
      && !document.querySelector('.article-shell')) return 'ready';
  return 'pending';
})()`;

const AUDIT = `(() => {
  const issues = [];
  const add = (rule, detail) => issues.push({ rule, detail });
  const de = document.documentElement;
  const vw = de.clientWidth;

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const desc = (el) => {
    const id = el.id ? '#' + el.id : '';
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  // 1. 横向溢出（页面级，硬失败）
  const scrollW = Math.max(de.scrollWidth, document.body.scrollWidth);
  if (scrollW > vw + 1) {
    const offenders = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (!visible(el)) return;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 && r.width > 8 && r.width < vw * 4) {
        offenders.push({ d: desc(el), right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
    offenders.sort((a, b) => b.right - a.right);
    add('page-h-overflow', 'scrollW=' + scrollW + ' vw=' + vw + ' → ' +
      offenders.slice(0, 3).map((o) => o.d + '(right=' + o.right + ',w=' + o.w + ')').join(', '));
  }

  // 2. 内容被裁：只报「确实装不下」的情况
  //    - 祖先里已经有可横向滚动的容器（overflow-x:auto/scroll）→ 用户能滚到，不算裁
  //    - 纯装饰元素（aria-hidden 或 .hero::before/after 之类）→ 设计上就是要出血
  const inScrollable = (el) => {
    let n = el.parentElement;
    while (n && n !== document.body) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
      n = n.parentElement;
    }
    return false;
  };
  document.querySelectorAll('body *').forEach((el) => {
    if (!visible(el)) return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    const cs = getComputedStyle(el);
    const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
    if (!clipsX) return;
    if (el.clientWidth <= 40) return;
    if (inScrollable(el)) return;
    if (el.scrollWidth <= el.clientWidth + 2) return;
    // 文本能换行却被判超宽，多半是装饰性出血：只有在子元素真的伸出去时才报
    const kidsWide = [...el.children].some((k) => {
      const kcs = getComputedStyle(k);
      if (kcs.position === 'absolute' || kcs.position === 'fixed') return false;
      return k.getBoundingClientRect().width > el.clientWidth + 2;
    });
    if (!kidsWide) return;
    add('clipped', desc(el) + ' scrollW=' + el.scrollWidth + ' clientW=' + el.clientWidth);
  });

  // 3. 超出视口左右边界（可横向滚动的容器内部不算：那是设计好的横向滚动）
  document.querySelectorAll('main *, header *, footer *').forEach((el) => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    if (el.getAttribute('aria-hidden') === 'true') return;
    if (inScrollable(el)) return;
    const r = el.getBoundingClientRect();
    if (r.left < -2 || r.right > vw + 2) {
      add('out-of-viewport', desc(el) + ' left=' + Math.round(r.left) + ' right=' + Math.round(r.right) + ' vw=' + vw);
    }
  });

  // 4. 交互目标尺寸
  //    WCAG 2.2 AA「目标尺寸（最小）」对「位于句子/文本块中的行内链接」有豁免，
  //    所以这里只报**独立**的控件（图标按钮、卡片链接、导航项等）。
  const isInlineInText = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display !== 'inline') return false;
    const p = el.parentElement;
    if (!p) return false;
    // 父级是段落/列表项且有较多文字 → 属于行内链接，豁免
    const text = (p.textContent || '').trim();
    return /^(P|LI|SPAN|TD|DD|BLOCKQUOTE)$/.test(p.tagName) && text.length > (el.textContent || '').length * 2;
  };
  document.querySelectorAll('a[href], button, input, select').forEach((el) => {
    if (!visible(el) || el.closest('[aria-hidden="true"]')) return;
    if (isInlineInText(el)) return;
    const r = el.getBoundingClientRect();
    if (r.width < 24 || r.height < 24) {
      add('small-target', desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) +
        ' "' + (el.textContent || '').trim().slice(0, 14) + '" 父=' + desc(el.parentElement));
    }
  });

  // 5. 字号过小
  const tooSmall = [];
  document.querySelectorAll('p, li, span, a, td, th, .post-meta, .tag').forEach((el) => {
    if (!visible(el) || !(el.textContent || '').trim()) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size && size < 12) tooSmall.push(desc(el) + ' ' + size + 'px');
  });
  if (tooSmall.length) add('tiny-text', tooSmall.slice(0, 4).join(', ') + (tooSmall.length > 4 ? ' 等 ' + tooSmall.length + ' 处' : ''));

  // 6. 导航与页脚关键区域不重叠（同一行内相邻链接互相压盖）
  const rows = document.querySelectorAll('.site-nav, .footer-nav, .nav-more-menu');
  rows.forEach((row) => {
    if (!visible(row)) return;
    const kids = [...row.querySelectorAll('a')].filter(visible).map((a) => ({ el: a, r: a.getBoundingClientRect() }));
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].r, b = kids[j].r;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 3 && overlapY > 3) {
          add('nav-overlap', desc(row) + ': ' + desc(kids[i].el) + ' ∩ ' + desc(kids[j].el));
        }
      }
    }
  });

  return { issues, vw, scrollW };
})()`;

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-resp-' + randomUUID().slice(0, 8));
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

            for (const width of WIDTHS) {
                await cdp.send('Emulation.setDeviceMetricsOverride',
                    { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
                await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` }, sessionId);

                const deadline = Date.now() + 15000;
                let state = 'pending';
                while (Date.now() < deadline) {
                    const r = await cdp.send('Runtime.evaluate', { expression: READY, returnByValue: true }, sessionId);
                    state = (r.result && r.result.value) || 'pending';
                    if (state === 'ready' || state === 'error') break;
                    await sleep(120);
                }

                const res = await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true }, sessionId);
                const payload = (res.result && res.result.value) || { issues: [] };
                if (payload.issues && payload.issues.length) {
                    results.push({ path, width, state, issues: payload.issues });
                }

                if (WANT_SHOTS && [
                    '/index.html@375', '/index.html@768', '/index.html@2560',
                    '/projects.html@375', '/cv.html@768', '/blog/2026-06-20-research-notes.html@1024'
                ].includes(path + '@' + width)) {
                    if (!existsSync(SHOTS)) mkdirSync(SHOTS, { recursive: true });
                    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
                    if (shot && shot.data) {
                        const name = 'resp-' + path.replace(/[\\/]/g, '_').replace(/^_/, '').replace('.html', '') + '-' + width + '.png';
                        writeFileSync(join(SHOTS, name), Buffer.from(shot.data, 'base64'));
                    }
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

    const byRule = {};
    results.forEach((r) => r.issues.forEach((i) => {
        byRule[i.rule] = byRule[i.rule] || [];
        byRule[i.rule].push(r.path + '@' + r.width + ' :: ' + i.detail);
    }));

    console.log(JSON.stringify({
        ok: results.length === 0,
        pages: PAGES.length,
        widths: WIDTHS,
        cells: PAGES.length * WIDTHS.length,
        cellsWithIssues: results.length,
        ruleSummary: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length])),
        details: byRule
    }, null, 2));
    process.exitCode = results.length ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
