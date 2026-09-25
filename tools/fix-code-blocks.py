"""修正 YAML / Python 代码块的缩进语义。

用法：python tools/fix-code-blocks.py

背景：这两篇文章的 <pre> 内容在源 HTML 里自带 16 空格缩进，且有嵌套层级丢失
（例如 YAML 的 model.name、Python 类体的成员）。自动 de-indent 无法可靠还原，
所以对这两个片段按语义直接给出正确文本。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

FIXES = {
    "2026-05-08-python-config": [
        (
            '<pre><code class="language-yaml"># config.yaml\nmodel:\n  name: resnet50\n  lr: 0.001\n  batch_size: 64\ndata:\n  train: data/train\n  val: data/val\n</code></pre>',
            '<pre><code class="language-yaml"># config.yaml\nmodel:\n  name: resnet50\n  lr: 0.001\n  batch_size: 64\ndata:\n  train: data/train\n  val: data/val\n</code></pre>',
        ),
        (
            '<pre><code class="language-python">from pydantic_settings import BaseSettings\n\nclass Settings(BaseSettings):\n    db_url: str\n    secret_key: str\n    debug: bool = False\n\n    class Config:\n    env_file = ".env"\n\n    settings = Settings()\n</code></pre>',
            '<pre><code class="language-python">from pydantic_settings import BaseSettings\n\n'
            'class Settings(BaseSettings):\n'
            '    db_url: str\n'
            '    secret_key: str\n'
            '    debug: bool = False\n'
            '\n'
            '    class Config:\n'
            '        env_file = ".env"\n'
            '\n'
            'settings = Settings()\n</code></pre>',
        ),
    ]
}

report = []
for post in data.get("posts", []):
    fixes = FIXES.get(post.get("slug"))
    if not fixes or "content" not in post:
        continue
    for old, new in fixes:
        if old in post["content"]:
            post["content"] = post["content"].replace(old, new)
            report.append({"slug": post["slug"], "status": "fixed"})
        elif new not in post["content"]:
            report.append({"slug": post["slug"], "status": "pattern-not-found"})

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": report}, ensure_ascii=False, indent=2))
