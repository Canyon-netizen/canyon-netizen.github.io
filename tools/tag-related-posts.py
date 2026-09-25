"""给文章打上「相关页面」标签，供各主题页的「相关文章」区块使用。

用法：python tools/tag-related-posts.py

页面键（写在页面的 data-page-key 上）：talks / research / publications / projects / about / cv

为什么：
    talks / research / publications 这些页面本身内容就少（分享记录、论文尚未公开），
    读者点进来看到的是一片空白。把已发布的文章按主题挂上去，既是真实内容，
    也给了继续阅读的出口。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

# 按文章实际内容归类（不是泛泛地全挂）
TAGS = {
    "2026-06-20-research-notes": ["research", "publications", "talks"],
    "2026-05-08-python-config": ["projects", "cv", "research"],
}

report = []
for post in data.get("posts", []):
    slug = post.get("slug")
    tags = TAGS.get(slug)
    if tags is None:
        continue
    post["relatedPages"] = tags
    post["relatedPagesEn"] = tags          # 中英页面键一致，指向各自语言的文章
    report.append({"slug": slug, "pages": tags})

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"tagged": report}, ensure_ascii=False, indent=2))
