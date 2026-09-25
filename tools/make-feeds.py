"""从 data.json 生成 rss.xml 与 sitemap.xml。

用法：
    python tools/make-feeds.py

为什么要有这个脚本：
    rss.xml / sitemap.xml 以前是手写的，内容与 data.json 重复维护 ——
    新增一篇文章要改 4 个地方（data.json / blog.html / rss.xml / sitemap.xml），
    漏掉任何一处都会让「有博客但订阅源里没有」这种问题长期存在。
    现在这两个文件由脚本生成，数据源只有 data.json + 磁盘上的页面文件。

注意：生成的文件不要手工编辑，改数据后重跑本脚本即可。
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone, timedelta
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))

SITE = "https://canyon-netizen.github.io"
CST = timezone(timedelta(hours=8))
NAME = DATA["personal"]["name"]
NAME_EN = DATA["personal"].get("nameEn", NAME)


def iso_date(value: str) -> str:
    """把 2026-06-20 / 2026.06.20 统一成 2026-06-20。"""
    return str(value).replace(".", "-").strip()


def to_rfc822(date_str: str) -> str:
    try:
        dt = datetime.strptime(iso_date(date_str), "%Y-%m-%d").replace(tzinfo=CST)
    except ValueError:
        dt = datetime.now(CST)
    return format_datetime(dt)


def to_w3c(date_str: str) -> str:
    try:
        dt = datetime.strptime(iso_date(date_str), "%Y-%m-%d").replace(tzinfo=CST)
    except ValueError:
        dt = datetime.now(CST)
    return dt.isoformat(timespec="seconds")


# ---------------- RSS ----------------
posts = [p for p in (DATA.get("posts") or []) if p.get("published")]
posts.sort(key=lambda p: iso_date(p.get("date", "")), reverse=True)

channel_title = f"{NAME} - 博客"
channel_desc = (DATA.get("pages", {}).get("blog", {}).get("lead")
                or "学习笔记、研究随想、技术分享")

items = []
for post in posts:
    url = f"{SITE}/{str(post.get('href', '')).lstrip('/')}"
    title = post.get("title", "")
    desc = post.get("excerpt", "")
    category = post.get("categoryLabel", "")
    items.append(f"""    <item>
      <title>{escape(title)}</title>
      <link>{escape(url)}</link>
      <description>{escape(desc)}</description>
      <pubDate>{to_rfc822(post.get("date", ""))}</pubDate>
      <guid isPermaLink="true">{escape(url)}</guid>
      <category>{escape(category)}</category>
    </item>""")

last_build = to_rfc822(posts[0]["date"]) if posts else format_datetime(datetime.now(CST))

rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{escape(channel_title)}</title>
    <link>{SITE}/</link>
    <description>{escape(channel_desc)}</description>
    <language>zh-CN</language>
    <atom:link href="{SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>{last_build}</lastBuildDate>

{chr(10).join(items) if items else "    <!-- 暂无已发布文章 -->"}
  </channel>
</rss>
"""
(ROOT / "rss.xml").write_text(rss, encoding="utf-8")
print(f"rss.xml: {len(posts)} 篇已发布文章")

# 英文订阅源：同样的文章，标题与摘要取 xxxEn，链接指向英文文章页
items_en = []
for post in posts:
    slug = str(post.get("slug", ""))
    if not (ROOT / "en" / "blog" / f"{slug}.html").exists():
        continue
    url = f"{SITE}/en/blog/{slug}.html"
    title = post.get("titleEn") or post.get("title", "")
    desc = post.get("excerptEn") or post.get("excerpt", "")
    category = post.get("categoryLabelEn") or post.get("categoryLabel", "")
    items_en.append(f"""    <item>
      <title>{escape(title)}</title>
      <link>{escape(url)}</link>
      <description>{escape(desc)}</description>
      <pubDate>{to_rfc822(post.get("date", ""))}</pubDate>
      <guid isPermaLink="true">{escape(url)}</guid>
      <category>{escape(category)}</category>
    </item>""")

rss_en = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{escape(NAME_EN)} - Blog</title>
    <link>{SITE}/en/</link>
    <description>Study notes, research reflections and technical write-ups.</description>
    <language>en</language>
    <atom:link href="{SITE}/rss-en.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>{last_build}</lastBuildDate>

{chr(10).join(items_en) if items_en else "    <!-- no published posts yet -->"}
  </channel>
</rss>
"""
(ROOT / "rss-en.xml").write_text(rss_en, encoding="utf-8")
print(f"rss-en.xml: {len(items_en)} 篇英文文章")

# ---------------- sitemap ----------------
# 页面清单：磁盘上真实存在的中英页面（避免手写列表与实际文件脱节）
PAGE_PRIORITY = {
    "index.html": ("weekly", "1.0"),
    "about.html": ("monthly", "0.8"),
    "research.html": ("monthly", "0.9"),
    "publications.html": ("monthly", "0.8"),
    "projects.html": ("monthly", "0.8"),
    "blog.html": ("weekly", "0.9"),
    "talks.html": ("monthly", "0.7"),
    "books.html": ("monthly", "0.6"),
    "hobbies.html": ("monthly", "0.6"),
    "cv.html": ("monthly", "0.8"),
}
# 文章页用发布日期做 lastmod
POST_LASTMOD = {
    str(p.get("href", "")).replace("blog/", "").strip(): iso_date(p.get("date", ""))
    for p in (DATA.get("posts") or [])
}

entries = []


def add(url: str, changefreq: str, priority: str, lastmod: str = "") -> None:
    block = f"  <url>\n    <loc>{escape(url)}</loc>\n"
    if lastmod:
        block += f"    <lastmod>{lastmod}</lastmod>\n"
    block += f"    <changefreq>{changefreq}</changefreq>\n    <priority>{priority}</priority>\n  </url>"
    entries.append(block)


# 中文页面
for page, (freq, prio) in PAGE_PRIORITY.items():
    if not (ROOT / page).exists():
        continue
    url = f"{SITE}/" if page == "index.html" else f"{SITE}/{page}"
    add(url, freq, prio)

# 英文页面（同构镜像，优先级略低）
for page, (freq, prio) in PAGE_PRIORITY.items():
    if not (ROOT / "en" / page).exists():
        continue
    add(f"{SITE}/en/{page}", freq, str(round(float(prio) - 0.1, 1)))

# 博客文章
for name, lastmod in sorted(POST_LASTMOD.items(), key=lambda kv: kv[1], reverse=True):
    if not (ROOT / "blog" / name).exists():
        continue
    add(f"{SITE}/blog/{name}", "yearly", "0.7", lastmod)
    # 英文版（由 tools/make-articles.py 生成）
    if (ROOT / "en" / "blog" / name).exists():
        add(f"{SITE}/en/blog/{name}", "yearly", "0.7", lastmod)

sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           + "\n".join(entries) + "\n</urlset>\n")
(ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")
print(f"sitemap.xml: {len(entries)} 个 URL（含 {len(POST_LASTMOD)} 篇文章）")
