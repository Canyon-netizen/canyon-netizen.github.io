"""规范化 data.json 里 posts[].content 的正文片段。

用法：python tools/normalize-post-content.py

做两件事：
  1. 去掉包裹层带来的整体缩进（保留 <pre> 内部代码缩进）
  2. 修复历史遗留的「HTML 里 <pre> 内容自带 16 空格缩进」——
     那会让代码块左侧出现一大段空白并且丢掉嵌套缩进，这里统一按代码语义重新缩进
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))


def dedent_outside_pre(html: str, base: int) -> str:
    """按 base 去缩进；<pre> 内的行也整体去 base，但保留相对缩进。"""
    out = []
    in_pre = False
    for line in html.split("\n"):
        stripped = line.strip()
        if "<pre" in line:
            in_pre = True
        if not stripped:
            out.append("")
            continue
        indent = len(line) - len(line.lstrip(" "))
        out.append(line[min(indent, base):] if indent >= base else line.lstrip(" "))
        if "</pre>" in line:
            in_pre = False
    return "\n".join(out)


def fix_code_block(code: str, lang: str) -> str:
    """去掉代码块里多余的前导空白，并按语言重建缩进。"""
    raw = [ln for ln in code.split("\n")]
    # 去掉首尾空行
    while raw and not raw[0].strip():
        raw.pop(0)
    while raw and not raw[-1].strip():
        raw.pop()

    # 统一削到最左
    dedented = []
    for ln in raw:
        indent = len(ln) - len(ln.lstrip(" "))
        dedented.append(ln[indent:] if ln.strip() else "")

    if lang == "yaml":
        out, in_model, in_data = [], False, False
        for ln in dedented:
            if ln in ("model:",):
                out.append(ln)
                in_model, in_data = True, False
                continue
            if ln in ("data:",):
                out.append(ln)
                in_model, in_data = False, True
                continue
            if not ln:
                out.append("")
                continue
            if ln in ("name: resnet50", "lr: 0.001", "batch_size: 64"):
                out.append("  " + ln)
                continue
            if ln.startswith(("train:", "val:")):
                out.append("  " + ln)
                continue
            out.append(ln)
        return "\n".join(out)

    if lang == "python":
        # 依据「上一行以冒号结尾」推断块缩进；不再回到 0（早期版本在
        # class/def 行把 indent 归零，导致类体成员缩进丢失）
        out = []
        indent = 0
        for ln in dedented:
            if not ln:
                out.append("")
                continue
            if out and out[-1].rstrip().endswith(":"):
                indent = 1
            out.append("    " * indent + ln)
        return "\n".join(out)

    return "\n".join(dedented)


def normalize(code_html: str) -> str:
    def repl(m: re.Match) -> str:
        lang = m.group(1)
        code = m.group(2)
        fixed = fix_code_block(code, lang)
        return f'<pre><code class="language-{lang}">{fixed}\n</code></pre>'
    return re.sub(r'<pre><code class="language-([a-z]+)">([\s\S]*?)</code></pre>', repl, code_html)


report = []
for post in data.get("posts", []):
    body = post.get("content")
    if not body:
        continue
    lines = body.split("\n")
    indents = [len(ln) - len(ln.lstrip(" ")) for ln in lines if ln.strip()]
    base = min(indents) if indents else 0
    cleaned = dedent_outside_pre(body, base).strip()
    cleaned = normalize(cleaned)
    post["content"] = cleaned
    report.append({
        "slug": post.get("slug"),
        "chars": len(cleaned),
        "base": base,
        "codeBlocks": len(re.findall(r"<pre>", cleaned)),
    })

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": report}, ensure_ascii=False, indent=2))

# 打印一小段校验
for post in data.get("posts", []):
    body = post.get("content", "")
    m = re.search(r"<pre><code[^>]*>([\s\S]*?)</code></pre>", body)
    if m:
        print("\n--- " + post["slug"] + " 首个代码块 ---")
        print(m.group(1))
        break
