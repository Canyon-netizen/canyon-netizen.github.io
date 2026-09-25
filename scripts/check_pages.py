import urllib.request
import re

for path in ['about.html', 'research.html', 'publications.html', 'projects.html', 'blog.html', 'books.html', 'hobbies.html']:
    for prefix in ['', 'en/']:
        url = f'http://localhost:8765/{prefix}{path}'
        try:
            page = urllib.request.urlopen(url, timeout=5).read().decode('utf-8')
            has_pr = 'page-renderer.js' in page
            has_pc = 'page-content' in page
            has_ds = 'data-section' in page
            print(f'{prefix}{path}: page-renderer={has_pr} page-content={has_pc} data-section={has_ds}')
        except Exception as e:
            print(f'{prefix}{path}: ERR {e}')
