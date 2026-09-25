"""把现有博客文章的正文抽取成 HTML 片段，写回 data.json 的 posts[].content。

用法：
    python tools/extract-post-content.py

用途：
    文章正文以前只存在于 blog/*.html 里，英文页没有对应内容。
    抽取到 data.json 后，中英文章都由同一个模板 + 数据渲染，
    新增语言只需补一份 content 翻译。
    本脚本只负责「把 <article class="post-content"> 里的内容搬进 data.json」，
    不会改动正文内容本身（含 <pre> 内的缩进）。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

report = []
for post in data.get("posts", []):
    href = post.get("href", "")
    path = ROOT / href
    if not path.exists():
        report.append({"slug": post.get("slug"), "status": "missing", "href": href})
        continue

    html = path.read_text(encoding="utf-8")
    m = re.search(r'<article class="post-content">([\s\S]*?)</article>', html)
    if not m:
        report.append({"slug": post.get("slug"), "status": "no-article-tag"})
        continue

    body = m.group(1)
    # 去掉包裹层带来的整体缩进（每行至少 16 空格），但保留 <pre> 内部的相对缩进
    lines = body.split("\n")
    indents = [len(ln) - len(ln.lstrip(" ")) for ln in lines if ln.strip()]
    base = min(indents) if indents else 0
    dedented = "\n".join(ln[base:] if ln.strip() else "" for ln in lines).strip()

    post["content"] = dedented
    report.append({
        "slug": post.get("slug"),
        "status": "extracted",
        "chars": len(dedented),
        "hasCode": "<pre>" in dedented,
    })

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": report}, ensure_ascii=False, indent=2))
