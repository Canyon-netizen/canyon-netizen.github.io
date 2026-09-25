"""给所有页面注入 <noscript> 说明（禁用脚本时的可达内容提示）。

用法：python tools/add-noscript-notice.py

为什么需要：
    本站的内容（data.json → 各区块）完全由 JS 渲染。禁用脚本时页面只剩骨架，
    读者会以为网站坏了。这里给出一句解释 + 一个不需要 JS 也能拿到的替代内容
    （PDF 简历），并说明导航仍可用。纯 HTML，不依赖任何脚本。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

BLOCK = """    <noscript>
        <div class="noscript-note">
            <strong>{title}</strong>
            {body}
        </div>
    </noscript>

"""

ZH = {
    "title": "本站的内容由 JavaScript 渲染。",
    "body": '当前浏览器禁用了脚本，页面只会显示静态骨架。你仍然可以用上方与下方的导航浏览各页面，'
            '或直接下载 <a href="{base}assets/files/cv.pdf">PDF 简历</a> 查看完整经历。',
}
EN = {
    "title": "This site renders its content with JavaScript.",
    "body": 'Scripting appears to be disabled, so only the static shell is shown. '
            'You can still browse pages through the navigation above and below, or download the '
            '<a href="{base}assets/files/cv.pdf">PDF CV</a> for the full background.',
}

files = sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("en/**/*.html")) + sorted(ROOT.glob("blog/*.html"))
report = []
for path in files:
    html = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    if 'class="noscript-note"' in html:
        report.append({"file": rel, "status": "already"})
        continue
    m = re.search(r'^([ \t]*)<main\b', html, re.M)
    if not m:
        report.append({"file": rel, "status": "no-main"})
        continue

    is_en = rel.startswith("en/")
    # 相对前缀必须按页面**实际深度**算：blog/xxx.html 是两层深（../../），
    # 不能只判断 en/ 前缀（否则文章页会拿到错误的 assets 路径）
    depth = rel.count("/")
    base = "../" * depth
    cfg = EN if is_en else ZH
    block = BLOCK.format(title=cfg["title"], body=cfg["body"].format(base=base))

    html = html[:m.start()] + block + html[m.start():]
    path.write_text(html, encoding="utf-8")
    report.append({"file": rel, "status": "added", "lang": "en" if is_en else "zh"})

added = sum(1 for r in report if r["status"] == "added")
print(f"noscript 说明：新增 {added} 个文件")
for r in report:
    if r["status"] != "added":
        print("  -", r["file"], r["status"])
