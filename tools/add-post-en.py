"""为博客文章补充英文正文（posts[].contentEn），供中英双语文章页共用同一模板。

用法：python tools/add-post-en.py

只负责「写入英文正文」，不触碰中文正文。重复运行是幂等的。
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data.json"
data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

RESEARCH_NOTES_EN = """<p>
Reading papers is a daily routine in research. A top-conference paper runs 8-15 pages:
method, experiments, appendix, and possibly supplementary material. Many students
(including me, once) dive straight into the details and come out a week later still
confused. Here is the "three-pass" approach I use.
</p>

<figure class="post-figure">
    <img src="../../assets/images/blog/three-pass-reading.svg"
         width="960" height="420"
         alt="The three-pass reading method: pass one, skim for 15-20 minutes to decide whether the paper is worth a close read; pass two, understand the method in 1-2 hours; pass three, reproduce it over half a day to a day and list 5-10 questions worth pursuing.">
    <figcaption>The three-pass method: each pass has a different goal, and each gets you deeper (click to enlarge).</figcaption>
</figure>

<h2>Pass 1: Skim (15-20 minutes)</h2>
<p>
Goal: decide whether the paper deserves a close read, and which subfield it belongs to.
</p>
<ul>
<li><strong>Title and abstract</strong>: what problem, what method, what result?</li>
<li><strong>The end of the Introduction</strong>: usually 3-5 concrete contributions; this is the densest part of the paper.</li>
<li><strong>Section and figure captions</strong>: skim them to understand the overall structure.</li>
<li><strong>Conclusion</strong>: see what the authors believe their work means.</li>
</ul>
<p>
After this pass you should be able to summarise it in your own words: "This paper
targets problem X, proposes method Y, and improves on the state of the art by Z% on
dataset W."
</p>

<h2>Pass 2: Understand (1-2 hours)</h2>
<p>
Goal: understand the core idea of the method well enough to restate it and explain it to someone else.
</p>
<ul>
<li>Read the <strong>method section</strong> carefully, and for every equation ask "what is this computing?"</li>
<li>Draw a <strong>system diagram</strong> by hand.</li>
<li>Skip the heavy derivations; <strong>the intuition is the point</strong>.</li>
<li>Mark unfamiliar concepts to look up later instead of breaking your reading rhythm.</li>
</ul>
<blockquote>
    <p>After a good paper you can "play back" its method diagram in your head. After a bad one you only remember a pile of symbols.</p>
</blockquote>

<h2>Pass 3: Reproduce (half a day to a day)</h2>
<p>
Goal: find the hidden details, whether the experimental setup is sound, and what the authors did not say.
</p>
<ul>
<li>If you had to reproduce it, what would you run into?</li>
<li>What the authors left out: how were hyperparameters chosen? How was the data split? What are the failure cases?</li>
<li>Is the experimental design fair? Is <code>baseline</code> the strongest available choice?</li>
<li>Turn the above into 5-10 questions, then look for the authors' code or their students' follow-up papers.</li>
</ul>

<h2>A few habits</h2>
<ol>
    <li>Never read without a pen: every close read gets 1-2 pages of notes, so that six months later you can still reconstruct it.</li>
    <li>Code first, theory second: code that runs makes the method concrete.</li>
    <li>Explain it to a classmate: if you cannot make it clear, you have not understood it.</li>
    <li>Share in a group meeting: forcing yourself to explain it in 20 minutes is the best practice there is.</li>
</ol>

<h2>Summary</h2>
<p>
Reading a paper is not reading a novel; it is reverse engineering. The first pass tells
you whether it is worth reading, the second tells you what the method actually is, and
the third is where you internalise the authors' trade-offs. One close read plus three to
five skims a week is a comfortable pace.
</p>"""

PYTHON_CONFIG_EN = """<p>
A production Python project juggles several kinds of configuration: database
connections, API keys, model hyperparameters, and different environments
(development, testing, production). This is how I think about the trade-offs.
</p>

<h2>1. Environment variables (the baseline)</h2>
<p>Read with <code>os.environ</code>. Simple, but weakly typed and awkward to manage.</p>
<pre><code class="language-python">import os
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
</code></pre>

<h2>2. .env files + python-dotenv</h2>
<p>
Put environment variables in <code>.env</code> so switching is easy during development.
Always add <code>.env</code> to <code>.gitignore</code>.
</p>
<pre><code class="language-bash"># .env
DATABASE_URL=postgres://...
SECRET_KEY=xxx
</code></pre>

<h2>3. YAML / JSON / TOML config files</h2>
<p>Good for structured configuration, such as machine-learning hyperparameters.</p>
<pre><code class="language-yaml"># config.yaml
model:
  name: resnet50
  lr: 0.001
  batch_size: 64
data:
  train: data/train
  val: data/val
</code></pre>

<h2>4. Pydantic Settings (recommended)</h2>
<p>
Type safety, automatic validation, and merging across sources
(env &gt; file &gt; default). My default choice for new projects.
</p>
<pre><code class="language-python">from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_url: str
    secret_key: str
    debug: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
</code></pre>

<h2>5. Secrets</h2>
<p>
Never put secrets in code, config files, or git. Team projects should use
<strong>Vault / AWS Secrets Manager / GCP Secret Manager</strong>; personal projects
should at least use <code>.env</code> plus <code>.gitignore</code>.
</p>

<blockquote>
    <p>If a secret was ever committed, rotate it immediately and clean up the git history.</p>
</blockquote>

<h2>What I do in practice</h2>
<ol>
    <li>Small scripts: <code>os.environ</code> plus <code>.env</code>.</li>
    <li>Medium projects: <strong>Pydantic Settings</strong> plus <code>.env</code>.</li>
    <li>Training runs: <code>Hydra</code> or <code>OmegaConf</code> for composing configs.</li>
    <li>Deployment: <strong>12-factor</strong>, all configuration via environment variables, secrets handled by the cloud provider.</li>
</ol>"""

EN = {
    "2026-06-20-research-notes": RESEARCH_NOTES_EN,
    "2026-05-08-python-config": PYTHON_CONFIG_EN,
}

report = []
for post in data.get("posts", []):
    slug = post.get("slug")
    if slug in EN:
        post["contentEn"] = EN[slug]
        report.append({"slug": slug, "chars": len(EN[slug])})

DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"report": report}, ensure_ascii=False, indent=2))
