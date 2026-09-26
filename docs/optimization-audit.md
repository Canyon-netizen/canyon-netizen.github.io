# 站点优化审计（已闭环）

> 本轮优化前的缺陷清单、处理方式与最终验证结论。改动细节见 `README.md` 的「改完怎么自检」一节。

## 第 15 轮：404 页接搜索（并挖出 404 页在子路径下完全失效）
**目标**：读者访问 `/blog/xxx` 失败时，少一次「重新想关键词」的摩擦。

新增：404 渲染器从 URL 提取关键词（剥离扩展名、语言前缀、纯数字），显示
「按这几个关键词搜索：…」+ 按钮，点击把关键词带进搜索弹层并直接出结果；
按钮同时是带 `?q=` 的 `<a>`，**禁用 JS 也能落到带关键词的搜索页**。

**挖出的真实缺陷（严重）**：`404.html` 用的是相对路径（`assets/css/style.css`、
`assets/js/page-renderer.js`…）。GitHub Pages 会把 404.html 的内容返回给**任意**
未命中路径，于是访问 `/blog/xxx` 时浏览器去请求 `/blog/assets/...` ——
**样式与脚本全部 404，页面变成一张无样式的死骨架**。本站有 `/blog/`、`/en/`、
`/en/blog/` 三层目录，这条路径相当常见。

修复：
- `404.html` 的资源引用、`basePath`、语言链接全部改为站点根绝对路径
  （`/assets/...`、`basePath: '/'`）——404 页会出现在任意深度，相对前缀无法表达。
- `check-site.mjs` 的本地引用校验区分「相对路径（按页目录解析）」与
  「站点根绝对路径（按仓库根解析）」，否则新增的 `/assets/...` 会被误判为坏引用。

**顺带修掉两个真实缺陷**
1. **搜索偶发无结果**：`open()` 只在索引未加载时依赖 `loadIndex()` 内部那次渲染；
   若索引已就绪（缓存命中）而用户随后输入，就再也不会渲染。现在 `open()` 在索引
   就绪后按当前输入框内容渲染一次。
2. 404 搜索按钮原来直接 `dispatchEvent('search:open')`，但搜索弹层由
   `partial-loader` 异步注入、`main.js` 的监听也在其后绑定 —— 事件会被丢掉。
   现在走 `window.__SITE_SEARCH__.open()`，未就绪时等 `partials:loaded`。

新增 `tools/404-search-probe.mjs`：模拟 GitHub Pages 的 404 行为（状态 404 + 404.html
内容、URL 不变），覆盖 4 种路径形态，验证关键词提取、按钮交互、弹层与结果。

遗留（已知限制）：英文路径下的 404 页文案仍是中文（同一份 404.html），
`lang` 也仍是 `zh-CN`；搜索索引会按路径正确选用英文索引。

## 第 14 轮：把「空页面」接上真实内容
可见文本量盘点显示最单薄的是 `talks`（539 字）、`research`（681 字）、`publications`（811 字）——
分享记录、论文、获奖都还没公开，读者点进去看到的是一片空态。

- 新增 `renderRelatedPosts`：按文章的 `relatedPages` 标签把文章接到主题页上。
  `tools/tag-related-posts.py` 负责打标签（按文章实际内容归类，不是泛泛地全挂）。
- `tools/add-related-sections.py`：给 talks / research / publications 的中英页注入区块；
  **无关联文章时渲染器整块移除**，不会留下空标题。

## 第 13 轮：首屏性能与布局稳定性
新增 `tools/perf-audit.mjs`（CLS / LCP / 传输体积 / 图片尺寸 / 阻塞脚本 / 重复请求）
与 `tools/layout-probe.mjs`（按时间点抓页面结构快照，定位偏移来源）。

探针发现：`about.html` 在 50ms 时区块高 40px，数据到位后变成 234px，页脚被推下 **654px**；
首页被推下 **1550px** —— 这是 CLS 的主要来源。

- **把 `data.json` 在构建时内联进各页**（`tools/inline-page-data.py`），
  页面渲染器优先读内联数据（缺失时仍回退 `fetch`）：内容在首次绘制就存在。
