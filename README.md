# 个人主页 (GitHub Pages)

一个功能丰富的个人主页，可直接部署在 GitHub Pages 上。**零构建步骤**，纯 HTML/CSS/JS 编写。

## ✨ 特性

- 🌗 **明暗主题切换** — 跟随系统偏好，状态自动保存
- 🌍 **中英双语** — `en/` 子目录提供英文版本
- 📱 **完全响应式** — PC / 平板 / 手机自适应
- ✨ **滚动渐入动画** — IntersectionObserver 实现
- ⬆️ **回到顶部按钮** — 滚动后自动出现
- 📡 **RSS 订阅** — 博客文章自动生成 RSS
- 🗺️ **SEO 友好** — `sitemap.xml` / `robots.txt` / Open Graph / Twitter Card
- 📊 **GitHub 统计** — 贡献图、访客数、博客/论文计数
- 🔍 **博客分类过滤** — 客户端 JS 实现

## 📁 项目结构

```
.
├── index.html              # 首页
├── about.html              # 关于我
├── research.html           # 研究方向
├── publications.html       # 论文发表
├── projects.html           # 项目展示
├── blog.html               # 博客列表
├── blog/                   # 博客文章
│   ├── 2026-06-20-research-notes.html
│   └── 2026-05-08-python-config.html
├── talks.html              # 会议分享
├── books.html              # 阅读书单
├── hobbies.html            # 兴趣爱好
├── cv.html                 # 简历
├── 404.html                # 错误页
├── en/                     # 英文版本（9 个页面）
│   ├── index.html
│   ├── about.html
│   ├── research.html
│   ├── publications.html
│   ├── projects.html
│   ├── blog.html
│   ├── talks.html
│   ├── books.html
│   ├── hobbies.html
│   └── cv.html
├── assets/
│   ├── css/style.css       # 主样式（CSS 变量 + 深色模式）
│   ├── js/main.js          # 交互脚本
│   ├── images/
│   │   ├── favicon.svg
│   │   └── profile.svg     # 头像占位
│   └── files/              # 简历 PDF 等
├── sitemap.xml             # SEO 站点地图
├── robots.txt              # 搜索引擎指令
├── rss.xml                 # 博客 RSS
└── README.md
```

## 🚀 部署到 GitHub Pages

1. 将本仓库推送到 GitHub（仓库名建议为 `你的用户名.github.io`）
2. **Settings → Pages** → Source 选 `Deploy from a branch`
3. Branch 选 `main`，目录选 `/ (root)`，保存
4. 1-2 分钟后访问 `https://你的用户名.github.io` 即可看到

## ✏️ 如何填写个人信息

> 所有页面中**带"你的名字"、"你的邮箱"等中文/英文占位的文字**都是需要替换的内容。
> 用项目内全局搜索（编辑器 Cmd/Ctrl+Shift+F）搜「你的名字」和「your.email@example.com」可一次找全。

### 1. 基础信息

| 文件 | 修改内容 |
| --- | --- |
| `index.html` | Hero 区域（一句话简介）、数据一览、个人概览、最新动态、精选论文、最新博客 |
| `about.html` | 个人简介、教育/工作/技能/获奖 |
| `research.html` | 研究方向、当前研究 |
| `publications.html` | 完整论文列表 |
| `projects.html` | 项目卡片 |
| `blog.html` | 博客文章列表 |
| `blog/*.html` | 各篇博客文章 |
| `talks.html` | 会议分享 |
| `books.html` | 阅读书单 |
| `hobbies.html` | 兴趣爱好 |
| `cv.html` | 完整简历 |
| `en/*.html` | 英文版本（同样的占位符，结构一致） |
| `assets/images/profile.svg` | 替换为你的头像（如 `profile.jpg`），并改 `index.html` 中的 `src` |

### 2. 替换头像

把头像文件放到 `assets/images/` 下（如 `profile.jpg`），然后在 `index.html` 和 `en/index.html` 中修改：

```html
<img src="assets/images/profile.svg" alt="个人头像">
```

改为：

```html
<img src="assets/images/profile.jpg" alt="个人头像">
```

### 3. 提供简历 PDF 下载

把简历 PDF 放到 `assets/files/cv.pdf`，`cv.html` 顶部的"下载 PDF 简历"按钮就会自动生效。

### 4. 修改 GitHub 用户名（影响访客统计与贡献图）

在 `index.html` 的"数据一览"和"贡献图"处，将 `Canyon-netizen` 替换为你的 GitHub 用户名。

### 5. 启用 Google Analytics / Plausible（可选）

在所有 `.html` 文件的 `</head>` 前添加对应的 analytics 脚本。

## 🎨 自定义主题

所有视觉风格都集中在 [`assets/css/style.css`](assets/css/style.css) 顶部的 `:root` 变量中：

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

修改后整站颜色会同步更新。明暗模式的具体细节也可在此调整。

## 🆕 添加新博客文章

1. 在 `blog/` 目录创建新的 HTML 文件（建议用 `YYYY-MM-DD-标题.html` 命名）
2. 复制 `blog/2026-06-20-research-notes.html` 作为模板，修改内容
3. 在 `blog.html` 中添加一个 `<article class="post-item" data-category="...">` 块
4. 在 `rss.xml` 中追加一个 `<item>` 节点
5. 在 `sitemap.xml` 中追加一个 `<url>` 节点

## 🛠️ 本地预览

```bash
# 进入项目目录
cd canyon-netizen.github.io

# 任选一种方式启动本地服务器
python3 -m http.server 8000
# 或
npx serve .
```

然后浏览器访问 `http://localhost:8000`。

## 📝 许可

本框架可自由使用、修改、再分发。
