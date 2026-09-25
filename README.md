# 周睿 · 个人主页 (GitHub Pages)

浙江大学计算机科学与技术学院博士研究生（2026.09 入学）的个人主页。**零构建步骤**，纯 HTML / CSS / JS，可直接部署在 GitHub Pages 上。

- 线上地址：<https://canyon-netizen.github.io/>
- 英文版：<https://canyon-netizen.github.io/en/>

## 🏗️ 架构：薄壳 + 片段 + 数据渲染

页面本身只保留「壳」，不写内容：

1. **薄壳**（`index.html`、`en/*.html` 等）：`<template data-include="...">` 占位 + 一个 `window.__PAGE_META__` 配置对象 + 带 `data-section` 的内容容器。
2. **片段注入**：`assets/js/partial-loader.js` 拉取 `partials/*.html`（head / header / footer / 搜索浮层），替换 `__BASE__`、`__BASE_LANG__`、`{{...}}` 占位符后注入原位置。
3. **数据渲染**：`assets/js/page-renderer.js` 从 `data.json` 读数据填充 `[data-section]` 容器；简历页由 `assets/js/cv-renderer.js` 渲染。
4. **交互层**：`assets/js/main.js`（主题、搜索、Smooth scroll、reveal 动画等），`assets/js/ui.js` 由 main.js 动态注入（导航「更多」下拉等新交互）。

> 因此：**改内容改 `data.json`，改结构改对应 HTML 壳，改公共部分改 `partials/`。**

## ✨ 特性

- 🌗 **明暗主题** — 跟随系统偏好，解析样式表前内联应用，无深色模式白屏闪烁
- 🌍 **中英双语** — `en/` 子目录，11 个英文页面 + 2 篇英文文章与中文页同构；`data.json` 内 `xxxEn` 字段驱动
- 🧭 **完整导航** — 首页 / 关于 / 研究 / 论文 / 项目 / 简历，桌面端「更多」下拉与移动端抽屉里有 博客 / 分享 / 阅读 / 爱好
- 📱 **完全响应式** — PC / 平板 / 手机自适应
- ✨ **滚动渐入动画** — IntersectionObserver 实现，尊重 `prefers-reduced-motion`
- ⬆️ **回到顶部按钮**
- 📡 **RSS 订阅** — `rss.xml` 由 `tools/make-feeds.py` 从 `data.json` 生成（含 `sitemap.xml`）
- 🗺️ **SEO / 结构化数据** — `sitemap.xml` / `robots.txt` / canonical / hreflang（中英互指）+ JSON-LD：
  首页 `ProfilePage` + `Person`，文章页 `BlogPosting` + `BreadcrumbList`，其它页 `WebPage`
- 🔍 **全站模糊搜索** — `Ctrl+K` / `Cmd+K`
- 📋 **博客自动目录（TOC）** — 宽屏左侧粘性导航，滚动高亮当前章节
- 🔗 **文章间导航** — 上一篇 / 下一篇卡片、复制链接 / 复制引用、← / → 键切换
- 🖼️ **配图灯箱 + 阅读时间** — 点击放大文章配图；阅读时间按正文实际字数计算
- 🧱 **首页精选项目** — 3 列网格卡片，直达源码或在线演示
- 📊 **项目仓库真实元数据** — star 数、主语言、许可证、最近更新时间（来自 GitHub 公开 API，
  由 `tools/fetch-github-stats.py` 抓进 `data.json`，页面注明来源与抓取日期）
- 📝 **CV 打印样式 + PDF 下载** — `assets/files/cv.pdf` 由 `tools/make-cv.py` 从 `data.json` 生成，
  页面上可直接下载；同时保留「打印本页」用浏览器另存
- 💾 **PWA** — `manifest.json` + `sw.js`，可离线访问与添加到主屏

## 📁 项目结构