- 修掉 2 张缺 `width/height` 的图（hero 头像、GitHub 贡献图）。
- 内联后单页 gzip 约 16–17KB；**CLS 从 0.12 降到 0**。
- 工具自身修了两处：CLS 偶发误报（每页测两遍取较小值）、文档体积漏计
  （文档响应发生在 `Network.enable` 之前）。

## 第 12 轮：打印样式审计（并发现简历缺了「项目经历」）
新增 `tools/print-audit.mjs`：用 `Emulation.setEmulatedMedia({media:'print'})` 真正切到打印媒体，
再用 `Page.printToPDF` 出真实 PDF 数页数。检查 6 类问题：

1. 屏幕专用元素是否隐藏（导航 / 页脚 / 目录 / 返回顶部 / 搜索 / 滚动进度条）
2. 是否还有 `position: fixed` 元素会跑到纸上
3. 成块区域是否仍是深色底（黑白打印机会糊成一片且费墨）
4. 图片是否超出纸面版心
5. 正文是否横向溢出（**纸上没有横向滚动，溢出即丢字**）
6. 页数是否符合预期 + 末页是否「只剩很少内容」

**发现并修复的问题**
| 问题 | 处理 |
| --- | --- |
| 代码块在打印时仍是深底 `#10161f`（4 处） | 打印样式改浅底 + 深字；**连语法高亮的浅色前景也一并改深**，否则浅底上是白字看不见 |
| 代码块在纸上不换行、向右溢出被裁 | 打印时 `white-space: pre-wrap` + `word-break: break-word` |
| 简历打印出来是 2 页，第 2 页只有一行 | 基本信息改双列、技能清单改内联、条目间距收紧 → 内容高度从 1.34 页降到 1.01 页 |
| **简历根本没有「项目经历」章节** | 见下 |

**顺带发现的真实结构缺陷：简历缺「项目经历」**

`cv-renderer.js` 的 7 个 section 是靠**数组下标**对应的
（`sectionTitles[0..6]` ↔ `getSection(0..6)`），项目经历从来没在清单里，
于是「项目」被塞进了技能区。打印出来一看才发现整页没有项目经历。

- 改成 `SECTIONS` 清单（key + 类型 + 中英标题），section 带 `data-cv-section="<key>"`，
  `getSection(key)` 取代下标；新增 `renderProjects()`。
- 简历用更短的项目描述：`data.json` 增加 `cvDescription` / `cvDescriptionEn`
  （网站保留完整两句，简历用一句），并用 `cvFeatured: false` 控制简历里放哪几个项目。
- 断言补齐：章节齐全、项目经历有实际条目、空章节整块隐藏、用的是简历版短描述。

## 第 11 轮：补齐两个有据可查的真实项目
项目页此前只列 3 个仓库，而账号下有 6 个公开仓库；`steer3d`（Reasoning3D）和
`novel`（一页写作平台）都有完整 README，只是没被收录。

- `tools/add-project-entries.py`：把两个项目写进 `data.json`，
  **描述严格依据各自 README**（Reasoning3D 的「hidden states 实时投到 3D 空间 / 无需 GPU 的合成数据演示」、
  一页的「11 种小说类型 + 模板市场 + 多 API 支持」），不臆造功能。
- **修正 GitHub 自动判定的语言**：GitHub 按字节数统计，Reasoning3D 被判成 `HTML`
  （实际是 Python 后端 + JS 前端）。`fetch-github-stats.py` 增加人工核对过的
  `LANGUAGE_OVERRIDE`，并把自动值保存在 `stats.languageAuto` 以便追溯。
- **首页「公开仓库」数字改为自动核对**：原值 6 是手写的，不能保证与真实一致。
  现在从 `/users/{owner}` 的 `public_repos` 取，并在 `data.json` 记下 `meta.githubRepoTotal`。
  同时给统计卡加 `title` / `aria-label` 说明「GitHub 账号下全部公开仓库数；下列 5 个为站内精选展示」，
  避免读者以为首页数字与项目页条目数对不上。
- 简历只列前 4 个项目（可用 `cvFeatured: false` 排除），保证一页装得下。

