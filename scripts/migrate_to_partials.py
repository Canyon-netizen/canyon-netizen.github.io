#!/usr/bin/env python3
"""
把现有 HTML 页面改为使用 partials 模板。

策略：用字符串定位切分文件，保留 <main>...</main> 块不变，
替换 head、header、footer+search-overlay 三段。
"""
import json
import os
import re
import sys


# ============== Page meta 配置 ==============
ZH_NAV = dict(brandText='周睿', footerCreditPrefix='由', footerCreditSuffix='强力驱动',
              lastUpdatedLabel='最后更新：', rssTitle='博客 RSS',
              navHome='首页', navAbout='关于', navResearch='研究',
              navPublications='论文', navProjects='项目', navBlog='博客',
              navTalks='分享', navCV='简历',
              searchTitle='搜索 (Ctrl+K)', searchAriaLabel='搜索',
              searchPlaceholder='搜索文章、论文、项目…',
              searchCloseLabel='关闭搜索', searchEmptyText='输入关键词搜索',
              langText='EN', langTitle='Switch to English',
              themeTitle='切换主题', navToggleLabel='切换导航',
              htmlLang='zh-CN')

EN_NAV = dict(brandText='Zhou Rui', footerCreditPrefix='Powered by', footerCreditSuffix='',
              lastUpdatedLabel='Last updated:', rssTitle='Blog RSS',
              navHome='Home', navAbout='About', navResearch='Research',
              navPublications='Publications', navProjects='Projects', navBlog='Blog',
              navTalks='Talks', navCV='CV',
              searchTitle='Search (Ctrl+K)', searchAriaLabel='Search',
              searchPlaceholder='Search articles, papers, projects…',
              searchCloseLabel='Close search', searchEmptyText='Type to search',
              langText='中', langTitle='Switch to Chinese',
              themeTitle='Toggle theme', navToggleLabel='Toggle navigation',
              htmlLang='en')


def merge(overrides, lang_dict):
    m = dict(lang_dict)
    m.update(overrides)
    m.setdefault('ogType', None)
    m.setdefault('ogUrl', None)
    m.setdefault('showLastUpdated', True)
    m.setdefault('hasBlogPost', False)
    m.setdefault('basePath', '')
    m.setdefault('description', '')
    if m['description'] is None:
        m['description'] = ''
    return m


