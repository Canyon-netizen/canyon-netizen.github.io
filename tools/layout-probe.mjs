/* ============================================================
 * layout-probe.mjs — 定位布局偏移来源
 * ------------------------------------------------------------
 * 在导航后按时间点抓取页面结构快照（各区块的 top / height / hidden），
 * 用来判断 CLS 到底是「骨架高度与最终内容不一致」还是「图片没留位」。
 *
 * 用法：node tools/layout-probe.mjs /about.html
 * ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const ROOT = process.cwd();
const TARGET = process.argv[2] || '/about.html';
const PORT = 8170;
const CDP_PORT = 9233;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf'
};

const server = createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, '.' + p);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
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

const SNAPSHOT = `(() => {
  const rows = [...document.querySelectorAll('section, footer.site-footer, main, .card, .info-card')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''),
      top: Math.round(r.top + window.scrollY),
      h: Math.round(r.height),
      hidden: el.hasAttribute('hidden') || getComputedStyle(el).display === 'none'
    };
  });
  return { scrollH: document.body.scrollHeight, rendered: !!document.documentElement.dataset.dshRendered, rows };
})()`;

async function main() {
    const browser = findBrowser();
    await new Promise((res) => server.listen(PORT, '127.0.0.1', res));
    const profile = join(ROOT, '.dsh-edge-probe-' + randomUUID().slice(0, 8));
    mkdirSync(profile, { recursive: true });
    const child = spawn(browser, [
        '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
        '--disable-extensions', '--hide-scrollbars',
        '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, 'about:blank'
    ], { stdio: 'ignore' });

    try {
        let version;
        for (let i = 0; i < 80; i++) {
            try { const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch { /* retry */ }
            await sleep(250);
        }
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((r) => ws.addEventListener('open', r, { once: true }));
        const cdp = new CDP(ws);
        const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
        await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${TARGET}` }, sessionId);

        const marks = [50, 120, 250, 500, 1000, 2500];
        let prev = null;
        let lastRows = [];
        for (const t of marks) {
            await sleep(t - (prev || 0));
            prev = t;
            const r = await cdp.send('Runtime.evaluate', { expression: SNAPSHOT, returnByValue: true }, sessionId);
            const v = (r.result && r.result.value) || { rows: [] };
            console.log(`\n=== t=${t}ms  rendered=${v.rendered}  scrollH=${v.scrollH}`);
            const changed = [];
            v.rows.forEach((row, i) => {
                const before = lastRows[i];
                const delta = before && before.top !== row.top ? (row.top - before.top) : 0;
                if (delta) changed.push(`${row.tag} ${delta > 0 ? '+' : ''}${delta}`);
                console.log(`    ${row.tag.slice(0, 40).padEnd(40)} top=${String(row.top).padStart(5)} h=${String(row.h).padStart(4)}${row.hidden ? ' [hidden]' : ''}${delta ? '  Δ' + (delta > 0 ? '+' : '') + delta : ''}`);
            });
            if (changed.length) console.log('    >>> 变化：' + changed.join(' | '));
            lastRows = v.rows;
        }
        cdp.close();
    } finally {
        try { child.kill(); } catch { /* ignore */ }
        server.close();
        await sleep(300);
        rmSync(profile, { recursive: true, force: true });
    }
}

main().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
