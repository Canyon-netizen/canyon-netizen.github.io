"""从 data.json 生成 search-index.json / search-index-en.json。

用法：python tools/make-search-index.py

与 rss/sitemap 一样，索引不再手写，避免「改了内容忘记重建索引」。
每条记录字段：
    title    标题
    excerpt  摘要（列表里显示）
    body     正文纯文本（仅文章；用于全文检索，命中后从正文里截取片段）
    url      站点根相对地址
    type     page | news | post | project | direction | talk | book | hobby
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def plain(fragment: str, limit: int = 0) -> str:
    text = TAG_RE.sub(" ", fragment or "")
    text = html.unescape(text)
    text = WS_RE.sub(" ", text).strip()
    return text[:limit] if limit else text


def first_sentence(text: str, limit: int = 110) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    for sep in ("。", "；", "，", ". ", "; "):
        idx = cut.rfind(sep)
        if idx > limit * 0.5:
            return cut[: idx + 1]
    return cut + "…"


# 页面清单：路径、标题键、导语键（pages.<key>）
PAGES = [
    ("index.html", "home"),
    ("about.html", "about"),
    ("research.html", "research"),
    ("publications.html", "publications"),
    ("projects.html", "projects"),
    ("blog.html", "blog"),
    ("talks.html", "talks"),
    ("books.html", "books"),
    ("hobbies.html", "hobbies"),
    ("cv.html", "cv"),
]

pages_cfg = DATA.get("pages", {})


def build(lang: str) -> list[dict]:
    en = lang == "en"
    prefix = "en/" if en else ""
    out: list[dict] = []

    # ---- 页面 ----
    for path, key in PAGES:
        cfg = pages_cfg.get(key, {})
        title = (cfg.get("titleEn") or cfg.get("title") or "") if en else (cfg.get("title") or "")
        lead = (cfg.get("leadEn") or cfg.get("lead") or "") if en else (cfg.get("lead") or "")
        if not title:
            # 兜底：用中文标题
            title = cfg.get("title", "")
            lead = cfg.get("lead", "")
        if not (ROOT / prefix / path).exists() and not (ROOT / path).exists():
            continue
        out.append({
            "title": title,
            "excerpt": plain(lead, 160),
            "url": f"{prefix}{path}",
            "type": "page",
        })

    # ---- 动态：动态时间线（指向首页）----
    for item in DATA.get("news", []):
        text = plain((item.get("contentEn") or item.get("content", "")) if en else item.get("content", ""))
        date = item.get("date", "")
        out.append({
            "title": f"{date} {first_sentence(text, 40)}".strip(),
            "excerpt": text[:160],
            "url": f"{prefix}index.html",
            "type": "news",
        })

    # ---- 文章 ----
    for post in DATA.get("posts", []):
        if not post.get("published"):
            continue
        slug = post.get("slug")
        zh_url = post.get("href", f"blog/{slug}.html")
        en_url = post.get("hrefEn", f"blog/{slug}.html")
        body_html = (post.get("contentEn") or post.get("content", "")) if en else post.get("content", "")
        title = ((post.get("titleEn") or post.get("title", "")) if en else post.get("title", ""))
        excerpt = ((post.get("excerptEn") or post.get("excerpt", "")) if en else post.get("excerpt", ""))
        if en:
            # 英文索引指向 en/blog/…
            url = f"en/{en_url}"
        else:
            url = zh_url
        out.append({
            "title": title,
            "excerpt": plain(excerpt, 160),
            "body": plain(body_html),
            "url": url,
            "type": "post",
        })

    # ---- 项目 ----
    for pr in DATA.get("projects", []):
        title = (pr.get("titleEn") or pr.get("title", "")) if en else pr.get("title", "")
        desc = (pr.get("descriptionEn") or pr.get("description", "")) if en else pr.get("description", "")
        tech = "、".join(pr.get("tech", []) or [])
        out.append({
            "title": title,
            "excerpt": plain((desc + (" 技术栈 " + tech if tech else "")).strip(), 170),
            "url": f"{prefix}projects.html",
            "type": "project",
        })

    # ---- 研究方向 ----
    for d in DATA.get("researchDirections", []):
        title = (d.get("titleEn") or d.get("title", "")) if en else d.get("title", "")
        desc = (d.get("descriptionEn") or d.get("description", "")) if en else d.get("description", "")
        out.append({
            "title": title,
            "excerpt": plain(desc, 170),
            "url": f"{prefix}research.html",
            "type": "direction",
        })

    # ---- 分享 / 书单 / 爱好（有内容才索引）----
    for t in DATA.get("talks", []):
        title = (t.get("titleEn") or t.get("title", "")) if en else t.get("title", "")
        desc = (t.get("descEn") or t.get("desc", "")) if en else t.get("desc", "")
        out.append({"title": title, "excerpt": plain(desc, 150), "url": f"{prefix}talks.html", "type": "talk"})

    for group in DATA.get("books", []):
        for b in group.get("items", []):
            title = (b.get("titleEn") or b.get("title", "")) if en else b.get("title", "")
            comment = (b.get("commentEn") or b.get("comment", "")) if en else b.get("comment", "")
            author = (b.get("authorEn") or b.get("author", "")) if en else b.get("author", "")
            out.append({
                "title": title,
                "excerpt": plain((author + " " + comment).strip(), 150),
                "url": f"{prefix}books.html",
                "type": "book",
            })

    for h in DATA.get("hobbies", []):
        title = (h.get("nameEn") or h.get("name", "")) if en else h.get("name", "")
        desc = (h.get("descEn") or h.get("desc", "")) if en else h.get("desc", "")
        out.append({"title": title, "excerpt": plain(desc, 150), "url": f"{prefix}hobbies.html", "type": "hobby"})

    return out


for lang, filename in (("zh", "search-index.json"), ("en", "search-index-en.json")):
    items = build(lang)
    (ROOT / filename).write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    counts: dict[str, int] = {}
    for it in items:
        counts[it["type"]] = counts.get(it["type"], 0) + 1
    with_body = sum(1 for it in items if it.get("body"))
    print(f"{filename}: {len(items)} 条 {counts}，含正文 {with_body} 条")