## 第 10 轮：多断点响应式审计 + 禁用脚本可用性
此前的移动端检查只覆盖 **390px 一个宽度、15 个页面**，而且只看
`documentElement.scrollWidth`。新增 `tools/responsive-audit.mjs`：
**11 档宽度（320 / 375 / 414 / 600 / 768 / 900 / 1024 / 1280 / 1440 / 1920 / 2560）
× 16 个页面 = 176 个组合**，逐格检查 6 类问题。

**审计发现并修复的真实问题**
| 问题 | 数量 | 处理 |
| --- | --- | --- |
| 字号过小（10.5 / 11 / 11.5px） | 14 处 CSS | 全部提到 **12px**（项目状态、文章分类、目录标题、代码语言标签、搜索分组与类型标签、快捷键 kbd、导航语言分隔符等） |
| 触摸目标 < 24px（WCAG 2.2 AA 2.5.8） | 2 类 | 面包屑链接 17px → 24px+（`inline-block` + 内边距）；首页 `.meta-item` 24px → 28px |
| 窄屏代码块横向滚动无提示 | 2 篇文章 | `pre` 加 `tabindex="0"` + `role="region"` + `aria-label`（键盘可聚焦，WCAG 2.1.1），并在 ≤720px 加右侧渐隐提示 |

**顺带发现的一个更严重的缺陷：禁用脚本时整页内容不可见**

`.reveal { opacity: 0 }` 是无条件的，而 `.is-visible` 由 JS 的 IntersectionObserver 添加
—— 脚本被禁用或加载失败时，首页一大片内容会**永久不可见**（不是"没动画"那么轻）。

- 各页 head 注入 `document.documentElement.classList.add('js')`（`tools/add-js-flag.py`），
  CSS 改为 `html.js .reveal { opacity: 0 }`：有 JS 行为不变，无 JS 内容照常显示。
- 各页注入 `<noscript>` 说明（`tools/add-noscript-notice.py`）：解释内容由 JS 渲染，
  并给出不需要 JS 的替代内容（PDF 简历链接）。各层级页面的相对路径按**实际深度**计算
  （`blog/` 是两层、`en/blog/` 是三层），生成器 `tools/make-articles.py` 也同步输出。
- `tools/a11y-audit.mjs` 增加「**禁用脚本**」用例：用 `Emulation.setScriptExecutionDisabled`
  打开页面，断言没有内容元素 `opacity: 0`。修复前该用例会失败。

**审计工具自身的三个坑（都已修，否则全是误报）**
1. `.hero` 的 `overflow: hidden` 是为了让光晕出血——`scrollWidth > clientWidth` 是设计意图，
   不是缺陷。现在只有「页面级横向滚动」才算失败，且会指出撑破视口的元素。
2. 代码块里的 `<code>` 比视口宽是**容器内横向滚动**（`overflow-x: auto`），
   不是越界。现在位于可横向滚动祖先内的元素不报。
3. WCAG 2.5.8 对「位于句子中的行内链接」有豁免——第一版把 248 个正文链接全报成小目标。
   现在只报独立控件（图标按钮、卡片链接、导航项）。

## 第 9 轮：项目页展示真实仓库数据
项目卡片此前只有手写的「技术栈」列表，star 数、主语言、许可证、最近更新时间这些
**可核实**的信息都没有展示，读者无法判断项目活跃度。

- 新增 `tools/fetch-github-stats.py`：调用 GitHub 公开 API，把仓库元数据写进
  `data.json` 的 `projects[].stats`（stars / language / license / createdAt / pushedAt /
  topics / archived），并把抓取日期写进 `meta.githubFetchedAt`。
  限流或断网时**保留原值**而不是写空（脚本会明确报告失败项）。
- 项目卡新增 `.repo-meta`：仅在有数据时显示对应 chip
  （star 数只在 >0 时显示、许可证跳过 `NOASSERTION`、已归档单独标注）。
- **相对时间以「抓取日期」为基准**，不用浏览器当前时间：
  页面是静态的，用 `Date.now()` 会让同一份 HTML 随访问时间漂移，
  也会和页脚注明的抓取时间自相矛盾。
- 页面底部注明数据来源与抓取日期（`githubFetchedAt`），避免读者误以为是实时数据。

本轮实测拿到的真实数据（写入 `data.json`）：

