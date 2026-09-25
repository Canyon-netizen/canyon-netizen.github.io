"""给主题页注入「相关文章」区块（中英各自文案）。

用法：python tools/add-related-sections.py

对应渲染器：page-renderer.js 的 renderRelatedPosts（data-section="related-posts"）。
关联关系来自 data.json 的 posts[].relatedPages，由 tools/tag-related-posts.py 写入。
区块在无关联文章时会被渲染器整块移除，不会留下空标题。
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CMD = {
    "zh": {"title": "相关文章", "aria": "相关文章"},
    "en": {"title": "Related articles", "aria": "Related articles"},
}

# 页面 → 数据键（渲染器按 data-page-key 过滤文章）
PAGES = {
    "talks.html": "talks",
    "research.html": "research",
    "publications.html": "publications",
    "en/talks.html": "talks",
    "en/research.html": "research",
    "en/publications.html": "publications",
}

report = []
for rel, key in PAGES.items():
    path = ROOT / rel
    html = path.read_text(encoding="utf-8")
    if 'data-section="related-posts"' in html:
        report.append({"file": rel, "status": "already"})
        continue

    lang = "en" if rel.startswith("en/") else "zh"
    t = CMD[lang]
    block = (
        f'\n            <section class="related-section" data-section="related-posts" data-page-key="{key}"\n'
        f'                     aria-label="{t["aria"]}">\n'
        f'                <h2 class="related-section-title">{t["title"]}</h2>\n'
        f'                <div class="related-list" data-related-posts></div>\n'
        f'            </section>\n'
    )

    # 插在最后一个 </section> 之后（即页面主内容区末尾）
    # 用字符串定位而不是行锚正则：这些页面的 </section> 常带缩进且后面紧跟 </div>，
    # 行锚正则匹配不到
    idx = html.rfind("</section>")
    if idx < 0:
        report.append({"file": rel, "status": "no-anchor"})
        continue
    insert_at = idx + len("</section>")
    html = html[:insert_at] + block.rstrip("\n") + html[insert_at:]
    path.write_text(html, encoding="utf-8")
    report.append({"file": rel, "status": "added", "key": key, "lang": lang})

added = sum(1 for r in report if r["status"] == "added")
print(f"相关文章区块：新增 {added} 个页面")
for r in report:
    if r["status"] != "added":
        print("  -", r["file"], r["status"])
