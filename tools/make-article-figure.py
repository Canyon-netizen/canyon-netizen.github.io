"""生成博客配图：三遍阅读法示意图（纯 SVG，无需字体依赖）。

用法：python tools/make-article-figure.py
产出：assets/images/blog/three-pass-reading.svg
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "blog" / "three-pass-reading.svg"
OUT.parent.mkdir(parents=True, exist_ok=True)

W, H = 960, 420
STEPS = [
    ("第一遍", "鸟瞰", "15–20 分钟", "判断值不值得细读", "#2b6cb0"),
    ("第二遍", "理解", "1–2 小时", "搞清方法核心思想", "#1e3a5f"),
    ("第三遍", "复现", "半天–1 天", "提出 5–10 个可追问的问题", "#4299e1"),
]

BOX_W, BOX_H = 268, 168
GAP = 42
TOP = 150
LEFT = (W - (BOX_W * 3 + GAP * 2)) / 2

parts = [
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" '
    f'aria-label="三遍阅读法：先鸟瞰、再理解、最后复现">',
    "<defs>",
    '  <linearGradient id="fig-bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '    <stop offset="0%" stop-color="#f6f8fc"/><stop offset="100%" stop-color="#eef2f8"/>',
    "  </linearGradient>",
    '  <marker id="fig-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.2" orient="auto">',
    '    <path d="M0,0 L7,3.2 L0,6.4 z" fill="#8aa0b8"/>',
    "  </marker>",
    "</defs>",
    f'<rect width="{W}" height="{H}" rx="18" fill="url(#fig-bg)"/>',
]

# 标题
parts.append(
    f'<text x="{W/2}" y="66" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
    f'font-size="30" font-weight="700" fill="#16202e">论文三遍阅读法</text>'
)
parts.append(
    f'<text x="{W/2}" y="100" text-anchor="middle" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
    f'font-size="16" fill="#718096">第一遍判断值不值得读 · 第二遍弄清方法 · 第三遍内化取舍</text>'
)

for i, (label, title, dur, desc, color) in enumerate(STEPS):
    x = LEFT + i * (BOX_W + GAP)
    parts.append(f'<g transform="translate({x},{TOP})">')
    parts.append(f'  <rect width="{BOX_W}" height="{BOX_H}" rx="14" fill="#ffffff" stroke="#dbe3ee"/>')
    parts.append(f'  <rect width="{BOX_W}" height="6" rx="3" fill="{color}" opacity="0.9"/>')
    parts.append(
        f'  <text x="24" y="52" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
        f'font-size="17" font-weight="700" fill="{color}">{label}</text>'
    )
    parts.append(
        f'  <text x="24" y="90" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
        f'font-size="27" font-weight="700" fill="#16202e">{title}</text>'
    )
    parts.append(
        f'  <text x="24" y="120" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
        f'font-size="15" fill="#4a5568">{dur}</text>'
    )
    parts.append(
        f'  <text x="24" y="146" font-family="Microsoft YaHei, PingFang SC, sans-serif" '
        f'font-size="14" fill="#718096">{desc}</text>'
    )
    parts.append("</g>")
    if i < len(STEPS) - 1:
        ax = x + BOX_W + 6
        parts.append(
            f'<line x1="{ax}" y1="{TOP + BOX_H/2}" x2="{ax + GAP - 16}" y2="{TOP + BOX_H/2}" '
            f'stroke="#8aa0b8" stroke-width="2" marker-end="url(#fig-arrow)"/>'
        )

# 底部提示
parts.append(
    f'<text x="{W/2}" y="{TOP + BOX_H + 46}" text-anchor="middle" '
    f'font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="14" fill="#718096">'
    f'一周一篇精读 + 三五篇泛读，是比较舒服的节奏</text>'
)
parts.append("</svg>")

OUT.write_text("\n".join(parts), encoding="utf-8")
print(f"saved {OUT} ({OUT.stat().st_size} bytes)")
