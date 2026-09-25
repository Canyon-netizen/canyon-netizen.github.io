"""生成社交分享预览图（og:image PNG）。
用法：python tools/make-og-image.py
说明：PNG 才能被绝大多数社交平台正确渲染；SVG 版保留作为参考。
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

W, H = 1200, 630
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "images" / "og-image.png"

# 站主色（与 style.css 的 --color-gradient-* 对齐）
C1 = (30, 58, 95)      # #1e3a5f
C2 = (43, 108, 176)    # #2b6cb0
C3 = (66, 153, 225)    # #4299e1

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\seguisb.ttf",
    r"C:\Windows\Fonts\segoeui.ttf",
]


def load_font(size, bold=True):
    order = FONT_CANDIDATES if bold else list(reversed(FONT_CANDIDATES))
    for path in order:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


# ---------- 背景：对角渐变 ----------
img = Image.new("RGB", (W, H), C1)
px = img.load()
for y in range(H):
    for x in range(W):
        t = (x / W * 0.65 + y / H * 0.35)
        if t < 0.5:
            k = t / 0.5
            r = int(C1[0] + (C2[0] - C1[0]) * k)
            g = int(C1[1] + (C2[1] - C1[1]) * k)
            b = int(C1[2] + (C2[2] - C1[2]) * k)
        else:
            k = (t - 0.5) / 0.5
            r = int(C2[0] + (C3[0] - C2[0]) * k)
            g = int(C2[1] + (C3[1] - C2[1]) * k)
            b = int(C2[2] + (C3[2] - C2[2]) * k)
        px[x, y] = (r, g, b)

draw = ImageDraw.Draw(img, "RGBA")

# ---------- 柔光斑 ----------
for cx, cy, rad, alpha in ((980, 130, 300, 26), (140, 540, 340, 20), (1080, 520, 170, 22)):
    for i in range(rad, 0, -6):
        a = int(alpha * (1 - i / rad) ** 1.6)
        draw.ellipse([cx - i, cy - i, cx + i, cy + i], fill=(255, 255, 255, a))

# ---------- 网格纹理（右侧淡网格）----------
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(grid)
for x in range(0, W, 48):
    gdraw.line([(x, 0), (x, H)], fill=(255, 255, 255, 14), width=1)
for y in range(0, H, 48):
    gdraw.line([(0, y), (W, y)], fill=(255, 255, 255, 14), width=1)
mask = Image.new("L", (W, H), 0)
mdraw = ImageDraw.Draw(mask)
mdraw.ellipse([560, -120, 1400, 720], fill=190)
img.paste(grid, (0, 0), mask)
draw = ImageDraw.Draw(img, "RGBA")

# ---------- 顶部渐变短线 ----------
draw.rounded_rectangle([84, 104, 190, 112], radius=4, fill=(140, 200, 245, 255))

# ---------- 文字 ----------
f_name = load_font(100, bold=True)
f_en = load_font(40, bold=True)
f_sub = load_font(30, bold=False)
f_body = load_font(26, bold=False)
f_chip = load_font(21, bold=True)
f_url = load_font(21, bold=False)

draw.text((80, 148), "周睿", font=f_name, fill=(255, 255, 255, 255))
draw.text((286, 196), "Zhou Rui", font=f_en, fill=(190, 220, 250, 255))
draw.text((82, 280), "浙江大学计算机科学与技术学院 · 2026 级博士研究生", font=f_sub, fill=(224, 236, 250, 255))
draw.text((82, 330), "本科 2022 – 2026 · 机器学习 · 自然语言处理 · 大语言模型", font=f_body, fill=(206, 224, 244, 255))

# ---------- 标签 chips ----------
chips = ["机器学习", "自然语言处理", "大语言模型"]
x = 84
for text in chips:
    tw = draw.textlength(text, font=f_chip)
    w = tw + 40
    draw.rounded_rectangle([x, 500, x + w, 550], radius=25, fill=(255, 255, 255, 40))
    draw.text((x + 20, 513), text, font=f_chip, fill=(255, 255, 255, 255))
    x += w + 14

# ---------- 域名（右下）----------
url = "canyon-netizen.github.io"
uw = draw.textlength(url, font=f_url)
draw.text((W - 84 - uw, H - 76), url, font=f_url, fill=(255, 255, 255, 165))

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "PNG", optimize=True)
print(f"saved {OUT} ({OUT.stat().st_size} bytes)")
