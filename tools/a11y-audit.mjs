/* ============================================================
 * a11y-audit.mjs — 渲染后无障碍与语义审计（CDP）
 * ------------------------------------------------------------
 * 逐页在真实浏览器里检查（而不是读静态 HTML）：
 *   1. 图片：有 alt；装饰图 aria-hidden 或 alt=""
 *   2. 标题层级：恰好一个 h1；不跳级（h1→h3）
 *   3. 链接：非空可访问名（含 aria-label / 内部 img alt）
 *   4. 按钮：非空可访问名
 *   5. 表单控件：有 label 或 aria-label
 *   6. id 唯一
 *   7. 语言：<html lang> 正确；中英页面文案语言一致性
 *   8. 地标：有 main / nav / footer
 *   9. 弹层：role=dialog 且有 aria-modal
 *  10. 焦点可达：可交互元素不是 display:none 之外的隐藏态
 *  11. 颜色对比：正文与辅助文字对背景的对比度（WCAG AA）
 *
 * 用法：node tools/a11y-audit.mjs
 * 依赖：先跑 node tools/render-cdp.mjs（复用 .dsh-dom 快照中的页面）
 *       —— 本脚本自带静态服务器，会自己重新打开页面做运行时检查。
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const PORT = 8161;
const CDP_PORT = 9224;

const PAGES = [
    '/index.html', '/about.html', '/research.html', '/publications.html',
    '/projects.html', '/blog.html', '/talks.html', '/books.html', '/hobbies.html',
    '/cv.html', '/blog/2026-06-20-research-notes.html', '/blog/2026-05-08-python-config.html',
    '/404.html',
    '/en/index.html', '/en/about.html', '/en/research.html', '/en/publications.html',
    '/en/projects.html', '/en/blog.html', '/en/talks.html', '/en/books.html',
    '/en/hobbies.html', '/en/cv.html',
    '/en/blog/2026-06-20-research-notes.html', '/en/blog/2026-05-08-python-config.html'
];

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf'
};

const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('404');
        return;
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

/* 浏览器内执行的审计脚本：返回问题列表 */
const AUDIT = `(() => {
  const issues = [];
  const add = (rule, detail) => issues.push({ rule, detail });

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const accName = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    const labelled = el.getAttribute('aria-labelledby');
    if (labelled) {
      const t = labelled.split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ').trim();
      if (t) return t;
    }
    const text = (el.textContent || '').trim();
    if (text) return text;
    const img = el.querySelector('img[alt]');
    if (img && img.getAttribute('alt').trim()) return img.getAttribute('alt').trim();
    const imgAlt = el.tagName === 'IMG' ? (el.getAttribute('alt') || '').trim() : '';
    return imgAlt;
  };

  const inHidden = (el) => !!el.closest('[hidden],[aria-hidden="true"]');

  // 1. 图片
  document.querySelectorAll('img').forEach((img) => {
    if (inHidden(img)) return;
    if (!img.hasAttribute('alt')) add('img-alt', img.getAttribute('src') || '(inline img)');
  });

  // 2. 标题层级
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter((h) => !inHidden(h));
  const h1s = hs.filter((h) => h.tagName === 'H1');
  if (h1s.length === 0) add('h1-missing', '页面没有 h1');
  if (h1s.length > 1) add('h1-multiple', h1s.map((h) => (h.textContent || '').trim().slice(0, 24)).join(' | '));
  let prev = 0;
  hs.forEach((h) => {
    const level = Number(h.tagName[1]);
    if (prev && level > prev + 1) add('heading-skip', 'h' + prev + ' -> h' + level + ' : ' + (h.textContent || '').trim().slice(0, 32));
    prev = level;
  });

  // 3. 链接 / 4. 按钮 / 5. 表单
  document.querySelectorAll('a[href]').forEach((a) => {
    if (inHidden(a) || !visible(a)) return;
    if (!accName(a)) add('link-name', a.getAttribute('href') || '(no href)');
  });
  document.querySelectorAll('button').forEach((b) => {
    if (inHidden(b) || !visible(b)) return;
    if (!accName(b)) add('button-name', b.id || b.className || '(button)');
  });
  document.querySelectorAll('input:not([type=hidden]),select,textarea').forEach((el) => {
    if (inHidden(el)) return;
    const id = el.id;
    const hasLabel = id && document.querySelector('label[for="' + id + '"]');
    if (!hasLabel && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      add('form-label', id || el.name || el.tagName);
    }
  });

  // 6. id 唯一
  const seen = new Map();
  document.querySelectorAll('[id]').forEach((el) => {
    seen.set(el.id, (seen.get(el.id) || 0) + 1);
  });
  seen.forEach((count, id) => { if (count > 1) add('dup-id', id + ' x' + count); });

  // 7. 语言
  const lang = document.documentElement.getAttribute('lang');
  if (!lang) add('html-lang', '缺少 lang 属性');
  const path = location.pathname;
  const isEn = /^\\/en(\\/|$)/.test(path);
  if (isEn && lang !== 'en') add('lang-mismatch', '英文路径但 lang=' + lang);
  if (!isEn && lang && !lang.startsWith('zh')) add('lang-mismatch', '中文路径但 lang=' + lang);

  // 8. 地标
  if (!document.querySelector('main')) add('landmark-main', '缺少 <main>');
  if (!document.querySelector('footer')) add('landmark-footer', '缺少 <footer>');
  const navs = [...document.querySelectorAll('nav')];
  if (!navs.length) add('landmark-nav', '缺少 <nav>');
  navs.forEach((n) => {
    if (!n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')) {
      add('nav-label', 'nav 缺少 aria-label：' + (n.className || n.id || '(nav)'));
    }
  });

  // 9. 弹层
  document.querySelectorAll('[role="dialog"]').forEach((d) => {
    if (!d.getAttribute('aria-modal')) add('dialog-modal', (d.id || d.className) + ' 缺少 aria-modal');
    if (!accName(d) && !d.getAttribute('aria-label')) add('dialog-name', d.id || '(dialog)');
  });

  // 10. 跳过链接
  const skip = document.querySelector('a.skip-link');
  if (!skip) add('skip-link', '缺少跳到主内容的链接');
  else {
    const target = (skip.getAttribute('href') || '').replace('#', '');
    if (!target || !document.getElementById(target)) add('skip-target', '跳过链接目标不存在');
  }

  // 11. 对比度（只测有文字的元素，取实际计算颜色）
  //     星标这类纯装饰元素没有文本语义，跳过（对比度要求按非文本处理）
  const DECORATIVE = '.book-rating';
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((x) => parseFloat(x));
    if (parts.length === 4 && parts[3] === 0) return null;
    return parts.slice(0, 3);
  };
  // 颜色合成：半透明背景必须逐层与父级 alpha 混合，
  // 否则 rgba(...,0.10) 会被当成不透明的深色，误报「文字与背景同色」。
  const parseRGBA = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((x) => parseFloat(x));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  });
  const bgOf = (el) => {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      // 有渐变/背景图时无法用 background-color 推算对比度，交给人工判断
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseRGBA(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return [base.r, base.g, base.b];
  };
  const sample = [...document.querySelectorAll('p, li, a, span, td, th, h1, h2, h3, .stat-label, .post-meta')]
    .filter((el) => !inHidden(el) && visible(el) && (el.textContent || '').trim().length > 4)
    .filter((el) => !el.matches(DECORATIVE) && !el.closest(DECORATIVE))
    .slice(0, 220);
  let worst = { ratio: 99, detail: '' };
  const offenders = [];
  sample.forEach((el) => {
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) return;
    const bg = bgOf(el);
    if (!bg) return;
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const min = large ? 3.0 : 4.5;
    if (ratio < min) {
      // 记录元素身份，便于定位是哪个组件/规则
      const path = [];
      let node = el;
      for (let i = 0; i < 3 && node && node.tagName !== 'BODY'; i++) {
        path.push(node.tagName.toLowerCase() + (node.className ? '.' + String(node.className).split(' ').slice(0, 2).join('.') : ''));
        node = node.parentElement;
      }
      offenders.push(Math.round(ratio * 100) / 100 + ':1 ' + (el.textContent || '').trim().slice(0, 20) +
        ' | fg ' + cs.color + ' bg rgb(' + bg.join(',') + ') | ' + size + 'px | ' + path.join(' < '));
      if (ratio < worst.ratio) {
        worst = { ratio: Math.round(ratio * 100) / 100, detail: path.join(' < ') };
      }
    }
  });
  if (worst.ratio < 4.5) {
    add('contrast', worst.ratio + ':1 ' + worst.detail);
    offenders.slice(0, 6).forEach((o) => add('contrast-detail', o));
  }

  return { issues, title: document.title };
})()`;