# (file_key, overrides) 列表
FILES = [
    # —— 中文根级 ——
    ('index.html', dict(
        title='周睿 - 个人主页',
        description='个人主页 - 研究方向、论文发表、项目展示',
        canonical='https://canyon-netizen.github.io/',
        ogTitle='周睿 - 个人主页',
        ogDescription='个人主页 - 研究方向、论文发表、项目展示',
        ogType='website',
        ogUrl='https://canyon-netizen.github.io/',
        navActive='index',
        langHref='en/index.html',
        hasHeroLayout=True,
    )),
    ('about.html', dict(
        title='关于 - 周睿',
        description='个人简介、教育背景、研究经历',
        canonical='https://canyon-netizen.github.io/about.html',
        ogTitle='关于 - 周睿',
        ogDescription='个人简介、教育背景、研究经历',
        navActive='about',
        langHref='en/about.html',
    )),
    ('research.html', dict(
        title='研究 - 周睿',
        description='研究方向、研究兴趣、研究项目',
        canonical='https://canyon-netizen.github.io/research.html',
        ogTitle='研究 - 周睿',
        ogDescription='研究方向、研究兴趣、研究项目',
        navActive='research',
        langHref='en/research.html',
    )),
    ('publications.html', dict(
        title='论文 - 周睿',
        description='论文发表列表',
        canonical='https://canyon-netizen.github.io/publications.html',
        ogTitle='论文 - 周睿',
        ogDescription='论文发表列表',
        navActive='publications',
        langHref='en/publications.html',
    )),
    ('projects.html', dict(
        title='项目 - 周睿',
        description='开源项目与作品集',
        canonical='https://canyon-netizen.github.io/projects.html',
        ogTitle='项目 - 周睿',
        ogDescription='开源项目与作品集',
        navActive='projects',
        langHref='en/projects.html',
    )),
    ('blog.html', dict(
        title='博客 - 周睿',
        description='技术博客与研究笔记',
        canonical='https://canyon-netizen.github.io/blog.html',
        ogTitle='博客 - 周睿',
        ogDescription='技术博客与研究笔记',
        navActive='blog',
        langHref='en/blog.html',
    )),
    ('talks.html', dict(
        title='分享 - 周睿',
        description='学术报告与公开演讲',
        canonical='https://canyon-netizen.github.io/talks.html',
        ogTitle='分享 - 周睿',
        ogDescription='学术报告与公开演讲',
        navActive='talks',
        langHref='en/talks.html',
    )),
    ('books.html', dict(
        title='阅读 - 周睿',
        description='正在阅读与已读清单',
        canonical='https://canyon-netizen.github.io/books.html',
        ogTitle='阅读 - 周睿',
        ogDescription='正在阅读与已读清单',
        navActive='books',
        langHref='en/books.html',
    )),
    ('hobbies.html', dict(
        title='爱好 - 周睿',
        description='兴趣爱好与业余活动',
        canonical='https://canyon-netizen.github.io/hobbies.html',
        ogTitle='爱好 - 周睿',
        ogDescription='兴趣爱好与业余活动',
        navActive='hobbies',
        langHref='en/hobbies.html',
    )),
    # 404 特殊
    ('404.html', dict(
        title='404 - 页面未找到',
        description='',
        canonical='https://canyon-netizen.github.io/404.html',
        ogTitle='404 - 页面未找到',
        ogDescription='',
        navActive='index',
        langHref='en/index.html',
        showLastUpdated=False,
    )),
    # —— 英文版 ——
    ('en/index.html', dict(
        title='Zhou Rui - Personal Homepage',
        description='Personal homepage - research interests, publications, projects',
        canonical='https://canyon-netizen.github.io/en/',
        ogTitle='Zhou Rui - Personal Homepage',
        ogDescription='Personal homepage - research interests, publications, projects',
        ogType='website',
        ogUrl='https://canyon-netizen.github.io/en/',
        navActive='index',
        langHref='../index.html',
        hasHeroLayout=True,
    )),
    ('en/about.html', dict(
        title='About - Zhou Rui',
        description='Bio, education, research experience',
        canonical='https://canyon-netizen.github.io/en/about.html',
        ogTitle='About - Zhou Rui',
        ogDescription='Bio, education, research experience',
        navActive='about',
        langHref='../about.html',
    )),
    ('en/research.html', dict(
        title='Research - Zhou Rui',
        description='Research interests and projects',
        canonical='https://canyon-netizen.github.io/en/research.html',
        ogTitle='Research - Zhou Rui',
        ogDescription='Research interests and projects',
        navActive='research',
        langHref='../research.html',
        showLastUpdated=False,
    )),
    ('en/publications.html', dict(
        title='Publications - Zhou Rui',
        description='Publication list',
        canonical='https://canyon-netizen.github.io/en/publications.html',
        ogTitle='Publications - Zhou Rui',
        ogDescription='Publication list',
        navActive='publications',
        langHref='../publications.html',
        showLastUpdated=False,
    )),
    ('en/projects.html', dict(
        title='Projects - Zhou Rui',
        description='Open source projects and portfolio',
        canonical='https://canyon-netizen.github.io/en/projects.html',
        ogTitle='Projects - Zhou Rui',
        ogDescription='Open source projects and portfolio',
        navActive='projects',
        langHref='../projects.html',
        showLastUpdated=False,
    )),
    ('en/blog.html', dict(
        title='Blog - Zhou Rui',
        description='Tech blog and research notes',
        canonical='https://canyon-netizen.github.io/en/blog.html',
        ogTitle='Blog - Zhou Rui',
        ogDescription='Tech blog and research notes',
        navActive='blog',
        langHref='../blog.html',
    )),
    ('en/talks.html', dict(
        title='Talks - Zhou Rui',
        description='Academic talks and presentations',
        canonical='https://canyon-netizen.github.io/en/talks.html',
        ogTitle='Talks - Zhou Rui',
        ogDescription='Academic talks and presentations',
        navActive='talks',
        langHref='../talks.html',
        showLastUpdated=False,
    )),
    ('en/books.html', dict(
        title='Reading - Zhou Rui',
        description='Currently reading and read list',
        canonical='https://canyon-netizen.github.io/en/books.html',
        ogTitle='Reading - Zhou Rui',
        ogDescription='Currently reading and read list',
        navActive='books',
        langHref='../books.html',
        showLastUpdated=False,
    )),
    ('en/cv.html', dict(
        title='CV - Zhou Rui',
        description='Personal CV',
        canonical='https://canyon-netizen.github.io/en/cv.html',
        ogTitle='CV - Zhou Rui',
        ogDescription='Personal CV',
        navActive='cv',
        langHref='../cv.html',
        basePath='../',
        showLastUpdated=False,
    )),
    ('en/hobbies.html', dict(
        title='Hobbies - Zhou Rui',
        description='Hobbies and personal interests',
        canonical='https://canyon-netizen.github.io/en/hobbies.html',
        ogTitle='Hobbies - Zhou Rui',
        ogDescription='Hobbies and personal interests',
        navActive='hobbies',
        langHref='../hobbies.html',
        showLastUpdated=False,
    )),
    # —— 博客内嵌 ——
    ('blog/2026-06-20-research-notes.html', dict(
        title='研究笔记：从零开始读一篇论文 - 周睿',
        description='读论文的三遍阅读法',
        canonical='https://canyon-netizen.github.io/blog/2026-06-20-research-notes.html',
        ogTitle='研究笔记：从零开始读一篇论文 - 周睿',
        ogDescription='读论文的三遍阅读法',
        ogType='article',
        navActive='blog',
        langHref='../blog.html',  # 兑底修复
        basePath='../',
        hasBlogPost=True,
    )),
    ('blog/2026-05-08-python-config.html', dict(
        title='Python 项目配置管理 - 周睿',
        description='环境变量、配置文件、密钥管理',
        canonical='https://canyon-netizen.github.io/blog/2026-05-08-python-config.html',
        ogTitle='Python 项目配置管理 - 周睿',
        ogDescription='环境变量、配置文件、密钥管理',
        ogType='article',
        navActive='blog',
        langHref='../blog.html',
        basePath='../',
        hasBlogPost=True,
    )),
]