| 仓库 | 主语言 | star | 许可证 | 最近更新 |
| --- | --- | --- | --- | --- |
| canyon-netizen.github.io | HTML | 0 | — | 2026-07-13 |
| daily-paper-reader | Astro | 1 | MIT | 2026-09-21 |
| zjureport_latex | TeX | 0 | — | 2025-05-27 |

## 第 8 轮：搜索重做（分组 + 类型标签 + 全文检索）
原搜索只索引「标题 + 摘要」，结果是一条平铺列表，没有类型信息，也搜不到正文内容。

- **索引改为生成**：新增 `tools/make-search-index.py`，从 `data.json` 生成
  `search-index.json` / `search-index-en.json`。条目 22 → **37 条**
  （页面 10 + 动态 4 + 文章 2 + 项目 3 + 研究方向 3 + 书单 7 + 爱好 8），
  文章条目额外带 `body`（正文纯文本）用于全文检索。
- **结果分组 + 类型标签**：按 文章 / 页面 / 动态 / 项目 / 研究方向 / 分享 / 阅读 / 爱好
  分组，每组有标题与数量，每条结果右侧带类型 chip。
- **正文片段**：命中正文时，从正文里截取包含关键词的片段（而不是只显示摘要）。
- **两段式检索**：Fuse 负责标题/摘要的模糊匹配；正文走子串匹配
  —— Fuse 的阈值按字段长度归一化，长正文里的精确命中会被判低分而漏掉
  （实测「Pydantic」只在正文出现时搜不到）。
- 新增 `tools/search-check.mjs` 做端到端验证（真实打开弹层、输入关键词、
  检查分组/类型标签/全文命中/Esc 关闭），并在无外网时明确报告「CDN 不可达」而不是假通过。
- `check-site.mjs` 增加索引结构校验（条目数、url 完整性、文章是否带 body）。

## 第 7 轮：无障碍与语义审计
新增 `tools/a11y-audit.mjs`：在真实浏览器里逐页检查 11 类规则（图片 alt、标题层级、
链接/按钮可访问名、表单标签、id 唯一、`lang` 正确、地标与 nav 标签、弹层 `aria-modal`、
跳过链接、颜色对比度）。25 个页面全部通过。

**审计发现并修复的问题**
| 问题 | 处理 |
| --- | --- |
| 搜索输入框没有标签 | `#search-input` 加 `aria-label` + `role="searchbox"` |
| 404 页的「常用入口」nav 没有可访问名 | 加 `aria-label="常用入口"` |
| 次级文字对比度 3.78:1（AA 要求 4.5:1） | `--color-text-mute` 由 `#718096` 调深到 `#5f6c7f`（≈5.0:1） |
| 深色模式下当前导航项「浅蓝底 + 浅蓝字」 | 改为浅蓝底 + 深色字（`#0c1118`） |
| 深色模式书单星标偏暗 | 金色提到 `#fbbf24` |

**审计工具自身的两个坑（都已修，否则会误报/漏报）**
1. **半透明背景被当成不透明**：`rgba(43,108,176,0.10)` 直接按 rgb 计算，得出
   「文字与背景同色 1:1」的假结论。现在按层做 alpha 合成后再算对比度。
2. **审计早于 partials 注入**：`header/footer` 还没注入就检查，误报「缺少地标」。
   现在等 `.site-footer` 出现再开始。

**顺带修掉一个真实的可移植性缺陷**：`color-mix()` 的百分比在部分引擎里解析不正确
（实测会把 `86%` 当作 `100%`），导致半透明导航底色变成不透明。已改用显式 `rgba()`
变量（`--color-header-bg` / `--color-border-soft` / `--hero-tint-*` / `--accent-halo`），
不再依赖 `color-mix()` 的百分比语义。

## 第 6 轮：英文站补上博客正文（中英同源模板）
此前英文站只有博客**列表**，点进文章落到中文页；文章页的语言切换在英文侧也不成立
（`en/blog/` 下推算出的 `langZhHref` 是 `en/blog/blog.html`，并不存在）。

- 正文入库：`data.json` 的 `posts[].content`（中文）与 `posts[].contentEn`（英文）。
  抽取过程中修复了源 HTML 的历史问题：`<pre>` 内容自带 16 空格缩进、YAML 嵌套层级丢失、
  Python 类体成员缩进丢失（工具脚本见 `tools/extract-post-content.py`、`normalize-post-content.py`、
  `fix-code-blocks.py`、`add-post-en.py`）。
