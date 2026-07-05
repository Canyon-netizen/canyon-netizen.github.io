#!/usr/bin/env python3
"""给所有页面 meta 加 htmlLang 字段"""
import re
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'

files = []
for root, _, fnames in os.walk(ROOT):
    if '.git' in root or 'partials' in root or 'scripts' in root: continue
    for fn in fnames:
        if fn.endswith('.html'):
            files.append(os.path.join(root, fn))

def html_lang_for(path):
    p = path.replace('\\', '/')
    if p.startswith('en/') or p.startswith('./en/'):
        return 'en'
    return 'zh-CN'

count_added = 0
for f in files:
    with open(f, encoding='utf-8') as fh:
        c = fh.read()
    if '"htmlLang"' in c:
        continue
    val = '"' + html_lang_for(f) + '"'
    new = re.sub(
        r'(window\.__PAGE_META__ = \{[^\n,]+,)',
        r'\1 "htmlLang": ' + val + ',',
        c, count=1
    )
    if new != c:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(new)
        count_added += 1
        print(f'  added {val:8s} to {f}')

print(f'\nAdded htmlLang to {count_added} files')