# cv.html 已经是模板，跳过
SKIP = {'cv.html'}


def build_head(meta):
    """生成新的 <head>...</head> 整段。"""
    base = meta['basePath']
    L = []
    L.append('<head>')
    L.append('    <meta charset="UTF-8">')
    L.append('    <meta name="viewport" content="width=device-width, initial-scale=1.0">')
    L.append(f'    <title>{meta["title"]}</title>')
    if meta.get('description'):
        L.append(f'    <meta name="description" content="{meta["description"]}">')
    L.append(f'    <link rel="canonical" href="{meta["canonical"]}">')
    L.append(f'    <link rel="preload" as="style" href="{base}assets/css/style.css">')
    L.append(f'    <meta property="og:title" content="{meta["ogTitle"]}">')
    L.append(f'    <meta property="og:description" content="{meta["ogDescription"]}">')
    if meta.get('ogType'):
        L.append(f'    <meta property="og:type" content="{meta["ogType"]}">')
    if meta.get('ogUrl'):
        L.append(f'    <meta property="og:url" content="{meta["ogUrl"]}">')
    L.append(f'    <link rel="stylesheet" href="{base}assets/css/style.css">')
    L.append('    <template data-include="head-base"></template>')
    if meta.get('hasHeroLayout'):
        L.append('    <template data-include="head-extra-index"></template>')
    if meta.get('hasBlogPost'):
        L.append('    <template data-include="head-blog"></template>')

    # loader meta dict（只保留需要的字段）
    loader_meta = {k: meta[k] for k in [
        'title', 'description', 'canonical', 'ogTitle', 'ogDescription',
        'ogType', 'ogUrl', 'basePath', 'navActive', 'langHref', 'langText',
        'langTitle', 'themeTitle', 'navToggleLabel', 'brandText',
        'footerCreditPrefix', 'footerCreditSuffix', 'lastUpdatedLabel',
        'rssTitle', 'searchTitle', 'searchAriaLabel', 'searchPlaceholder',
        'searchCloseLabel', 'searchEmptyText', 'navHome', 'navAbout',
        'navResearch', 'navPublications', 'navProjects', 'navBlog',
        'navTalks', 'navCV',
    ] if k in meta}
    # 空值置空字符串
    for k in ['ogType', 'ogUrl', 'description']:
        if loader_meta.get(k) is None:
            loader_meta[k] = ''

    L.append('    <script>window.__PAGE_META__ = ' + json.dumps(loader_meta, ensure_ascii=False) + ';</script>')
    L.append(f'    <script defer src="{base}assets/js/partial-loader.js"></script>')
    L.append('</head>')
    return '\n'.join(L)


