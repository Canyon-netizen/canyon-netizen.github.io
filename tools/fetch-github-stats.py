"""抓取 GitHub 仓库的公开元数据，写入 data.json 的 projects[].stats。

用法：python tools/fetch-github-stats.py [--add-missing]

为什么要做：
    项目卡片此前只有手写的「技术栈」列表，star 数、主语言、许可证、最近更新时间
    这些**可核实**的信息都没有展示。这些数据 GitHub 公开 API 就能拿到，
    抓一次写进 data.json（静态站没有运行时后端），页面即可展示真实数据。
    单位是「抓取时刻的公开数据」，因此文章/页面里注明「数据来自 GitHub」。

    --add-missing：把账号下存在、但 data.json 里还没登记的真实仓库补充进 projects。
                   默认关闭，避免无意中把不想公开的仓库放到站上。

注意：GitHub 未认证接口限流 60 次/小时；本脚本一次只发少量请求，并在失败时保留原值。
"""
from __future__ import annotations

import datetime
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
OWNER = "canyon-netizen"
API = "https://api.github.com"
ADD_MISSING = "--add-missing" in sys.argv


def api(path: str):
    req = urllib.request.Request(
        API + path,
        headers={"User-Agent": "canyon-site-build", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return {"__error": f"HTTP {err.code}"}
    except Exception as err:  # noqa: BLE001
        return {"__error": str(err)}


def repo_name(url: str) -> str:
    if not url:
        return ""
    return url.rstrip("/").split("/")[-1]


# GitHub 的 language 按字节数统计，对「后端 Python + 前端 JS」这类项目会只显示其中一个
# （例如 Reasoning3D 被标成 HTML）。这里给出人工核对过的展示值，优先级高于自动值。
LANGUAGE_OVERRIDE = {
    "steer3d": "Python / JavaScript",
}


data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
projects = data.setdefault("projects", [])
meta = data.setdefault("meta", {})
meta["githubFetchedAt"] = datetime.date.today().isoformat()

# 1) 更新已有项目
for pr in projects:
    links = pr.get("links") or []
    gh = next((l.get("href", "") for l in links if "github.com" in (l.get("href") or "")), "")
    name = repo_name(gh)
    if not name:
        continue
    info = api(f"/repos/{OWNER}/{name}")
    if "__error" in info:
        print(f"! {name}: {info['__error']}（保留原值）")
        continue
    pr["stats"] = {
        "repo": name,
        "stars": info.get("stargazers_count", 0),
        "forks": info.get("forks_count", 0),
        "language": LANGUAGE_OVERRIDE.get(name) or (info.get("language") or ""),
        "languageAuto": info.get("language") or "",
        "license": (info.get("license") or {}).get("spdx_id") or "",
        "createdAt": (info.get("created_at") or "")[:10],
        "pushedAt": (info.get("pushed_at") or "")[:10],
        "topics": info.get("topics") or [],
        "homepage": info.get("homepage") or "",
        "archived": bool(info.get("archived")),
    }
    print(f"[ok] {name}: lang={pr['stats']['language']} stars={pr['stats']['stars']} "
          f"license={pr['stats']['license'] or '-'} pushed={pr['stats']['pushedAt']}")

# 2) 可选：补充账号下未登记的真实仓库
if ADD_MISSING:
    listed = {repo_name(next((l.get('href', '') for l in (pr.get('links') or [])
                              if 'github.com' in (l.get('href') or '')), '')) for pr in projects}
    repos = api(f"/users/{OWNER}/repos?per_page=100&sort=pushed")
    if isinstance(repos, list):
        for r in repos:
            if r.get("fork") or r.get("name") in listed:
                continue
            if data.get("personal", {}).get("online", {}).get("github") is None:
                continue
            projects.append({
                "title": r["name"],
                "titleEn": r["name"],
                "status": "completed" if r.get("archived") else "active",
                "statusLabel": "已归档" if r.get("archived") else "持续维护",
                "statusLabelEn": "Archived" if r.get("archived") else "Maintained",
                "description": f'（待补充描述）GitHub 上的公开仓库，主语言 {r.get("language") or "—"}。',
                "descriptionEn": f'(description to be filled in) A public repository; primary language {r.get("language") or "—"}.',
                "tech": [r.get("language")] if r.get("language") else [],
                "links": [{"label": "GitHub", "href": r["html_url"]}],
                "stats": {
                    "repo": r["name"],
                    "stars": r.get("stargazers_count", 0),
                    "forks": r.get("forks_count", 0),
                    "language": LANGUAGE_OVERRIDE.get(r["name"]) or (r.get("language") or ""),
                    "languageAuto": r.get("language") or "",
                    "license": (r.get("license") or {}).get("spdx_id") or "",
                    "createdAt": (r.get("created_at") or "")[:10],
                    "pushedAt": (r.get("pushed_at") or "")[:10],
                    "topics": r.get("topics") or [],
                    "homepage": r.get("homepage") or "",
                    "archived": bool(r.get("archived")),
                },
            })
            print(f"[add] 新增 {r['name']}（描述待补充）")

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"projects: {len(projects)} 个（其中带 stats 的 {sum(1 for p in projects if p.get('stats'))} 个）")

# 3) 首页「公开仓库」数字改成「真实总数（自动核对）」
#    展示的项目是精选的，总数应等于账号下真实仓库数，否则会出现
#    「首页写 6 个、项目页只列 5 个」这种自相矛盾且无法解释的情况。
user = api(f"/users/{OWNER}")
if isinstance(user, dict) and "public_repos" in user:
    total = user["public_repos"]
    stats = data.setdefault("stats", {})
    gh = stats.setdefault("githubStars", {"label": "公开仓库", "labelEn": "Public Repositories", "icon": "📦"})
    gh["value"] = str(total)
    gh["label"] = "公开仓库"
    gh["labelEn"] = "Public Repositories"
    gh["note"] = f"GitHub 账号下全部公开仓库数（{OWNER}）；下列 {len(projects)} 个为站内精选展示"
    gh["noteEn"] = f"All public repositories on the account ({OWNER}); the {len(projects)} listed here are curated"
    meta["githubRepoTotal"] = total
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"stats.githubStars.value = {total}（首页原文案已同步）")
else:
    print("! 未能读取 public_repos，保留原有数字")
