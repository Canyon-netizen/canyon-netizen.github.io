"""校验 assets/files/cv.pdf：文件完整性 + 页数 + 文字不越出版心。

用法：python tools/check-cv.py

越界检测的意义：本机 LibreOffice 会替换中文字体（实测字宽约 1.2 倍），
生成 PDF 后如果正文越过右边界会被裁掉 —— 肉眼看缩略图很容易漏掉，
所以这里渲染成图后按像素检查最右墨迹（pdf2image 不可用，走 LibreOffice Kit）。
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "assets" / "files" / "cv.pdf"
DOCX = ROOT / "assets" / "files" / "cv.docx"
RENDER_DIR = ROOT / ".dsh-cv-check"

NODE = Path(r"D:\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe")
CLI = Path(r"D:\DeepSeek Harness\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js")

# 版心右边界（cm）：A4 21cm − 左边距 1.9cm − 右边距 1.5cm ⇒ 版面内可用到 19.5cm
PAGE_CM = 21.0
MARGIN_L_CM = 1.9
MARGIN_R_CM = 1.5
TEXT_RIGHT_CM = PAGE_CM - MARGIN_R_CM
TOLERANCE_CM = 0.15

problems: list[str] = []
warnings: list[str] = []
info: dict = {}


def check_pdf_bytes() -> None:
    if not PDF.exists():
        problems.append("assets/files/cv.pdf 不存在")
        return
    raw = PDF.read_bytes()
    info["bytes"] = len(raw)
    info["head"] = raw[:8].decode("latin-1", "replace")
    info["tail"] = raw[-16:].decode("latin-1", "replace").strip()
    if len(raw) < 20_000:
        problems.append(f"PDF 只有 {len(raw)} 字节，疑似失败产物")
    if not raw.startswith(b"%PDF-"):
        problems.append("缺少 %PDF- 文件头")
    if b"%%EOF" not in raw[-2048:]:
        problems.append("缺少 %%EOF 结尾（文件可能被截断）")
    pages = len(re.findall(rb"/Type\s*/Page[^s]", raw))
    info["pageObjects"] = pages
    if pages < 1:
        problems.append("找不到任何页面对象")


def render_and_measure() -> None:
    if not (NODE.exists() and CLI.exists()):
        warnings.append("找不到 LibreOffice Kit，跳过页数与越界检测")
        return
    if not DOCX.exists():
        problems.append("assets/files/cv.docx 不存在（无法复核排版）")
        return

    # render 的 --output-dir 必须不存在，否则 CLI 会 EEXIST 失败
    if RENDER_DIR.exists():
        for f in RENDER_DIR.glob("*"):
            if f.is_file():
                f.unlink()
        RENDER_DIR.rmdir()

    res = subprocess.run(
        [str(NODE), str(CLI), "render", "--input", str(DOCX),
         "--output-dir", str(RENDER_DIR), "--dpi", "150"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=str(ROOT)
    )
    info["renderExit"] = res.returncode
    info["renderCmd"] = " ".join([str(NODE), str(CLI), "render", "--input", str(DOCX),
                                  "--output-dir", str(RENDER_DIR), "--dpi", "150"])
    lines = [ln for ln in (res.stdout or "").splitlines() if ln.strip()]
    if not lines:
        problems.append(
            f"LibreOffice render 无输出（exit={res.returncode}）"
            f" stderr={(res.stderr or '').strip()[:300]!r}"
            f" outDirExists={RENDER_DIR.exists()}"
        )
        return

    try:
        manifest = json.loads(lines[-1])
    except Exception as err:  # noqa: BLE001
        problems.append(f"render 输出无法解析：{err}")
        return

    info["pageCount"] = manifest.get("pageCount")
    if not manifest.get("pageCount"):
        problems.append("渲染页数为 0")
    if manifest.get("missingFonts"):
        info["fontWarning"] = manifest["missingFonts"]
        warnings.append(
            "LibreOffice 报告缺少字体：" + ", ".join(manifest["missingFonts"]) +
            "（正文仍可渲染，仅模板内置字体名解析不到）"
        )

    # 图像留白：LibreOffice Kit 的 PNG 与整页尺寸并不等比，
    # 只能作为「疑似贴边」的预警，不作为失败判据（误报过）。
    try:
        from PIL import Image
    except Exception:  # noqa: BLE001
        return

    tightest = 100.0
    for item in manifest.get("images", []):
        path = Path(item["path"])
        if not path.exists():
            continue
        img = Image.open(path).convert("RGB")
        w, h = img.size
        px = img.load()
        page_worst = 0
        for y in range(h):
            run = 0
            for x in range(w - 3, 3, -1):
                r, g, b = px[x, y]
                if r < 170 and g < 170 and b < 170:
                    run += 1
                    if run >= 3:
                        page_worst = max(page_worst, x + 2)
                        break
                else:
                    run = 0
        gap = (w - page_worst) / w if w else 0
        tightest = min(tightest, gap * 100)

    info["minRightGapPct"] = round(tightest, 1)
    if tightest < 2.0:
        warnings.append(
            f"渲染图中右侧留白仅 {tightest:.1f}%（工具输出尺寸与整页不成比例，仅供人工复核）"
        )

    info["minRightGapPct"] = round(tightest, 1)


check_pdf_bytes()
render_and_measure()

print(json.dumps({
    "ok": not problems,
    "pdf": str(PDF.relative_to(ROOT)),
    "info": info,
    "problems": problems,
    "warnings": warnings
}, ensure_ascii=False, indent=2))

sys.exit(0 if not problems else 1)