def transform(file_key, content):
    """处理单个文件。"""
    # 1) 解析 page meta
    is_en = file_key.startswith('en/') or file_key.startswith('blog/') == False and file_key == 'index.html' and False
    is_en = file_key.startswith('en/')
    is_blog = file_key.startswith('blog/')
    lang_dict = EN_NAV if is_en else ZH_NAV

    # 找到对应的 overrides
    overrides = None
    for k, ov in FILES:
        if k == file_key:
            overrides = ov
            break
    if overrides is None:
        raise ValueError(f'no meta for {file_key}')
    meta = merge(overrides, lang_dict)

    base = meta['basePath']

    # 2) 定位边界
    body_open_re = re.search(r'<body[^>]*>', content)
    body_close_re = re.search(r'</body>\s*</html>\s*$', content, re.DOTALL)
    if not body_open_re or not body_close_re:
        raise ValueError(f'{file_key}: body tags not found')

    # pre_html: <!DOCTYPE html>\n<html ...>\n （去掉原 head，仅留 html 标签）
    html_open_re = re.search(r'<html\b[^>]*>', content)
    if not html_open_re:
        raise ValueError(f'{file_key}: <html> tag not found')
    pre_html = content[:html_open_re.end()] + '\n'

    body_inner = content[body_open_re.end():body_close_re.start()]
    post_body = content[body_close_re.start():]  # </body>...</html>

    # 3) 在 body_inner 中定位 <header class="site-header">...</header> 替换
    header_re = re.search(r'<header class="site-header">.*?</header>', body_inner, re.DOTALL)
    if not header_re:
        raise ValueError(f'{file_key}: <header class="site-header"> not found')
    # header 之前的内容（含 <a class="skip-link">）
    pre_header = body_inner[:header_re.start()]
    post_header = body_inner[header_re.end():]

    # 4) 在 post_header 中定位 <footer class="site-footer">...</footer> + 后续直到 body_inner 末尾
    footer_re = re.search(r'<footer class="site-footer">.*?</footer>', post_header, re.DOTALL)
    if not footer_re:
        raise ValueError(f'{file_key}: <footer> not found')
    # footer 之前：main 内容
    main_content = post_header[:footer_re.start()]
    # footer 之后：search-overlay + scripts
    post_footer_raw = post_header[footer_re.end():]

    # 在 post_footer_raw 中定位 main.js 脚本（如果不抽出 main.js，要保留它）
    # 抽出：search-overlay 块、fuse.js script
    main_js_re = re.search(r'<script defer src="[^"]*assets/js/main\.js"></script>', post_footer_raw)
    if not main_js_re:
        # 也许是 search-overlay 之前
        main_js_re = re.search(r'<script defer src="[^"]*assets/js/main\.js"[^>]*></script>', post_footer_raw)
    if main_js_re:
        # 找到 main.js script，保留它（main.js 仍需在 body 末尾加载）
        main_js = main_js_re.group(0)
        # 移除 script 标签（包括前后空白）
        post_footer_clean = post_footer_raw.replace(main_js_re.group(0), '').strip()
    else:
        main_js = f'<script defer src="{base}assets/js/main.js"></script>'
        post_footer_clean = post_footer_raw.strip()

    # 5) 拼接
    body_tag = body_open_re.group(0)
    out = []
    out.append(pre_html)
    out.append(build_head(meta) + '\n')
    out.append(body_tag + '\n')
    out.append(pre_header.rstrip('\n'))
    out.append('\n    <template data-include="header"></template>\n')
    out.append(main_content.rstrip('\n'))
    out.append('\n    <template data-include="footer"></template>')
    out.append('\n    <template data-include="search-overlay"></template>\n')
    out.append('\n    ' + main_js)
    out.append('\n')
    out.append(post_body)
    return ''.join(out)


def main():
    root = '.'
    if len(sys.argv) > 1:
        root = sys.argv[1]
    ok, fail, skip = 0, 0, 0
    for key, _ in FILES:
        if key in SKIP:
            skip += 1
            continue
        path = os.path.join(root, key)
        if not os.path.isfile(path):
            print(f'  [missing] {key}')
            fail += 1
            continue
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        try:
            new = transform(key, content)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new)
            print(f'  [ok] {key}: {len(content)} -> {len(new)} bytes')
            ok += 1
        except Exception as e:
            print(f'  [fail] {key}: {e}')
            fail += 1
    print(f'\nok={ok} skip={skip} fail={fail}')


if __name__ == '__main__':
    main()
