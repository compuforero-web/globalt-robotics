#!/usr/bin/env bash
# Prueba privada del commit revisado de PR #1. No fusiona ni modifica la web pública.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -eq 0 && -n "${SUDO_USER:-}" && "$SUDO_USER" != root ]] || {
  echo 'Ejecuta con sudo desde la cuenta edwin: sudo bash deploy/linux/install-lab-preview.sh'; exit 1;
}
for tool in docker git python3 curl ss ip install runuser; do command -v "$tool" >/dev/null || { echo "Falta: $tool"; exit 1; }; done
REVIEWED_SHA=e8234be551585c4ba80015d3794a4676d546c144
REPO=$(cd ../.. && pwd)
STATE=/var/lib/globalt-robotics-lab
SOURCE="$STATE/source-$REVIEWED_SHA"
WEBROOT="$STATE/web-$REVIEWED_SHA"
SOCKET_DIR="$STATE/run"
docker info >/dev/null
for name in globalt-arduino-compiler globalt-arduino-preview; do
  if docker container inspect "$name" >/dev/null 2>&1; then
    echo "Ya existe $name. No se reemplazó; revisaremos su estado."; exit 1
  fi
done
if ss -H -ltn 'sport = :8097' | read -r _; then echo 'Puerto 8097 ocupado. No se cambió ningún servicio.'; exit 1; fi
ip -4 -o addr show | python3 -c 'import sys; sys.exit(0 if any("100.117.79.42/" in s for s in sys.stdin) else 1)' || {
  echo 'No aparece la IP NetBird esperada.'; exit 1;
}
NGINX_IMAGE=$(docker container inspect globalt-robotics-web --format '{{.Image}}')
NGINX_GID=$(docker exec globalt-robotics-web id -g nginx)
[[ "$NGINX_GID" =~ ^[0-9]+$ ]] || { echo 'No se pudo identificar el grupo de Nginx.'; exit 1; }
# Descarga la rama sin cambiar de rama ni escribir Git como root.
runuser -u "$SUDO_USER" -- git -C "$REPO" fetch origin feature/laboratorio-arduino
FETCHED=$(git -C "$REPO" rev-parse FETCH_HEAD)
[[ "$FETCHED" == "$REVIEWED_SHA" ]] || { echo 'La PR cambió desde la revisión. Se requiere revisar el nuevo commit antes de instalar.'; exit 1; }
install -d -m 755 "$STATE" /etc/globalt-robotics-lab
# Exportación del commit revisado. No ejecuta scripts de la rama en el host.
python3 - "$REPO" "$REVIEWED_SHA" "$SOURCE" "$WEBROOT" <<'PY'
from pathlib import Path, PurePosixPath
import io, shutil, subprocess, sys, tarfile, tempfile
repo, sha, source, webroot = sys.argv[1:]
source, webroot = Path(source), Path(webroot)
marker = source/'.reviewed-commit'
if source.is_dir() and webroot.is_dir() and marker.is_file() and marker.read_text().strip() == sha:
    print('Reutilizando exportación del mismo commit revisado.')
    raise SystemExit(0)
for destination in (source, webroot):
    if destination.exists():
        raise SystemExit('Ya existe una exportación incompleta; se conserva para revisar: ' + str(destination))
archive = subprocess.check_output(['git','-C',repo,'archive',sha])
stage = Path(tempfile.mkdtemp(dir=source.parent, prefix='.export-'))
try:
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar:
            p = PurePosixPath(member.name)
            if p.is_absolute() or '..' in p.parts or not (member.isdir() or member.isfile()):
                raise SystemExit('Archivo no permitido en la exportación')
            total += member.size
            if total > 20*1024*1024:
                raise SystemExit('Exportación de prueba demasiado grande')
        tar.extractall(stage, filter='data')
    stage.chmod(0o755)
    stage.rename(source)
    webroot.mkdir(mode=0o755)
    for name in ('assets','styles','src','games','data'):
        shutil.copytree(source/name, webroot/name)
    for name in ('index.html','robots.txt'):
        shutil.copyfile(source/name, webroot/name)
    (webroot/'revision.txt').write_text(sha+'\n')
    marker.write_text(sha+'\n')
finally:
    if stage.exists(): shutil.rmtree(stage)
PY
IMAGE="globalt-compilador-arduino:$REVIEWED_SHA"
printf '\nConstruyendo compilador aislado. Puede tardar varios minutos.\n'
docker build -t "$IMAGE" "$SOURCE/services/compilador-arduino"
LIMITS=(--init --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true
  --pids-limit 64 --memory 768m --memory-swap 768m --cpus 1
  --ulimit nofile=256:256 --tmpfs /tmp:size=64m,mode=1777,noexec,nosuid,nodev)
printf '\nEjecutando pruebas del servicio con el compilador real.\n'
docker run --rm "${LIMITS[@]}" --user 10001:10001 \
  --mount type=bind,src="$SOURCE",dst=/workspace,readonly --workdir /workspace \
  "$IMAGE" python3 -m unittest discover -s tests -p test_laboratorio.py -k CompilerServiceTests -v
