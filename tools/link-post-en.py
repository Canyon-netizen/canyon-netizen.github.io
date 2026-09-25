"""为 posts 补充 hrefEn（英文文章页路径），供英文博客列表与相邻文章导航使用。

用法：python tools/link-post-en.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

report = []
for post in data.get("posts", []):
    slug = post.get("slug")
    if not slug:
        continue
    en_path = ROOT / "en" / "blog" / f"{slug}.html"
    if en_path.exists():
        # 存「站点根相对」路径，渲染时由 sitePath() 按页面深度补前缀：
        # 直接写 en/blog/… 会变成 ../en/blog/…（英文列表页下会 404）
        post["hrefEn"] = f"blog/{slug}.html"
        report.append({"slug": slug, "hrefEn": post["hrefEn"]})
    else:
        post.pop("hrefEn", None)
        report.append({"slug": slug, "hrefEn": None})

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": report}, ensure_ascii=False, indent=2))