- 新增 `tools/make-articles.py`：一个模板 + 数据 → 生成
  `blog/<slug>.html`（zh-CN）与 `en/blog/<slug>.html`（en）。
  自动处理：语言路由（`langZhHref`/`langEnHref`）、`hreflang`、`basePath`、
  配图相对路径（英文深一层）、跳过链接与导航文案、上/下篇、分享与快捷键提示。
- `article.js` 修正语言切换：英文文章页把中文按钮改写为 `../../blog/<file>`，
  中文文章页把英文按钮改写为 `../en/blog/<file>`（不再依赖推算路径）。
- `page-renderer.js` 的文章链接按语言取 `hrefEn`（站点根相对 `blog/<slug>.html`，
  由 `sitePath()` 补前缀）—— 英文列表因此指向 `../blog/…`，即 `en/blog/…`。
- 订阅源：新增 `rss-en.xml`（英文标题/摘要 + 英文文章链接）；`sitemap.xml` 增加 2 个英文文章 URL。

## 第 5 轮：订阅源自动生成 + 文章阅读细节
### A. `rss.xml` / `sitemap.xml` 改为生成（消除重复维护）
这两个文件以前是手写的，与 `data.json`、`blog/` 目录三处重复 ——
新增一篇文章要改 4 个地方（data.json / blog.html / rss.xml / sitemap.xml），
漏一处就会出现「博客里有、订阅源里没有」。
- 新增 `tools/make-feeds.py`：从 `data.json` + 磁盘页面生成两者。
  - RSS：仅已发布文章，按日期倒序，`pubDate` 用 RFC 822（+0800）、`guid isPermaLink`、含分类。
  - sitemap：中/英所有实际存在的页面 + 博客文章（文章带 `lastmod` 与 `priority`），
    英文页优先级自动比中文低 0.1。
- `tools/check-site.mjs` 增加结构校验：XML 声明、必需标签、条目配对、`<loc>` 必须是绝对地址。

### B. 文章页细节
- **阅读时间按正文实际字数重算**（中文 350 字/分钟，英文 220 词/分钟）：
  原来 `data.json` 里手写的「约 5 分钟」与 643 字正文不符，现在显示「约 2 分钟」，
  `title` 里还给出字数依据。
- **图片灯箱**：文章配图可点击/回车放大（Esc 或点背景关闭），
  配图加了 `zoomable`（鼠标手型 + 悬停微放大）与 `role=button`/`aria-label`。
- **首个真实配图**：新增 `tools/make-article-figure.py` 生成
  `assets/images/blog/three-pass-reading.svg`（三遍阅读法示意图，纯 SVG 无字体依赖），
  配 `figure/figcaption` 样式并写进文章 —— 灯箱因此有了可点内容，也补上了文章页此前「纯文字」的观感。
- 以上都是渐进增强：脚本失败时正文与图片照常可读。

## 第 4 轮：可下载的简历 PDF
此前 cv 页的「下载 PDF 简历」按钮因为仓库里没有 PDF 而被换成「打印/存为 PDF」——
访客拿不到文件。本轮补上真正的可下载简历：

- 新增 `tools/make-cv.py`：从 `data.json` 生成 `assets/files/cv.docx`，再用 LibreOffice Kit
  转成 `assets/files/cv.pdf`（一页 A4，含抬头/联系方式/个人简介/教育/研究/项目/技能）。
- 新增 `tools/check-cv.py`：校验 `%PDF-` 头、`%%EOF` 尾、页对象、可渲染页数，并做右侧留白预警。
- 中英 cv 页都改为「⬇️ 下载 PDF 简历 / Download PDF CV」主按钮 + 「打印本页」次按钮。
- `sw.js` 预缓存加入 `cv.pdf`，离线也能下载。

踩坑与处理（都写进了 `make-cv.py` 的注释）：
1. python-docx 默认模板用 Courier → LibreOffice 报 missing font；把 Normal 样式与每个 run 的
   `w:ascii/hAnsi/eastAsia/cs` 全部显式设为 Microsoft YaHei 后消失。
