"""给所有页面加上「有 JS」标记类，并让滚动渐入只在有 JS 时生效。

用法：python tools/add-js-flag.py

为什么需要：
    .reveal { opacity: 0 } 是无条件的，而 .is-visible 由 JS 的 IntersectionObserver 添加。
    脚本被禁用 / 加载失败时，首页一大片内容会**永久不可见**（不是"没动画"那么轻）。
    加一个 html.js 标记后，CSS 写成 `html.js .reveal { opacity: 0 }`：
      - 有 JS：行为完全不变
      - 无 JS：内容正常显示，只是没有渐入动画

    标记必须尽早加（head 内联脚本，样式表之前），否则会闪一下。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

SNIPPET = (
    '<script>/* 标记「脚本可用」：滚动渐入只在有 JS 时隐藏内容，避免禁用脚本时整页空白 */\n'
    '        document.documentElement.classList.add(\'js\');</script>\n'
)

files = sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("en/**/*.html")) + sorted(ROOT.glob("blog/*.html"))
report = []
for path in files:
    html = path.read_text(encoding="utf-8")
    if "classList.add('js')" in html or 'classList.add("js")' in html:
        report.append({"file": str(path.relative_to(ROOT)).replace("\\", "/"), "status": "already"})
        continue
    m = re.search(r'(\s*)(<link rel="stylesheet" href="[^"]*assets/css/style\.css">)', html)
    if not m:
        report.append({"file": str(path.relative_to(ROOT)).replace("\\", "/"), "status": "no-stylesheet-link"})
        continue
    html = html[:m.start(2)] + SNIPPET + html[m.start(2):]
    path.write_text(html, encoding="utf-8")
    report.append({"file": str(path.relative_to(ROOT)).replace("\\", "/"), "status": "added"})

added = sum(1 for r in report if r["status"] == "added")
print(f"js 标记：新增 {added} 个文件，跳过 {len(report) - added} 个")
for r in report:
    if r["status"] != "added":
        print("  -", r["file"], r["status"])