# Completa la comprobación de tamaño de archivo en el mismo entorno aislado.
docker run --rm "${LIMITS[@]}" --user 10001:10001 "$IMAGE" python3 -c '
import importlib.util,tempfile
from pathlib import Path
s=importlib.util.spec_from_file_location("compiler","/opt/compilador/server.py")
m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)
 code,out=m.ejecutar(["python3","-c","open(\"limit-test\",\"wb\").write(b\"x\"*(17*1024*1024))"],p,5)
 assert code!=0 and (p/"limit-test").stat().st_size==16*1024*1024,(code,out)
print("Limite de archivo de 16 MiB: OK")'
install -d -o 10001 -g "$NGINX_GID" -m 770 "$SOCKET_DIR"
install -m 644 nginx-lab-preview.conf /etc/globalt-robotics-lab/nginx.conf
WEB_OPTIONS=(--read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp
  --mount type=bind,src="$WEBROOT",dst=/srv/lab,readonly
  --mount type=bind,src="$SOCKET_DIR",dst=/compiler-socket,readonly
  --mount type=bind,src=/etc/globalt-robotics-lab/nginx.conf,dst=/etc/nginx/conf.d/default.conf,readonly)
docker run --rm --network none "${WEB_OPTIONS[@]}" "$NGINX_IMAGE" nginx -t
compiler_created=false
preview_created=false
cleanup() {
  status=$?
  trap - ERR
  set +e
  echo "Diagnóstico de la prueba (salida $status):"
  if [[ "$preview_created" == true ]]; then
    docker logs --tail 25 globalt-arduino-preview 2>&1
    docker exec globalt-arduino-preview sh -c 'id nginx; ls -ld /compiler-socket; ls -l /compiler-socket/compilador.sock' 2>&1
  fi
  if [[ "$compiler_created" == true ]]; then docker logs --tail 15 globalt-arduino-compiler 2>&1; fi
  if [[ "$preview_created" == true ]]; then docker rm -f globalt-arduino-preview >/dev/null 2>&1 || true; fi
  if [[ "$compiler_created" == true ]]; then docker rm -f globalt-arduino-compiler >/dev/null 2>&1 || true; fi
  echo 'Prueba interrumpida; la plataforma pública y sus contenedores no se cambiaron.'
  exit "$status"
}
trap cleanup ERR
docker run -d --name globalt-arduino-compiler --restart unless-stopped \
  "${LIMITS[@]}" --user "10001:$NGINX_GID" --log-opt max-size=5m --log-opt max-file=2 \
  --env COMPILADOR_SOCKET=/run/compilador/compilador.sock \
  --env COMPILADOR_SIMULTANEOS=1 --env COMPILADOR_ESPERA=5 \
  --mount type=bind,src="$SOCKET_DIR",dst=/run/compilador "$IMAGE"
compiler_created=true
for attempt in {1..20}; do [[ -S "$SOCKET_DIR/compilador.sock" ]] && break; sleep 1; done
curl -fsS --max-time 10 --unix-socket "$SOCKET_DIR/compilador.sock" http://localhost/api/arduino/salud
printf '\n'
docker run -d --name globalt-arduino-preview --restart unless-stopped \
  --memory 64m --cpus .25 --pids-limit 64 --log-opt max-size=5m --log-opt max-file=2 \
  --publish 127.0.0.1:8097:80 --publish 100.117.79.42:8097:80 \
  "${WEB_OPTIONS[@]}" "$NGINX_IMAGE"
preview_created=true
# El socket se monta fuera de /run: /var/run puede ser un enlace a /run en la imagen.
docker exec globalt-arduino-preview test -S /compiler-socket/compilador.sock
healthy=false
for attempt in {1..15}; do
  if curl -fsS --max-time 3 http://127.0.0.1:8097/api/arduino/salud; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then echo 'El proxy no alcanzó al compilador. Se detiene la prueba.'; false; fi
curl -fsS http://127.0.0.1:8097/games/laboratorio-arduino/index.html >/dev/null
# Comprueba compilación y diagnósticos por el proxy real, sin evaluar C++ en el host.
python3 - "$SOURCE" <<'PY'
import json, sys, urllib.request
from pathlib import Path
url='http://127.0.0.1:8097/api/arduino/compilar'
for code, expected in [((Path(sys.argv[1])/'tests/fixtures/laboratorio/solucion.ino').read_text(), True),
                       ('void setup(){ pinMode(13, OUTPUT) }\nvoid loop(){}', False)]:
 req=urllib.request.Request(url,data=json.dumps({'placa':'nano','codigo':code}).encode(),headers={'Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=40) as r: data=json.load(r)
 assert data['ok'] is expected,data
 if expected: assert data.get('hex','').startswith(':')
 else: assert any(d.get('tipo')=='error' for d in data.get('diagnosticos',[]))
print('\nCompilacion real y diagnosticos por proxy: OK')
PY
compiler_created=false
preview_created=false
trap - ERR
printf '\nLaboratorio privado listo: http://100.117.79.42:8097/games/laboratorio-arduino/index.html\n'
printf 'Commit probado: %s\n' "$REVIEWED_SHA"
printf 'La PR sigue sin fusionar y el dominio publico conserva la version anterior.\n'
