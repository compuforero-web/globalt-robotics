"""Static checks; no third-party dependencies."""
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
count = 0
for source in [*root.rglob('*.js'), *root.rglob('*.mjs')]:
    subprocess.run(['node', '--check', str(source)], check=True)
    count += 1
    text = source.read_text()
    for name in re.findall(r'''(?:from\s*|import\s*)['"](\.[^'"]+)['"]''', text):
        assert (source.parent / name.split('?')[0]).is_file(), (source, name)
for source in root.rglob('*.json'):
    json.loads(source.read_text())
for source in root.rglob('*.html'):
    for name in re.findall(r'''(?:src|href)=["']([^"']+)["']''', source.read_text()):
        if name.startswith(('#', 'http:', 'https:', 'mailto:', 'tel:', 'data:', 'about:')):
            continue
        name = name.split('#')[0].split('?')[0]
        if name in ('/admin', '/admin/'):
            name = '/admin.html'
        if not name:
            continue
        target = root / name.lstrip('/') if name.startswith('/') else source.parent / name
        assert target.exists(), (source, name)
print(f'OK: sintaxis de {count} módulos, imports locales, enlaces HTML y JSON')