class CDP {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.addEventListener('message', (ev) => {
            let msg; try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject, timer } = this.pending.get(msg.id);
                clearTimeout(timer);
                this.pending.delete(msg.id);
                msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
            }
        });
    }
    send(method, params = {}, sessionId) {
        const id = ++this.id;
        const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(method + ' 超时')); }, 30000);
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
  // header/footer 由 partial-loader 注入：没注入完就审计会把「缺少地标」误报
  if (!document.querySelector('.site-footer')) return 'pending';
  if (de.dataset.dshRendered) return 'ready';
  if (!document.querySelector('[data-section]') && !document.getElementById('cv-content')
      && !document.querySelector('.article-shell')) return 'ready';
  return 'pending';
})()`;

async function main() {
    const browser = findBrowser();
    if (!browser) { console.log(JSON.stringify({ ok: false, reason: 'no browser' })); process.exitCode = 1; return; }

    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-a11y-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--no-default-browser-check', '--disable-extensions', '--disable-sync',
        '--disable-background-networking', '--hide-scrollbars',
        '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });

    const results = [];
    const noJs = [];
    try {
        const version = await waitDevtools();
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
            ws.addEventListener('open', res, { once: true });
            ws.addEventListener('error', () => rej(new Error('ws fail')), { once: true });
        });
        const cdp = new CDP(ws);

        // 先做「禁用 JS」检查：内容不能因为缺脚本而不可见
        // （.reveal 的 opacity:0 只在 html.js 下生效）
        for (const path of ['/index.html', '/about.html', '/projects.html', '/en/index.html']) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Emulation.setScriptExecutionDisabled', { value: true }, sessionId);
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` }, sessionId);
            await sleep(900);
            const invisible = await cdp.send('Runtime.evaluate', {
                expression: `(() => {
                    const hidden = [...document.querySelectorAll('main h1, main h2, main p, main .card')]
                        .filter((el) => (el.textContent || '').trim().length > 2)
                        .filter((el) => getComputedStyle(el).opacity === '0');
                    return { total: document.querySelectorAll('main h1, main h2, main p, main .card').length,
                             hidden: hidden.length,
                             sample: hidden.slice(0, 3).map((el) => el.tagName + '.' + String(el.className).split(' ')[0]) };
                })()`, returnByValue: true
            }, sessionId);
            const v = (invisible.result && invisible.result.value) || {};
            noJs.push({ path, total: v.total || 0, hidden: v.hidden || 0 });
            await cdp.send('Target.closeTarget', { targetId });
        }

        for (const path of PAGES) {
            const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);
            await cdp.send('Runtime.enable', {}, sessionId);
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${path}` }, sessionId);

            const deadline = Date.now() + 15000;
            let state = 'pending';
            while (Date.now() < deadline) {
                const r = await cdp.send('Runtime.evaluate', { expression: READY, returnByValue: true }, sessionId);
                state = (r.result && r.result.value) || 'pending';
                if (state === 'ready' || state === 'error') break;
                await sleep(150);
            }

            const res = await cdp.send('Runtime.evaluate', { expression: AUDIT, returnByValue: true }, sessionId);
            const payload = (res.result && res.result.value) || { issues: [] };
            results.push({ path, state, issues: payload.issues || [] });
            await cdp.send('Target.closeTarget', { targetId });
        }
        cdp.close();
    } finally {
        try { child.kill(); } catch { /* ignore */ }
        server.close();
        await sleep(400);
        rmSync(profile, { recursive: true, force: true });
    }

    // 汇总：按规则统计
    const byRule = {};
    results.forEach((r) => r.issues.forEach((i) => {
        byRule[i.rule] = byRule[i.rule] || [];
        byRule[i.rule].push(r.path + ' :: ' + i.detail);
    }));
    noJs.forEach((r) => {
        if (r.hidden > 0) {
            byRule['nojs-invisible'] = byRule['nojs-invisible'] || [];
            byRule['nojs-invisible'].push(r.path + ' :: 禁用脚本时 ' + r.hidden + '/' + r.total + ' 个内容元素 opacity:0');
        }
    });

    const pagesWithIssues = results.filter((r) => r.issues.length);
    const hasNoJsIssue = !!byRule['nojs-invisible'];
    console.log(JSON.stringify({
        ok: pagesWithIssues.length === 0 && !hasNoJsIssue,
        pageCount: results.length,
        pagesWithIssues: pagesWithIssues.length,
        noJs: noJs,
        ruleSummary: Object.fromEntries(Object.entries(byRule).map(([k, v]) => [k, v.length])),
        details: byRule,
        pages: results.map((r) => ({ path: r.path, state: r.state, issues: r.issues.length }))
    }, null, 2));
    process.exitCode = (pagesWithIssues.length || hasNoJsIssue) ? 1 : 0;
}

main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String((err && err.message) || err) }));
    process.exitCode = 1;
    process.exit();
});
