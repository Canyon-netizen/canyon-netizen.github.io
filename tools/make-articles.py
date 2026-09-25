"""从 data.json 生成中英双语博客文章页。

用法：python tools/make-articles.py

产出（每个已发布文章两个语言版本）：
    blog/<slug>.html      中文（HTML lang="zh-CN"）
    en/blog/<slug>.html   英文（HTML lang="en"）

为什么用生成而不是手写：
    文章页此前只有中文版，英文站的博客列表点进去是中文页面，语言切换也拿不到对应文章。
    现在正文放在 data.json（content / contentEn），头尾与目录结构由同一个模板产出，
    语言路由（langZhHref / langEnHref）与 hreflang 自动成对，不会漏。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
SITE = "https://canyon-netizen.github.io"

BASE_META = {
    "themeTitle": "切换主题",
    "navToggleLabel": "切换导航",
    "footerCreditPrefix": "由",
    "footerCreditSuffix": "强力驱动",
    "lastUpdatedLabel": "最后更新：",
    "rssTitle": "博客 RSS",
    "searchTitle": "搜索 (Ctrl+K)",
    "searchAriaLabel": "搜索",
    "searchPlaceholder": "搜索文章、论文、项目…",
    "searchCloseLabel": "关闭搜索",
    "searchEmptyText": "输入关键词搜索",
    "navHome": "首页",
    "navAbout": "关于",
    "navResearch": "研究",
    "navPublications": "论文",
    "navProjects": "项目",
    "navBlog": "博客",
    "navTalks": "分享",
    "navCV": "简历",
    "navBooks": "阅读",
    "navHobbies": "爱好",
    "navMore": "更多",
}
BASE_META_EN = {
    "themeTitle": "Toggle theme",
    "navToggleLabel": "Toggle navigation",
    "footerCreditPrefix": "Powered by",
    "footerCreditSuffix": "",
    "lastUpdatedLabel": "Last updated:",
    "rssTitle": "Blog RSS",
    "searchTitle": "Search (Ctrl+K)",
    "searchAriaLabel": "Search",
    "searchPlaceholder": "Search articles, papers, projects…",
    "searchCloseLabel": "Close search",
    "searchEmptyText": "Type to search",
    "navHome": "Home",
    "navAbout": "About",
    "navResearch": "Research",
    "navPublications": "Publications",
    "navProjects": "Projects",
    "navBlog": "Blog",
    "navTalks": "Talks",
    "navCV": "CV",
    "navBooks": "Books",
    "navHobbies": "Hobbies",
    "navMore": "More",
}

UI = {
    "zh": {
        "htmlLang": "zh-CN",
        "skip": "跳转到主要内容",
        "backBlog": "← 返回博客列表",
        "home": "首页",
        "blog": "博客",
        "toc": "📑 目录",
        "tocAria": "文章目录",
        "shareHint": "提示：按 ← / → 可在文章间切换",
        "cc": "本文采用 CC BY 4.0 协议，转载请保留原文链接。",
        "navAria": "相邻文章",
        "langText": "EN",
        "langTitle": "Switch to English",
        "brandText": "周睿",
        "breadcrumb": "面包屑导航",
        "noscriptTitle": "本站的内容由 JavaScript 渲染。",
        "noscriptBody": '当前浏览器禁用了脚本，页面只会显示静态骨架。你仍然可以用上方与下方的导航浏览各页面，'
                        '或直接下载 <a href="{base}assets/files/cv.pdf">PDF 简历</a> 查看完整经历。',
    },
    "en": {
        "htmlLang": "en",
        "skip": "Skip to main content",
        "backBlog": "← Back to all posts",
        "home": "Home",
        "blog": "Blog",
        "toc": "📑 On this page",
        "tocAria": "Table of contents",
        "shareHint": "Tip: use ← / → to move between articles",
        "cc": "Licensed under CC BY 4.0 — please keep the original link when sharing.",
        "navAria": "Adjacent articles",
        "langText": "中",
        "langTitle": "Switch to Chinese",
        "brandText": "Zhou Rui",
        "breadcrumb": "Breadcrumb",
        "noscriptTitle": "This site renders its content with JavaScript.",
        "noscriptBody": 'Scripting appears to be disabled, so only the static shell is shown. '
                        'You can still browse pages through the navigation above and below, or download the '
                        '<a href="{base}assets/files/cv.pdf">PDF CV</a> for the full background.',
    },
}

PAGE = """<!DOCTYPE html>
<html lang="{htmlLang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <meta name="description" content="{description}">
    <link rel="canonical" href="{canonical}">
    <link rel="preload" as="style" href="{base}assets/css/style.css">
    <meta property="og:title" content="{title}">
    <meta property="og:description" content="{description}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="{canonical}">

    <script>
        /* 主题早期应用：在样式表解析前确定明暗，避免深色模式白屏闪烁 */
        (function () {{
            try {{
                var k = 'site-theme';
                var s = localStorage.getItem(k);
                var t = (s === 'dark' || s === 'light')
                    ? s
                    : ((window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light');
                document.documentElement.setAttribute('data-theme', t);
            }} catch (e) {{ /* 隐私模式下忽略 */ }}
        }})();
    </script>
    <link rel="stylesheet" href="{base}assets/css/style.css">
    <template data-include="head-base"></template>
    <template data-include="head-blog"></template>
    <script>window.__PAGE_META__ = {meta};</script>
    <script defer src="{base}assets/js/partial-loader.js"></script>
</head>
<body>

    <a href="#main-content" class="skip-link">{skip}</a>

    <template data-include="header"></template>

    <noscript>
        <div class="noscript-note">
            <strong>{noscriptTitle}</strong>
            {noscriptBody}
        </div>
    </noscript>

    <main id="main-content" class="page-main">
        <div class="container narrow article-wide">
            <nav class="breadcrumb" aria-label="{breadcrumb}">
                <a href="{base}index.html">{home}</a>
                <span class="breadcrumb-sep">/</span>
                <a href="{base}{blogIndex}">{blog}</a>
                <span class="breadcrumb-sep">/</span>
                <span>{titleShort}</span>
            </nav>
            <a href="{base}{blogIndex}" class="post-back">{backBlog}</a>

            <header class="post-header">
                <div class="post-meta">
                    <time>{date}</time>
                    <span class="post-category">{category}</span>
                    <span class="read-time">{readTime}</span>
                </div>
                <h1>{titleShort}</h1>
                <p class="post-excerpt">{excerpt}</p>
            </header>

            <div class="article-shell">
                <!-- 自动生成的目录（宽屏时固定左侧） -->
                <aside class="toc" id="toc" aria-label="{tocAria}">
                    <div class="toc-title">{tocTitle}</div>
                </aside>

                <div class="article-main">
                    <article class="post-content">
{body}
                    </article>

                    <footer class="post-footer">
                        <p>{cc}</p>
                    </footer>

                    <!-- 分享 / 复制链接（由 article.js 填充） -->
                    <div class="article-tools">
                        <div class="article-share" data-article-share></div>
                        <span class="article-hint" data-article-hint>{shareHint}</span>
                    </div>

                    <!-- 上一篇 / 下一篇（由 article.js 从 data.json 填充） -->
                    <nav class="article-nav" data-article-nav aria-label="{navAria}"></nav>
                </div>
            </div>
        </div>
    </main>

    <template data-include="footer"></template>
    <template data-include="search-overlay"></template>

    <script defer src="{base}assets/js/article.js"></script>
    <script defer src="{base}assets/js/main.js"></script>
</body>
</html>
"""


def indent_html(fragment: str, spaces: int) -> str:
    pad = " " * spaces
    return "\n".join((pad + ln) if ln.strip() else "" for ln in fragment.split("\n"))


def localize_body(fragment: str, prefix: str) -> str:
    """把站点根相对路径（assets/…）转成文章页可用的相对路径。"""
    return re.sub(r'(src|href)="(?!https?:|mailto:|#|\.\./|/)', rf'\1="{prefix}', fragment)


def build(post: dict, lang: str) -> str:
    en = lang == "en"
    slug = post["slug"]
    t = UI[lang]
    base = "../../" if en else "../"
    canonical = f"{SITE}/en/blog/{slug}.html" if en else f"{SITE}/blog/{slug}.html"
    rel_zh = ("../blog/" + slug + ".html") if en else (slug + ".html")
    rel_en = (slug + ".html") if en else ("../en/blog/" + slug + ".html")

    title = (post.get("titleEn") or post["title"]) if en else post["title"]
    excerpt = (post.get("excerptEn") or post.get("excerpt", "")) if en else post.get("excerpt", "")
    body = (post.get("contentEn") or post.get("content", "")) if en else post.get("content", "")
    body = localize_body(body, base)

    meta = dict(BASE_META_EN if en else BASE_META)
    meta.update({
        "title": f"{title} - {t['brandText']}",
        "htmlLang": t["htmlLang"],
        "description": excerpt,
        "canonical": canonical,
        "ogTitle": f"{title} - {t['brandText']}",
        "ogDescription": excerpt,
        "ogType": "article",
        "ogUrl": canonical,
        "basePath": base,
        "baseLang": "",
        "navActive": "blog",
        "langHref": rel_en,
        "langZhHref": rel_zh,
        "langEnHref": rel_en,
        "showLastUpdated": False,
        "langText": t["langText"],
        "langTitle": t["langTitle"],
        "brandText": t["brandText"],
        "navActive_index": "",
        "navActive_about": "",
        "navActive_research": "",
        "navActive_publications": "",
        "navActive_projects": "",
        "navActive_blog": " active",
        "navActive_talks": "",
        "navActive_books": "",
        "navActive_hobbies": "",
        "navActive_cv": "",
    })

    return PAGE.format(
        htmlLang=t["htmlLang"],
        title=f"{title} - {t['brandText']}",
        titleShort=title,
        description=excerpt.replace('"', "&quot;"),
        canonical=canonical,
        base=base,
        meta=json.dumps(meta, ensure_ascii=False),
        skip=t["skip"],
        home=t["home"],
        blog=t["blog"],
        blogIndex="blog.html",
        backBlog=t["backBlog"],
        breadcrumb=t["breadcrumb"],
        date=post.get("date", ""),
        category=(post.get("categoryLabelEn") or post.get("categoryLabel", "")) if en else post.get("categoryLabel", ""),
        readTime=(post.get("readTimeEn") or post.get("readTime", "")) if en else post.get("readTime", ""),
        excerpt=excerpt,
        tocTitle=t["toc"],
        tocAria=t["tocAria"],
        body=indent_html(body, 24),
        cc=t["cc"],
        shareHint=t["shareHint"],
        navAria=t["navAria"],
        noscriptTitle=t["noscriptTitle"],
        noscriptBody=t["noscriptBody"].format(base=base),
    )


written = []
for post in DATA.get("posts", []):
    if not post.get("published"):
        continue
    slug = post["slug"]
    zh_path = ROOT / "blog" / f"{slug}.html"
    en_dir = ROOT / "en" / "blog"
    en_dir.mkdir(parents=True, exist_ok=True)
    en_path = en_dir / f"{slug}.html"

    zh_path.write_text(build(post, "zh"), encoding="utf-8")
    en_path.write_text(build(post, "en"), encoding="utf-8")
    written.append({
        "slug": slug,
        "zh": str(zh_path.relative_to(ROOT)).replace("\\", "/"),
        "en": str(en_path.relative_to(ROOT)).replace("\\", "/"),
        "zhBytes": zh_path.stat().st_size,
        "enBytes": en_path.stat().st_size,
    })

print(json.dumps({"written": written}, ensure_ascii=False, indent=2))
