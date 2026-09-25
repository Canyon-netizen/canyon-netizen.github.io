"""把两个有据可查的真实仓库补进 projects（描述依据各自 README，不臆造）。

用法：python tools/add-project-entries.py

- Reasoning3D（仓库名 steer3d）：README 明确写了目标、技术栈与「无需 GPU 的合成数据演示」。
- 一页（仓库名 novel）：README 明确写了定位、11 种小说类型、模板市场与多 API 支持。

仓库名带 `steer3d`、`novel` 这类缩写/单字，与项目展示名不一致，所以标题按 README 的实际名称写，
并在 `stats.repo` 里保留真实仓库名（由 fetch-github-stats.py 维护）。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

NEW = [
    {
        "title": "Reasoning3D — LLM 推理过程 3D 可视化",
        "titleEn": "Reasoning3D — 3D visualisation of LLM reasoning",
        "status": "active",
        "statusLabel": "开发中",
        "statusLabelEn": "In development",
        "description": "把大模型生成推理链时的 hidden states 流实时投到 3D 空间，用来观察推理轨迹的节奏与分叉。"
                       "提供了无需 GPU 的合成数据演示模式，向量注入的 hook 也已预留。",
        "descriptionEn": "Streams the hidden states of an LLM as it generates a chain of thought into 3D space, "
                         "so you can watch the trajectory, its rhythm and where it branches. Ships a GPU-free "
                         "synthetic-data demo and a hook for plugging in your own vector injection.",
        # 简历用更短的一句（网站保留完整两句）
        "cvDescription": "把大模型推理链的 hidden states 流实时投到 3D 空间，观察推理轨迹的节奏与分叉；含无需 GPU 的合成数据演示。",
        "cvDescriptionEn": "Streams an LLM's chain-of-thought hidden states into 3D space to show the trajectory's "
                           "rhythm and branches; ships a GPU-free synthetic-data demo.",
        "tech": ["Python", "FastAPI", "Three.js", "scikit-learn"],
        "links": [
            {"label": "GitHub", "href": "https://github.com/Canyon-netizen/steer3d"}
        ],
        "repo": "steer3d",
    },
    {
        "title": "一页 — 智能小说创作平台",
        "titleEn": "Yiye — AI-assisted novel writing platform",
        "status": "active",
        "statusLabel": "开发中",
        "statusLabelEn": "In development",
        "description": "面向长篇创作的写作平台：11 种小说类型各有专属提示词，含预设模板市场、"
                       "续写 / 润色 / 建议 / 命名等写作助手，并支持多家模型 API 与本地模拟。",
        "descriptionEn": "A long-form writing platform: eleven genres each with their own prompt system, a preset "
                         "template marketplace, assistants for continuation, polishing, suggestions and naming, "
                         "and support for several model APIs plus a local mock mode.",
        "tech": ["JavaScript", "HTML", "CSS", "LLM API"],
        "links": [
            {"label": "GitHub", "href": "https://github.com/Canyon-netizen/novel"}
        ],
        "repo": "novel",
    },
]

existing = {p.get("stats", {}).get("repo") or "" for p in data.get("projects", [])}
added = []
for item in NEW:
    repo = item.pop("repo")
    if repo in existing:
        continue
    item["stats"] = {"repo": repo}  # fetch-github-stats.py 会补全其余字段
    data["projects"].append(item)
    added.append(repo)

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"新增项目：{added or '（无，已存在）'}；projects 共 {len(data['projects'])} 个")
