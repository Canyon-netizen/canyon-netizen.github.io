# 个人主页 (GitHub Pages)

这是一个可直接部署在 GitHub Pages 上的个人主页框架，**无需任何构建步骤**，纯 HTML/CSS/JS 编写。

## 📁 项目结构

```
.
├── index.html              # 首页（个人简介 + 概览）
├── about.html              # 关于我（教育背景、技能、获奖）
├── research.html           # 研究方向
├── publications.html       # 论文发表
├── projects.html           # 项目展示
├── cv.html                 # 简历
├── 404.html                # 错误页
├── assets/
│   ├── css/style.css       # 主样式
│   ├── js/main.js          # 交互脚本
│   ├── images/             # 图片资源（替换为你的头像等）
│   │   ├── favicon.svg
│   │   └── profile.svg     # 头像占位
│   └── files/              # 简历 PDF 等文件
└── README.md
```

## 🚀 部署到 GitHub Pages

1. 将本仓库推送到 GitHub（仓库名建议为 `你的用户名.github.io`）
2. 进入仓库的 **Settings → Pages**
3. Source 选择 `Deploy from a branch`，Branch 选择 `main`，目录选择 `/ (root)`
4. 等待几分钟后，访问 `https://你的用户名.github.io` 即可看到页面

## ✏️ 如何填写个人信息

> 所有页面中**带"你的名字"、"你的邮箱"等中文占位的文字**都是需要替换的内容。

主要修改位置：

| 文件 | 修改内容 |
| --- | --- |
| `index.html` | 首页 Hero 区域、个人概览、最新动态、代表性论文 |
| `about.html` | 个人简介、教育背景、工作经历、技能、获奖 |
| `research.html` | 研究方向、当前研究、合作意愿 |
| `publications.html` | 完整论文列表（按年份倒序） |
| `projects.html` | 项目卡片（标题、简介、技术栈、链接） |
| `cv.html` | 完整简历（如果用 PDF，把 `assets/files/cv.pdf` 替换即可） |
| `assets/images/profile.svg` | 替换为你的头像图片（如 `profile.jpg`），并修改 `index.html` 中的 `src` |

### 替换头像

将你的真实头像文件（如 `profile.jpg`）放到 `assets/images/` 下，然后在 `index.html` 中修改：

```html
<img src="assets/images/profile.svg" alt="个人头像">
```

改为：

```html
<img src="assets/images/profile.jpg" alt="个人头像">
```

### 提供简历 PDF 下载

将你的简历 PDF 放到 `assets/files/cv.pdf`，`cv.html` 顶部的"下载 PDF 简历"按钮就会自动生效。

## 🎨 自定义样式

所有视觉风格都集中在 `assets/css/style.css` 顶部的 `:root` 变量中：

```css
:root {
    --color-primary: #1e3a5f;     /* 主色：导航栏、深色文字 */
    --color-accent: #3182ce;      /* 强调色：链接、按钮 */
    /* ... 更多变量 ... */
}
```

修改主色调只需改这两个变量，整站颜色会同步更新。

## 🌐 切换为英文版

将每个 `.html` 文件中的：
- `<html lang="zh-CN">` 改为 `<html lang="en">`
- 中文占位文字替换为英文即可

CSS 与 JS 不需要任何修改。

## 📱 响应式

页面已适配 PC、平板、手机三种屏幕宽度。移动端会自动折叠导航栏为汉堡菜单。

## 🛠️ 本地预览

```bash
# 进入项目目录
cd canyon-netizen.github.io

# 任选一种方式启动本地服务器
python3 -m http.server 8000
# 或
npx serve .
```

然后在浏览器访问 `http://localhost:8000`。

## 📝 许可

本框架可自由使用、修改、再分发。
