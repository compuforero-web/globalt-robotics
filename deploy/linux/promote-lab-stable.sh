#!/usr/bin/env bash
# Conecta el compilador probado a la web privada estable. No abre su API pública.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -eq 0 ]] || { echo 'Ejecuta con sudo bash deploy/linux/promote-lab-stable.sh'; exit 1; }
for tool in docker curl ss install runuser python3; do command -v "$tool" >/dev/null || { echo "Falta: $tool"; exit 1; }; done
REPO=$(cd ../.. && pwd)
SOCKET_DIR=/var/lib/globalt-robotics-lab/run
BACKUP=globalt-robotics-web-before-lab
STATE=/etc/globalt-robotics/stable-lab
ORIGINAL=globalt-robotics-web
CANDIDATE=globalt-robotics-stable-candidate
docker info >/dev/null
if [[ -f "$STATE/installed" ]]; then
  if curl -fsS --max-time 5 http://127.0.0.1:8094/api/arduino/salud; then
    printf '\nLa conexión estable ya está instalada.\n'; exit 0
  fi
  echo 'Existe una instalación estable que necesita diagnóstico; se conserva.'; exit 1
fi
[[ -S "$SOCKET_DIR/compilador.sock" ]] || { echo 'No existe el socket del compilador privado.'; exit 1; }
curl -fsS --max-time 5 --unix-socket "$SOCKET_DIR/compilador.sock" http://localhost/api/arduino/salud
printf '\n'
IMAGE=$(docker container inspect "$ORIGINAL" --format '{{.Image}}')
for name in "$BACKUP" "$CANDIDATE"; do
  if docker container inspect "$name" >/dev/null 2>&1; then echo "Ya existe $name; se conserva para revisar."; exit 1; fi
done
if ss -H -ltn 'sport = :8098' | read -r _; then echo 'Puerto temporal 8098 ocupado.'; exit 1; fi
[[ -f "$REPO/games/laboratorio-arduino/index.html" ]] || { echo 'Actualiza main con git pull antes de continuar.'; exit 1; }
# Reutiliza el publicador existente: mantiene su bloqueo, validación y rollback de archivos.
runuser -u globalt-robotics -- python3 /usr/local/lib/globalt-robotics/update.py
[[ -f /srv/globalt-robotics/current/games/laboratorio-arduino/index.html ]] || { echo 'La copia operativa todavía no contiene el laboratorio.'; exit 1; }
install -d -m 700 "$STATE"
docker inspect "$ORIGINAL" > "$STATE/before-container.json"
install -m 644 nginx-stable-lab.conf "$STATE/nginx.conf"
# El archivo montado debe poder leerse dentro del contenedor; el directorio del host queda privado.
OPTIONS=(--read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp
  --mount type=bind,src=/srv/globalt-robotics,dst=/srv/globalt-robotics,readonly
  --mount type=bind,src="$SOCKET_DIR",dst=/compiler-socket,readonly
  --mount type=bind,src="$STATE/nginx.conf",dst=/etc/nginx/conf.d/default.conf,readonly)
RUNTIME=(--restart unless-stopped --memory 128m --cpus .5 --pids-limit 100
  --log-opt max-size=5m --log-opt max-file=2)
docker run --rm --network none "${OPTIONS[@]}" "$IMAGE" nginx -t
candidate_created=false
old_stopped=false
old_renamed=false
rollback() {
  status=$?
  trap - ERR
  set +e
  echo "Promoción interrumpida (salida $status). Diagnóstico:"
  if [[ "$old_renamed" == true ]]; then
    docker logs --tail 20 "$ORIGINAL" 2>&1
    docker rm -f "$ORIGINAL" >/dev/null 2>&1
    docker rename "$BACKUP" "$ORIGINAL"
    docker start "$ORIGINAL"
  elif [[ "$old_stopped" == true ]]; then
    docker start "$ORIGINAL"
  fi
  if [[ "$candidate_created" == true ]]; then
    docker logs --tail 20 "$CANDIDATE" 2>&1
    docker rm -f "$CANDIDATE" >/dev/null 2>&1
  fi
  echo 'La entrada pública y el compilador se conservaron. Comprueba la restauración privada en 8094.'
  exit "$status"
}
trap rollback ERR
wait_for_health() {
  local port="$1" attempt
  for attempt in {1..20}; do
    if curl -fsS --max-time 3 "http://127.0.0.1:$port/api/arduino/salud" > "$STATE/health.json" 2> "$STATE/health.err"; then
      cat "$STATE/health.json"; printf '\n'; return 0
    fi
    sleep 1
  done
  cat "$STATE/health.err" >&2
  return 1
}
smoke_test() {
  python3 - "$REPO" "$1" <<'PY'
import json,sys,urllib.request
from pathlib import Path
base='http://127.0.0.1:'+sys.argv[2]
for path in ('/','/admin','/games/laboratorio-arduino/index.html'):
 with urllib.request.urlopen(base+path,timeout=10) as r:assert r.status==200 and r.read(1)
code=(Path(sys.argv[1])/'tests/fixtures/laboratorio/solucion.ino').read_text()
req=urllib.request.Request(base+'/api/arduino/compilar',data=json.dumps({'placa':'nano','codigo':code}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(req,timeout=40) as r:result=json.load(r)
assert result.get('ok') is True and result.get('hex','').startswith(':'),result
print('Portada, administración, laboratorio y compilación real: OK')
PY
}
# Comprueba la configuración nueva en un puerto local antes de cambiar la entrada estable.
docker run -d --name "$CANDIDATE" "${RUNTIME[@]}" --publish 127.0.0.1:8098:80 "${OPTIONS[@]}" "$IMAGE"
candidate_created=true
wait_for_health 8098
smoke_test 8098
# Verifica que la entrada pública mantiene el bloqueo del compilador.
public_status=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8096/api/arduino/salud)
[[ "$public_status" == 403 ]] || { echo "La API pública respondió $public_status; se requiere revisar su bloqueo."; false; }
docker stop --time 10 "$ORIGINAL"
old_stopped=true
docker rename "$ORIGINAL" "$BACKUP"
old_renamed=true
docker run -d --name "$ORIGINAL" "${RUNTIME[@]}" \
  --publish 127.0.0.1:8094:80 --publish 100.117.79.42:8094:80 "${OPTIONS[@]}" "$IMAGE"
wait_for_health 8094
smoke_test 8094
# La API pública debe seguir bloqueada después del cambio.
public_status=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8096/api/arduino/salud)
[[ "$public_status" == 403 ]] || { echo 'El bloqueo público no coincide con lo esperado.'; false; }
printf 'Compilador privado estable instalado\n' > "$STATE/installed"
# La promoción ya está comprobada; conservar la versión anterior detenida como recuperación.
trap - ERR
if ! docker rm -f "$CANDIDATE" >/dev/null; then echo 'Aviso: quedó la copia temporal local 8098; puede retirarse después.'; fi
printf '\nLaboratorio estable: http://100.117.79.42:8094/games/laboratorio-arduino/index.html\n'
printf 'Compilador público bloqueado. Copia de recuperación: %s\n' "$BACKUP"
printf 'El piloto de 8097 sigue disponible; no se modificaron otros proyectos.\n'