2. 只设 `run.font.name` 时 LibreOffice 会替换字体、字宽明显变大 → 正文越过版心被裁；
   因此字号按「渲染后」的字宽来定，并关掉 Word 默认制表位网格。
3. 「左标题 + 右日期」曾用全角空格/制表位对齐，日期被推出页面 → 改为标题一行、日期一行。
4. LibreOffice Kit 的 `--output-dir` 必须不存在，否则 EEXIST；`--pages` 参数会让输出不含 JSON。
5. Kit 输出的 PNG 尺寸与整页不成比例，因此越界检测改成「相对留白预警」而非绝对厘米判据。

## 第 3 轮：结构化数据（SEO / 分享卡片）
此前 README 声称有 JSON-LD，实际全站一个都没有。现在由 `partial-loader.js` 按页面类型注入，
`partials/head-base.html` 提供两个注入槽（`data-ldjson="site"` / `"page"`）：

| 页面 | 注入的 schema |
| --- | --- |
| 首页（中/英） | `WebSite` + `ProfilePage`（内嵌完整 `Person`：姓名、邮箱、职务、所属院校、GitHub、研究方向） |
| 每篇博客文章 | `WebSite` + `BlogPosting`（标题、摘要、日期、作者、字数、`mainEntityOfPage`）+ `BreadcrumbList` |
| 其它页面 | `WebSite` + `WebPage`（含 `isPartOf` 与 `about` 指向 Person） |

配套修复：
- `cv.html` 是唯一没有引入 `head-base` 的页面（也就没有 hreflang / og / JSON-LD），已补上。
- `absUrl()` 曾把已是绝对地址的 canonical 再拼一次站点源，产出
  `http://host/https://canyon-netizen.github.io`（已修复，并加入断言防回归）。
- 面包屑的 `../blog.html` 曾按当前路径解析成 `/blog/blog.html`（已修复）。
- 文章页 `hljs is not defined`：highlight.js 走 CDN，网络不通时会抛未捕获错误；
  现在由 `ui.js` 的 `safeHighlight()` 兜住，离线阅读不受影响。

## 第 2 轮
### A. 首页「精选项目」区块（新增）
项目此前只藏在二级页，访客滚完首页看不到「这个人在做什么」。现在首页新增
`data-section="featured-projects"`：3 列网格卡片（标题 + 状态徽章 + 描述 + 技术标签 + 源码/演示链接），
底部「查看全部项目 →」。渲染器 `renderFeaturedProjects` 只往 `[data-featured-projects]` 容器写内容，
静态壳里的标题/眉标/副标题保持不动（与其它区块同一套写法）。

### B. 论文页空态升级（新增）
`publications` 为空时不再是一句「内容整理中」，而是：一句说明 + 「目前关注的方向」三张卡片
（取 `researchDirections`）。空页面变成有用的落地页。

### C. 文章阅读体验
- 宽屏双栏：左侧 216px 粘性目录（滚动高亮当前章节），右侧正文。
- 新增 `assets/js/article.js`：上一篇 / 下一篇卡片（从 data.json 解析相邻关系）、
  复制链接 / 复制引用、原生分享、← / → 键切换文章。
- 移动端标题下限 26px → 23px；贡献图在手机端取消 `min-width`。

### D. 工具链与「假通过」修复（本轮最重要的工程收益）
`tools/verify-render.ps1` + Edge `--dump-dom` 这套验证方式有**两个致命问题**，本轮全部换掉：
1. **DOM 取决于虚拟时间预算耗尽时页面跑到哪一步** —— 同一份代码两次运行结果不同，
   曾把「上一次运行的旧快照」当成新结果断言通过（差一点据此宣称修复成功）。
2. `Runtime.evaluate(returnByValue)` 会**静默截断**超长字符串（11.9KB 的 DOM 被截到 11.7KB），
   导致断言看到的是半截页面。

现在改为 `tools/render-cdp.mjs`（Node 24 自带 WebSocket + Chrome DevTools Protocol）：
每页新建 target → `Emulation.setDeviceMetricsOverride` → 导航 → **轮询页面自报的渲染状态**
（`documentElement.dataset.dshRendered` / `dshRenderError`，由 `page-renderer.js`、`cv-renderer.js` 写入）
→ `DOM.getOuterHTML` 取完整 DOM → 可选 `Page.captureScreenshot` 截图。
断言脚本 `tools/assert-render.mjs` 还会校验快照新鲜度（体积下限 + 页脚存在）。

