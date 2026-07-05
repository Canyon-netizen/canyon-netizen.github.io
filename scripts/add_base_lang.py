#!/usr/bin/env python3
"""给 en/* 页面 meta 加 baseLang 字段"""
import re
import os
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'

count = 0
for f in os.listdir(ROOT):
    p = os.path.join(ROOT, f, 'cv.html') if os.path.isdir(os.path.join(ROOT, f)) and f == 'en' else None
    if p is None:
        continue
    if not os.path.isfile(p):
        continue
    with open(p, encoding='utf-8') as fh:
        c = fh.read()
    if '"baseLang"' in c:
        continue
    new = re.sub(
        r'("basePath": "[^"]*",)',
        r'\1 "baseLang": "en/",',
        c, count=1
    )
    if new != c:
        with open(p, 'w', encoding='utf-8') as fh:
            fh.write(new)
        count += 1
        print(f'  added baseLang to {p}')

print(f'\nAdded baseLang to {count} files')
