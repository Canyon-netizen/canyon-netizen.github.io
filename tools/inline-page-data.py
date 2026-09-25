"""把 data.json 内联进各页面，消除「内容后到」导致的布局抖动。

用法：python tools/inline-page-data.py

为什么：
    页面的正文内容是 `page-renderer.js` / `cv-renderer.js` 在 **首屏之后**
    `fetch('data.json')` 再插入的。实测（tools/layout-probe.mjs）：
    about.html 在 50ms 时区块高 40px，数据到位后变成 234px，页脚被推下 654px；
    首页更夸张，整体被推下 1550px —— 这就是 CLS 的主要来源。

    把数据作为内联 `<script type="application/json" data-page-data>` 写进页面，
    脚本渲染时直接取用，不必等网络请求，内容在首次绘制就存在。
    仍然保留 fetch 作为兜底（内联块缺失时行为不变）。

注意：data.json 改动后要重跑本脚本（生成器 make-articles.py 也会写入同样的块）。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
PAYLOAD = json.dumps(DATA, ensure_ascii=False, separators=(",", ":"))

BLOCK = ('<script type="application/json" data-page-data>'
         # 转义 </ 防止 JSON 里的 </script> 提前闭合；顺带避免 </section> 之类的
         # 标签文本出现在 HTML 里，干扰按字符串定位的后续注入脚本
         + PAYLOAD.replace("</", "<\\/")
         + "</script>\n")

# 内联块放在页面自身脚本之前（defer 脚本解析时会立刻用到）
PATTERN = re.compile(r'[ \t]*<script type="application/json" data-page-data>[\s\S]*?</script>\n')

files = sorted(ROOT.glob("*.html")) + sorted(ROOT.glob("en/**/*.html")) + sorted(ROOT.glob("blog/*.html"))
report = []
for path in files:
    html = path.read_text(encoding="utf-8")
    rel = str(path.relative_to(ROOT)).replace("\\", "/")
    removed = len(PATTERN.findall(html))
    html = PATTERN.sub("", html)

    # 插到第一个 defer 脚本之前；没有就插在 </body> 前
    m = re.search(r'^([ \t]*)<script defer src=', html, re.M)
    if m:
        html = html[:m.start()] + BLOCK + html[m.start():]
    else:
        html = html.replace("</body>", BLOCK + "</body>")

    path.write_text(html, encoding="utf-8")
    report.append({"file": rel, "replaced": removed, "bytes": len(PAYLOAD)})

print(f"内联页面数据：{len(report)} 个文件，每页 {len(PAYLOAD)//1024}KB JSON")
for r in report:
    if r["replaced"]:
        print(f"  (替换已有块) {r['file']}")