这套工具立刻抓出了三个真实缺陷：
- `renderFeaturedProjects` 里 `container is not defined`（ReferenceError 被 try/catch 吞掉 → 区块空白）
- ui.js `revealObserver.unobserve` 在闭包变量为 null 时抛 TypeError（打断整批入场动画）
- `index.html` 内联 `__PAGE_META__` 语法错误（首页数据渲染整块失效）

### E. 编码事故与防护
用 PowerShell 的 `Get-Content -Raw` / `Set-Content` 改这些 UTF-8 文件，会把中文按 GBK 误解码后写回，
`index.html` 因此被毁（内联 JSON 损坏、中文全部乱码）。已重建该文件，并新增
`tools/check-encoding.mjs`：扫描乱码片段、U+FFFD、`__PAGE_META__` JSON 合法性、JSON 文件可解析性。
**结论：这些文件只能用编辑工具改，不要用 PowerShell 读写。**

## 架构（改前 → 改后未变）
静态站（GitHub Pages，无构建）。页面是「薄壳」：`<template data-include="...">` 占位 +
`window.__PAGE_META__` 配置 + `partial-loader.js` 注入 `partials/*.html`；页面主体由
`page-renderer.js` / `cv-renderer.js` 从 `data.json` 渲染；样式集中在 `assets/css/style.css`。

## 缺陷清单与处理结论

| # | 缺陷 | 影响 | 处理 |
| --- | --- | --- | --- |
| 1 | `partials/header.html` 只有 6 个导航项，博客/分享/阅读/爱好 4 个页面不可达 | 一半内容没有入口 | 重写导航：主链 5 项 + 桌面「更多」下拉 + 移动端抽屉内直接铺开；页脚也补全站链接 |
| 2 | `data.json` 的 hero 副标题/自我介绍仍是「一句话简介：例如…」「我是 XXX 大学…」 | 首屏就是占位文字 | 按已知真实信息重写（浙大计算机学院、2022.09–2026.06 本科、2026.09 起读博）；无法确证的（导师、成果）置空或不宣称 |
| 3 | `en/index.html` 是过期的手写静态页（"Your Name"、`your.email@example.com`、2024 结构） | 英文首页整体作废 | 改成与 `index.html` 同构的薄壳（`#page-content` + 6 个 `data-section`），由 `data.json` 的 `xxxEn` 字段驱动 |
| 4 | 英文页渲染器硬编码中文标签（「关键技术：」「代表性工作：」「导师：」） | 中英混排 | 统一 `pick(obj, 'x')`（`xEn` → `x`）与 `localized()`；所有 UI 文案按语言分派 |
| 5 | `cv-renderer.js` 读 `skills.frameworks`，数据里是 `skills.tools`；论文作者直接 join 对象数组 | 简历技能永远缺一组、显示 `[object Object]` | 改读 `tools` 并补「语言能力」组；作者改安全渲染（`isMe`/`isCoFirst`/`isCorresponding` 角标成对闭合） |
| 6 | 首页 `data-section="all-posts"` 与 `[data-posts-list]` 同元素，`sec.querySelector` 取不到 | 中英博客列表都渲染不出文章 | DOM 拆成外层/内层；渲染器改为「自身优先，再向外查」 |
| 7 | 404 页的 `data-section` 在 `#page-content` 自身，`querySelectorAll` 不含自身 | 404 内容从未渲染 | 渲染器扫描时包含根节点自身 |
| 8 | `about.html` 获奖区块漏 `data-section="awards"` | 获奖列表不渲染 | 补属性（渲染器也保留了 ORPHAN 兜底） |
| 9 | `main.js` 主题初始化在 partial 注入之后 | 深色模式用户看到白屏闪烁 | 各页 `<head>` 内联主题引导脚本（样式表前执行）+ `ui.js` 早期初始化 |
| 10 | 博客分类过滤按钮是渲染后生成的，事件却绑在初始化时 | 过滤功能实际失效 | 改事件委托；过滤后派发 `reveal:refresh` |
| 11 | `#last-updated` 用 `new Date()` 冒充「最后更新」 | 误导访客 | 改为只读 `meta.lastUpdated`，为空时用 `document.lastModified` 兜底 |
| 12 | 搜索索引路径靠 `location.pathname.includes('/blog/')` 判断 | `file://` 或子目录下搜索失效 | 由 `document.currentScript.src` 推导站点根；中/英分别加载 `search-index.json` / `search-index-en.json` |
| 13 | 全站每个页面都加载 Fuse.js（含不搜索的页面） | 白付一次 CDN 请求 | 改为打开搜索时按需注入 |
| 14 | `sw.js` 缓存优先且 `CACHE_VERSION` 未随改版递增 | 老访客长期看到旧样式 | 版本升到 `v1.4.0`，预缓存清单补齐全部页面与脚本（含 `ui.js`、两个搜索索引） |
| 15 | `manifest.json` 仍是「你的名字 - 个人主页」 | PWA 安装名是占位符 | 改为真实站点信息 |
| 16 | `visitor-badge.glitch.me`（服务已下线）、`ghchart.rshah.org`（常加载失败） | 首页出现破图/空白 | 移除失效访客徽章与编造的访客数；贡献图改为失败即隐藏并预留高度 |
| 17 | `assets/images/profile.svg` 是写着「你的头像」的灰色占位，且 `data.json` 指向 GitHub 默认头像 | 首屏形象是全站最弱的一环 | 重新设计名字缩写头像（渐变 + 姓名 + 网格纹理），favicon 同步；换真实照片只需替换 `data.json` 的 `personal.avatar` |
| 18 | 无 `hreflang` 中英互指；`og:image` 是 SVG | SEO / 社媒分享效果差 | `head-base.html` 补 hreflang + twitter card + og:image 尺寸；新增 `og-image.png`（Pillow 生成，CJK 正常渲染）；加载器把相对 hreflang 补成绝对 URL |
| 19 | `talks.html` 的「硕士答辩」「XXX 研讨会」等编造内容 | 与真实履历矛盾 | 清空为数据驱动的诚实空态；新增 `talks` 渲染器与 `data.json` 的 `talks: []` |