```
.
├── index.html                      # 首页（薄壳）
├── about.html                      # 关于我
├── research.html                   # 研究方向
├── publications.html               # 论文发表
├── projects.html                   # 项目展示
├── blog.html                       # 博客列表
├── blog/                           # 博客文章
│   ├── 2026-06-20-research-notes.html
│   └── 2026-05-08-python-config.html
├── talks.html                      # 会议分享
├── books.html                      # 阅读书单
├── hobbies.html                    # 兴趣爱好
├── cv.html                         # 简历
├── 404.html                        # 错误页
├── en/                             # 英文版（10 个页面，与中文页同构）
│   ├── index.html
│   ├── about.html
│   ├── research.html
│   ├── publications.html
│   ├── projects.html
│   ├── blog.html
│   ├── blog/                        # 英文文章页（由 tools/make-articles.py 生成）
│   │   ├── 2026-06-20-research-notes.html
│   │   └── 2026-05-08-python-config.html
│   ├── talks.html
│   ├── books.html
│   ├── hobbies.html
│   └── cv.html
├── partials/                       # 公共 HTML 片段
│   ├── head-base.html              # 全站 head（favicon / manifest / RSS / og:image）
│   ├── head-extra-index.html       # 仅首页追加的 head
│   ├── head-blog.html              # 仅博客页追加的 head
│   ├── header.html                 # 导航（含「更多」下拉）
│   ├── footer.html
│   └── search-overlay.html
├── assets/
│   ├── css/style.css               # 主样式（CSS 变量 + 深色模式 + 打印样式）
│   ├── js/
│   │   ├── partial-loader.js       # 片段加载 + 占位符替换
│   │   ├── page-renderer.js        # data.json → 页面 section
│   │   ├── cv-renderer.js          # data.json → 简历
│   │   ├── main.js                 # 主题 / 搜索 / 动画等交互
│   │   ├── ui.js                   # 现代交互层（由 main.js 动态注入）
│   │   └── article.js              # 文章页增强（相邻文章 / 分享 / ←→ 跳转）
│   ├── images/
│   │   ├── favicon.svg
│   │   ├── profile.svg             # 头像兜底占位（真实头像地址在 data.json 的 personal.avatar）
│   │   └── og-image.svg
│   └── files/                      # 如需放简历 PDF 等静态文件
├── data.json                       # ⭐ 全站内容的唯一数据源
├── search-index.json               # 搜索索引
├── manifest.json                   # PWA 配置
├── sw.js                           # Service Worker（离线缓存）
├── sitemap.xml / robots.txt / rss.xml
├── docs/
│   └── optimization-audit.md       # 站点优化审计笔记（缺陷清单与处理结论）
└── README.md
```

## 🚀 部署到 GitHub Pages

1. 推送仓库到 GitHub（仓库名 `canyon-netizen.github.io`）
2. **Settings → Pages** → Source 选 `Deploy from a branch`
3. Branch 选 `main`，目录选 `/ (root)`，保存
4. 1-2 分钟后访问 <https://canyon-netizen.github.io/>

## ✅ 改完怎么自检

零依赖（Node 用系统自带的即可），本地跑这几条：

