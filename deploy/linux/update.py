#!/usr/bin/env python3
"""Publish static files only. Never execute code fetched from the repository."""
import argparse
import fcntl
import io
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request

PUBLIC_DIRS = {'assets', 'styles', 'src', 'games', 'data'}
PUBLIC_FILES = {'index.html', 'admin.html', 'robots.txt', 'favicon.ico'}
REQUIRED = ('index.html', 'admin.html', 'src/config.js', 'src/public/main.js',
            'games/robolab-arduino/index.html')


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=120)


def link_to(root, name, target):
    temporary = root / ('.' + name + '.tmp')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, root / name)


def validate(root):
    for name in REQUIRED:
        if not (root / name).is_file() or not (root / name).stat().st_size:
            raise ValueError('Archivo requerido ausente: ' + name)
    for file in root.rglob('*.json'):
        json.loads(file.read_text())


def extract(archive, destination):
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
        for entry in contents:
            path = PurePosixPath(entry.name)
            if path.is_absolute() or '..' in path.parts:
                raise ValueError('Ruta de archivo no válida')
            if not path.parts:
                continue
            if path.parts[0] not in PUBLIC_DIRS and entry.name not in PUBLIC_FILES:
                continue
            if entry.isdir():
                continue
            if not entry.isfile():
                raise ValueError('Solo se permiten archivos regulares: ' + entry.name)
            if any(part.startswith('.') for part in path.parts):
                raise ValueError('Archivo oculto no permitido')
            if path.suffix.lower() in {'.pem', '.key', '.sqlite', '.db', '.sql'}:
                raise ValueError('Archivo privado no permitido')
            total += entry.size
            if total > 200 * 1024 * 1024:
                raise ValueError('Publicación mayor de 200 MiB')
            target = destination.joinpath(*path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with contents.extractfile(entry) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)
            target.chmod(0o644)
    validate(destination)


def health(url, sha):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url + '/revision.txt', timeout=5) as response:
                assert response.read().decode().strip() == sha
            for path in ('/', '/admin', '/games/robolab-arduino/index.html'):
                with urllib.request.urlopen(url + path, timeout=5) as response:
                    assert response.status == 200 and response.read(1)
            return
        except Exception:
            if attempt == 4:
                raise RuntimeError('Falló la comprobación HTTP; se conserva la versión anterior')
            time.sleep(1)


def update(args):
    state, root = Path(args.state), Path(args.webroot)
    state.mkdir(parents=True, exist_ok=True)
    root.mkdir(parents=True, exist_ok=True)
    with (state / 'update.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = root / 'current'
        old = os.readlink(current) if current.is_symlink() else None
        if args.rollback:
            previous = root / 'previous'
            if not previous.is_symlink():
                raise ValueError('No hay una versión anterior')
            target = os.readlink(previous)
            sha = (root / target / 'revision.txt').read_text().strip()
        else:
            repo = state / 'repository.git'
            if not repo.exists():
                run('git', 'init', '--bare', str(repo))
                run('git', '--git-dir=' + str(repo), 'remote', 'add', 'origin', args.repo_url)
            git = ('git', '--git-dir=' + str(repo), '-c', 'core.hooksPath=/dev/null')
            run(*git, 'fetch', 'origin', '+refs/heads/main:refs/heads/main')
            sha = run(*git, 'rev-parse', 'refs/heads/main').decode().strip()
            target = 'releases/' + sha
            if old == target:
                print('Sin cambios: ' + sha)
                return
            releases = root / 'releases'
            releases.mkdir(exist_ok=True)
            destination = root / target
            if not destination.exists():
                stage = Path(tempfile.mkdtemp(prefix='.staging-', dir=releases))
                try:
                    extract(run(*git, 'archive', '--format=tar', sha), stage)
                    (stage / 'revision.txt').write_text(sha + '\n')
                    stage.chmod(0o755)
                    os.replace(stage, destination)
                finally:
                    if stage.exists():
                        shutil.rmtree(stage)
            validate(destination)
        link_to(root, 'current', target)
        try:
            if not args.prepare_only:
                health(args.health_url, sha)
        except Exception:
            if old:
                link_to(root, 'current', old)
            else:
                current.unlink(missing_ok=True)
            raise
        if old and old != target:
            link_to(root, 'previous', old)
        # Keep five most recent releases plus current and rollback target.
        protected = {target, old}
        releases = sorted((root / 'releases').iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
        for path in releases[5:]:
            if 'releases/' + path.name not in protected and path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
        print('Versión activa: ' + sha)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state', default='/var/lib/globalt-robotics')
    parser.add_argument('--webroot', default='/srv/globalt-robotics')
    parser.add_argument('--repo-url', default='https://github.com/compuforero-web/globalt-robotics.git')
    parser.add_argument('--health-url', default='http://127.0.0.1:8094')
    parser.add_argument('--prepare-only', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    update(parser.parse_args())