## 视觉层重做（`assets/css/style.css` 整篇重写）
- 设计令牌统一：颜色 / 排版 / 间距 / 圆角 / 阴影 / 动效曲线全部走变量，明暗两套。
- 排版：`clamp()` 流式字号、标题字重与字距层次、正文 1.75–1.9 行高（中文可读性）。
- 首屏：柔光+网格背景、渐变姓名、渐变外环头像、交错入场动画。
- 组件：卡片/按钮/徽章/时间线/论文/项目/书单/爱好/目录/搜索浮层全部重画，统一 hover 位移与渐变高光。
- 交互：顶部滚动进度条、文章阅读进度、回到顶部、导航 ScrollSpy、标题锚点、代码块语言标签与复制按钮、TOC 当前位置高亮。
- 自适应：900px 以下抽屉导航、520px 以下统计卡两列、`prefers-reduced-motion` 与 `@media print` 完整覆盖。

## 最终验证（第 15 轮结束状态）
- `node tools/404-search-probe.mjs`：**4 种路径形态全部通过**（关键词提取、按钮交互、弹层、结果）。
- `node tools/assert-render.mjs`：**26 / 26 页、206 / 206 条断言通过**。
- `node tools/check-site.mjs`：**0 error / 0 warning**。
- `node tools/check-encoding.mjs`：**0 处损坏**。
- `python tools/check-cv.py`：CV PDF 完整、可渲染、**1 页**。
- `node tools/a11y-audit.mjs`：**25 个页面、0 处问题**（含禁用脚本用例）。
- `node tools/responsive-audit.mjs`：**176 个组合、0 处问题**。
- `node tools/perf-audit.mjs`：**CLS 全页 0**。
- `node tools/print-audit.mjs --pdf`：**7 个页面、0 处问题**。
- `node tools/search-check.mjs`：**5 个用例全部通过**。
- 遗留：英文路径的 404 页文案仍为中文（见上）；highlight.js / Fuse.js 走 CDN。