```powershell
# 1) 静态自检：JS 语法 / JSON 合法性 / partial 与本地资源是否存在
#    data-section 是否有对应渲染器 / 站内链接是否断链 / 占位符残留
node tools/check-site.mjs

# 2) 编码自检：捕获「UTF-8 被当 GBK 读写」造成的乱码与非法 __PAGE_META__
#    （注意：不要用 PowerShell 的 Get-Content/Set-Content 改这些文件，会毁掉中文）
node tools/check-encoding.mjs

# 3) 渲染自检 + 截图：起本地静态服务，用 Edge 的 DevTools 协议逐页打开，
#    等页面自报渲染完成（documentElement.dataset.dshRendered）后取 DOM 与截图
node tools/render-cdp.mjs --shots

# 4) 对第 3 步的 DOM 快照跑断言（26 页 / 188 条：双语取词、空态、目录、
#    代码复制、相邻文章、深色主题、JSON-LD、快照新鲜度）
node tools/assert-render.mjs

# 4b) 无障碍与语义审计（25 个页面 × 11 类规则，在真实浏览器里跑）：
#     图片 alt / 标题层级 / 链接与按钮可访问名 / 表单标签 / id 唯一 /
#     lang 正确 / 地标与 nav 标签 / 弹层 aria-modal / 跳过链接 / 对比度（含 alpha 合成）
node tools/a11y-audit.mjs

# 4c) 搜索端到端验证（真实打开弹层、输入关键词、检查分组/类型标签/全文命中/Esc 关闭）
node tools/search-check.mjs

# 4d) 多断点响应式审计（默认 11 档宽度 320→2560 × 16 个页面 = 176 个组合）：
#     页面级横向溢出 / 内容被裁 / 元素越界 / 触摸目标 ≥24px / 字号 ≥12px / 导航重叠
node tools/responsive-audit.mjs
node tools/responsive-audit.mjs --widths=375,768,1440   # 只查关键断点

# 4e) 打印样式审计（真实切到 print 媒体 + 出 PDF 数页数）：
#     屏幕专用元素是否隐藏 / 是否有 fixed 元素跑上纸 / 深色底是否改浅 /
#     图片是否超版心 / 横向溢出（纸上无法滚动）/ 简历页数与末页占比
node tools/print-audit.mjs --pdf

# 5) 移动端横向溢出：起服务器后打开 tools/mobile-check.html，应全部 ✓

# 6) 新增/修改博客文章后的生成链路
#    正文写在 data.json 的 posts[].content / contentEn，页面由模板产出
python tools/make-articles.py    # → blog/<slug>.html + en/blog/<slug>.html（中英同源模板）
python tools/make-feeds.py       # → rss.xml + rss-en.xml + sitemap.xml（别手改这三个文件）
#    若正文是从旧 HTML 迁移过来的，首次需要：
#    python tools/extract-post-content.py && python tools/normalize-post-content.py
#    python tools/fix-code-blocks.py && python tools/add-post-en.py && python tools/link-post-en.py
python tools/make-search-index.py  # → search-index.json + search-index-en.json（含文章正文全文）
python tools/fetch-github-stats.py # → 项目仓库的 star/主语言/许可证/最近更新 + 首页仓库总数
python tools/add-project-entries.py # → 补进有据可查的新项目（描述需依 README，不臆造）
python tools/add-js-flag.py        # → 给各页 head 注入「脚本可用」标记（保证禁用脚本时内容可见）
python tools/add-noscript-notice.py # → 给各页注入 <noscript> 说明（禁用脚本时的可达内容提示）

# 7) 简历 PDF：从 data.json 重新生成（改过教育/项目/技能后跑）
python tools/make-cv.py      # → assets/files/cv.docx + cv.pdf
python tools/check-cv.py     # 校验 PDF 完整性与可渲染性

# 8) 改过姓名/简介后重新生成社交分享图（og:image）
python tools/make-og-image.py
```

`render-cdp.mjs` 每次都用仓库内独立的随机 profile，并先清空 `.dsh-dom`；
断言脚本还会检查快照新鲜度（体积下限 + 页脚是否存在），避免把上一次运行的
旧快照当成新结果。

## ✏️ 如何维护内容

内容集中在 `data.json`，**不要在 HTML 里写正文**。常用字段：

| 字段 | 用途 |
| --- | --- |
| `personal` | 姓名、邮箱、地址、头像、hero 文案、自我介绍 |
| `sections` | 首页各分区的 eyebrow / sub 小标题（键与 `data-section` 同名） |
| `stats` | 首页「数据一览」的数字与文案 |
| `news` | 首页「最新动态」时间线 |
| `overview` | 首页「个人概览」（教育背景 / 研究兴趣 / 当前状态 / 所在地） |
| `heroCtas` / `contacts` | 首页 hero 的行动按钮与联系方式 |
| `education` / `research` / `internships` / `publications` / `awards` / `skills` | 关于页与简历页 |
| `projects` | 项目卡片 |
| `posts` | 博客列表（`published: false` 表示草稿） |
| `talks` | 分享记录（按 `year` 倒序分组；条目字段：`year` / `title` / `date` / `venue` / `desc` / `links`；空数组显示空态） |
| `books` / `hobbies` | 阅读书单与兴趣爱好 |
| `pages` | 各页面的标题、导语、博客分类、404 页文案 |

