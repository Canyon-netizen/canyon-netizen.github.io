"""从 data.json 生成简历 DOCX，再由 LibreOffice 转成可下载的 PDF。

用法：
    python tools/make-cv.py

产出：
    assets/files/cv.docx  （可编辑源文件）
    assets/files/cv.pdf   （站点「下载 PDF 简历」按钮指向它）

排版注意事项（都是踩过的坑）：
  1. 中文字体必须同时设置 w:ascii/hAnsi/eastAsia：只设 run.font.name 时
     LibreOffice 会回退字体，字宽约大 15%，正文会越过版心被裁掉。
  2. 不要用全角空格或默认制表位对齐「左标题 + 右日期」；日期直接写在标题下一行。
  3. 右侧边距刻意留宽（4cm）：中文简历常用窄栏，也给字体回退留出安全余量。
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Pt, RGBColor, Cm

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
OUT_DIR = ROOT / "assets" / "files"
OUT_DIR.mkdir(parents=True, exist_ok=True)
DOCX = OUT_DIR / "cv.docx"

NODE = Path(r"D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe")
CLI = Path(r"D:\DeepSeek Harness\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js")

INK = RGBColor(0x16, 0x20, 0x2E)
SOFT = RGBColor(0x4A, 0x55, 0x68)
ACCENT = RGBColor(0x1E, 0x3A, 0x5F)
FONT = "Microsoft YaHei"

S_NAME, S_SUB, S_CONTACT = 13, 7, 7
S_SECTION, S_ITEM, S_BODY, S_META, S_FOOT = 8.5, 8, 7, 7, 6.5

P = DATA["personal"]


def style_run(run, size, bold=False, color=INK):
    run.font.name = FONT
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = rPr.makeelement(qn("w:rFonts"), {})
        rPr.insert(0, rFonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rFonts.set(qn(attr), FONT)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return run


def para(doc, text="", size=S_BODY, bold=False, color=INK, space_before=0,
         space_after=2, align=None, line=1.3, indent=None):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing = line
    if align is not None:
        p.alignment = align
    if indent is not None:
        pf.left_indent = Cm(indent)
    if text:
        style_run(p.add_run(text), size, bold, color)
    return p


def section_title(doc, text, first=False):
    p = para(doc, text, size=S_SECTION, bold=True, color=ACCENT,
             space_before=0 if first else 10, space_after=3)
    pPr = p._p.get_or_add_pPr()
    borders = pPr.makeelement(qn("w:pBdr"), {})
    borders.append(borders.makeelement(qn("w:bottom"), {
        qn("w:val"): "single", qn("w:sz"): "6", qn("w:space"): "2", qn("w:color"): "C7D2E0"
    }))
    pPr.append(borders)
    return p


def row(doc, title, date="", sub="", meta=""):
    """标题一行、日期一行、补充说明一行 —— 不用制表位，避免越界。"""
    para(doc, title, size=S_ITEM, bold=True, color=INK, space_before=3, space_after=0)
    if date:
        para(doc, date, size=S_META, color=ACCENT, space_after=1, line=1.15)
    if sub:
        para(doc, sub, size=S_BODY, color=SOFT, space_after=1, indent=0.15)
    if meta:
        para(doc, meta, size=S_META, color=SOFT, space_after=3, indent=0.15)


def bullet(doc, text):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_before = Pt(0)
    pf.space_after = Pt(2)
    pf.line_spacing = 1.3
    pf.left_indent = Cm(0.5)
    pf.first_line_indent = Cm(-0.32)
    style_run(p.add_run("· "), S_BODY, False, ACCENT)
    style_run(p.add_run(text), S_BODY, False, SOFT)
    return p


doc = Document()

# 关掉 Word 默认制表位网格
doc.settings.element.append(
    doc.settings.element.makeelement(qn("w:defaultTabStop"), {qn("w:val"): "0"})
)

# Normal 样式：python-docx 模板默认 Courier，本机没有该字体
normal = doc.styles["Normal"]
normal.font.name = FONT
normal.font.size = Pt(S_BODY)
n_rPr = normal.element.get_or_add_rPr()
n_rFonts = n_rPr.find(qn("w:rFonts"))
if n_rFonts is None:
    n_rFonts = n_rPr.makeelement(qn("w:rFonts"), {})
    n_rPr.insert(0, n_rFonts)
for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
    n_rFonts.set(qn(attr), FONT)

# A4 + 左边距 1.9cm、右边距 1.5cm。
# 右侧刻意留窄：本机 LibreOffice 会替换中文字体，实测字宽约为标称的 1.2 倍，
# 所以字号整体按「渲染后」的字宽来定（见 tools/check-cv.py 的越界检测）。
sec = doc.sections[0]
sec.page_width = Cm(21.0)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(1.8)
sec.bottom_margin = Cm(1.8)
sec.left_margin = Cm(1.9)
sec.right_margin = Cm(1.5)

footer_p = sec.footer.paragraphs[0]
footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
style_run(footer_p.add_run(
    f'{P["name"]} · {P["email"]} · {P["online"]["homepage"].replace("https://", "")}'
), S_FOOT, False, SOFT)

# ---------- 抬头 ----------
para(doc, P["name"], size=S_NAME, bold=True, color=INK, space_after=3,
     align=WD_ALIGN_PARAGRAPH.CENTER)
para(doc, "博士研究生 · 机器学习 / 自然语言处理 / 大语言模型", size=S_SUB, color=SOFT,
     space_after=4, align=WD_ALIGN_PARAGRAPH.CENTER)
addr = P["address"]
para(doc, " · ".join([P["email"], f'杭州市{addr["district"]} · {addr["university"]}']),
     size=S_CONTACT, color=SOFT, space_after=1, align=WD_ALIGN_PARAGRAPH.CENTER)
para(doc, " · ".join([P["online"]["homepage"].replace("https://", ""),
                      "github.com/" + P["online"]["github"]]),
     size=S_CONTACT, color=SOFT, space_after=8, align=WD_ALIGN_PARAGRAPH.CENTER)

# ---------- 个人简介 ----------
bio = (P.get("bio") or [])[:2]
if bio:
    section_title(doc, "个人简介", first=True)
    for text in bio:
        para(doc, text, size=S_BODY, color=SOFT, space_after=3)

# ---------- 教育背景 ----------
if DATA.get("education"):
    section_title(doc, "教育背景")
    for e in DATA["education"]:
        left = e.get("school", "")
        if e.get("department"):
            left += " · " + e["department"]
        row(doc, left, e.get("period", ""), e.get("degree", ""))

# ---------- 研究经历 ----------
if DATA.get("research"):
    section_title(doc, "研究经历")
    for r in DATA["research"]:
        row(doc, r.get("title", ""), r.get("period", ""), r.get("description", ""))

# ---------- 项目经历 ----------
# 简历不是项目清单：只列最相关的几个（data.json 里可用 "cvFeatured": false 排除），
# 保证一页装得下，完整列表在网站 projects 页
if DATA.get("projects"):
    section_title(doc, "项目经历")
    cv_projects = [p for p in DATA["projects"] if p.get("cvFeatured", True)][:3]
    for pr in cv_projects:
        title = pr.get("title", "")
        if pr.get("statusLabel"):
            title += "（" + pr["statusLabel"] + "）"
        meta = []
        if pr.get("tech"):
            meta.append("技术栈：" + "、".join(pr["tech"]))
        if pr.get("links"):
            meta.append("链接：" + " / ".join(l.get("label", "") for l in pr["links"]))
        row(doc, title, "", pr.get("cvDescription") or pr.get("description", ""),
            "　".join(meta))

# ---------- 技能 ----------
skills = DATA.get("skills") or {}
groups = [
    ("编程语言", [s["name"] + (f'（{s["level"]}）' if s.get("level") else "")
                  for s in skills.get("languages", [])]),
    ("工具与框架", [s["name"] for s in skills.get("tools", [])]),
    ("语言能力", [s["name"] + (f'（{s["level"]}）' if s.get("level") else "")
                  for s in skills.get("spoken", [])]),
]
if any(items for _, items in groups):
    section_title(doc, "技能清单")
    for title, items in groups:
        if items:
            bullet(doc, title + "：" + "、".join(items))

# ---------- 论文 / 实习 / 获奖 ----------
if DATA.get("publications"):
    section_title(doc, "论文发表")
    for pub in DATA["publications"]:
        authors = "、".join(a["name"] if isinstance(a, dict) else str(a)
                            for a in pub.get("authors", []))
        bullet(doc, "　".join(x for x in [pub.get("title", ""), authors,
                                          pub.get("venue", ""), str(pub.get("year", ""))] if x))

if DATA.get("internships"):
    section_title(doc, "实习经历")
    for it in DATA["internships"]:
        bullet(doc, "　".join(x for x in [it.get("company", ""), it.get("role", ""),
                                          it.get("period", ""), it.get("description", "")] if x))

if DATA.get("awards"):
    section_title(doc, "获奖经历")
    for aw in DATA["awards"]:
        bullet(doc, "　".join(x for x in [str(aw.get("year", "")), aw.get("name", "")] if x))

doc.save(DOCX)
print(f"docx saved: {DOCX} ({DOCX.stat().st_size} bytes)")

if not NODE.exists() or not CLI.exists():
    print("!! 找不到 LibreOffice Kit（node 或 cli 路径不可用）", file=sys.stderr)
    sys.exit(2)

pdf = OUT_DIR / "cv.pdf"
if pdf.exists():
    pdf.unlink()

res = subprocess.run(
    [str(NODE), str(CLI), "convert", "--input", str(DOCX), "--output", str(pdf)],
    capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=str(ROOT)
)
print("libreoffice exit:", res.returncode)
for line in (res.stdout or "").splitlines():
    if line.strip():
        print("stdout:", line.strip()[:400])
if (res.stderr or "").strip():
    print("stderr:", res.stderr.strip()[:400])

if pdf.exists():
    print(f"pdf saved: {pdf} ({pdf.stat().st_size} bytes)")
else:
    print("!! PDF 未生成", file=sys.stderr)
    sys.exit(1)
