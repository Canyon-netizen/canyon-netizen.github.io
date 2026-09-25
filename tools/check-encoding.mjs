/* 检测编码损坏：UTF-8 文件被按 ANSI(GBK) 误读后再写回会产生典型乱码字符。
 * 用法：node tools/check-encoding.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
// UTF-8 被按 GBK 误读再写回时的典型「多字组合」。
// 注意不要用单字：像「缓」「存」「滑」「香」都是正常中文，会误报。
const MOJIBAKE = /(?:鍛ㄧ澘|涓汉涓婚〉|缂撳瓨|鎼滅储|椤圭洰|鍒嗕韩|绠€鍘|鏂囩珷|瀛︾|鍗氬|璁烘枃|鐮旂┒|娆㈣繋|妞ゅ爼|涓嶅Θ|鐐广€|鍏充簬)/;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        if (['.git', 'node_modules', '.dsh-dom', '.dsh-shots', 'docs'].includes(name)) continue;
        if (name.startsWith('.dsh-')) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(html|json|js|css|md|xml)$/.test(name)) out.push(p);
    }
    return out;
}

const report = [];
for (const abs of walk(ROOT)) {
    const buf = readFileSync(abs);
    const text = buf.toString('utf8');
    const rel = relative(ROOT, abs).replace(/\\/g, '/');

    const issues = [];

    // 1) 乱码字符
    if (MOJIBAKE.test(text)) {
        const m = text.match(new RegExp(MOJIBAKE.source + '.{0,12}'));
        issues.push('疑似乱码：' + (m ? m[0] : '?'));
    }

    // 2) 替换字符（无效 UTF-8 被解码的结果）
    if (text.includes('\uFFFD')) issues.push('包含 U+FFFD 替换字符');

    // 3) 页面内联 __PAGE_META__ 是否仍是合法 JSON
    const meta = text.match(/window\.__PAGE_META__\s*=\s*(\{[\s\S]*?\});<\/script>/);
    if (meta) {
        try {
            JSON.parse(meta[1]);
        } catch (err) {
            issues.push('__PAGE_META__ JSON 无效：' + err.message);
        }
    }

    // 4) JSON 文件能否解析
    if (rel.endsWith('.json')) {
        try { JSON.parse(text); } catch (err) { issues.push('JSON 解析失败：' + err.message); }
    }

    if (issues.length) report.push({ file: rel, issues });
}

console.log(JSON.stringify({ checked: walk(ROOT).length, damaged: report.length, report }, null, 2));
process.exitCode = report.length ? 1 : 0;