### 中英双语字段约定

渲染取词规则统一为 **`字段名 + 'En'` → `字段名`**（英文页优先取 `xxxEn`，缺失时回退中文）。新增内容时请成对补齐：

| 中文 | 英文 | 说明 |
| --- | --- | --- |
| `name` / `heroEyebrow` / `heroSubtitle` / `bio` / `interests` | `nameEn` / `heroEyebrowEn` / `heroSubtitleEn` / `bioEn` / `interestsEn` | `personal` 内 |
| `currentAffiliation` / `currentAdvisor` / `collaborationNote` | `currentAffiliationEn` / `currentAdvisorEn` / `collaborationNoteEn` | `personal` 内 |
| `heroCtas` | `heroCtasEn` | 数组整体替换，结构一致 |
| `contacts` | `contactsEn` | 数组整体替换，结构一致 |
| `stats.*.label` | `stats.*.labelEn` | 逐个字段 |
| `news[].content` | `news[].contentEn` | 逐条 |
| `overview` | `overviewEn` | 整体同构对象（education / interests / currentStatus / location） |
| `sections.*` | `sections.*En` | 与 `data-section` 同名的键 |
| `posts[].title/excerpt/readTime/categoryLabel/href` | `posts[].titleEn/excerptEn/readTimeEn/categoryLabelEn/hrefEn` | `hrefEn` 是相对 `en/` 的路径 |
| `projects[].title/statusLabel/description` | `projects[].titleEn/statusLabelEn/descriptionEn` | 逐条 |
| `talks[].title/venue/desc` | `talks[].titleEn/venueEn/descEn` | 逐条（`year` / `date` / `links` 语言中立） |
| `books[].category`、`items[].title/author/comment`、`rating.label` | 同名 `+En` | 逐字段 |
| `hobbies[].name/desc` | `nameEn` / `descEn` | 逐条 |
| `researchDirections[].title/description` | `titleEn` / `descriptionEn` | 逐条 |
| `skills.*[].level`、`spoken[].name` | `levelEn` / `nameEn` | 逐条 |
| `pages.<page>.title/lead/...` | 同名 `+En` | 逐字段 |
| `education[].period/school/department/degree` | 同名 `+En` | 逐字段 |

### 替换头像

`data.json` 的 `personal.avatar` 指向真实头像 URL（当前为 GitHub 头像）；`assets/images/profile.svg` 只是图片加载失败时的兜底占位。

### 提供简历 PDF（可选）

把 PDF 放到 `assets/files/cv.pdf`。当前简历页不依赖该文件，使用「打印 / 另存为 PDF」按钮配合 `@media print` 样式导出干净简历。

## 🎨 自定义主题

所有视觉风格集中在 [`assets/css/style.css`](assets/css/style.css) 顶部的 `:root` 变量中：

```css
:root {
    --color-primary: #1e3a5f;     /* 主色：导航、深色文字 */
    --color-accent: #3182ce;      /* 强调色：链接 */
    /* ... */
}

[data-theme="dark"] {
    /* 深色模式变量 */
}
```

## 🆕 添加新博客文章

1. 在 `blog/` 下新建 HTML（建议 `YYYY-MM-DD-标题.html`），可复制 `blog/2026-06-20-research-notes.html`
2. 在 `data.json` 的 `posts` 数组追加一条（中文 + `xxxEn` 字段，`hrefEn` 用 `../blog/...`）
3. 同步 `rss.xml`、`sitemap.xml` 与 `search-index.json`
4. 改了资源后在 `sw.js` 里递增 `CACHE_VERSION`（并可按需把新文章加进 `PRECACHE_URLS`）

## 🛠️ 本地预览

```bash
python -m http.server 8000
# 或
npx serve .
```

然后访问 <http://localhost:8000>。

> Service Worker 与 `fetch('data.json')` 需要 http(s) 环境，直接双击打开 `index.html`（`file://`）不会渲染内容。

## 📝 许可

本框架可自由使用、修改、再分发。
