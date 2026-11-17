#!/usr/bin/env bash
# Ensayo con Docker real de deploy/linux/compilador-produccion.sh en una réplica local de producción.
# NO es para el servidor: crea contenedores y carpetas propios con el prefijo «globalt-ensayo» y los retira al terminar.
#
#   sudo bash tests/docker/ensayo-compilador.sh <commit candidato> <commit de la versión actual>
#
# Réplica: compilador de <commit actual> con las mismas opciones que deploy/linux/install-lab-preview.sh (sin red, solo
# lectura, 10001:<grupo nginx>, socket 660 en carpeta 770), un consumidor tipo API del aula (Python, group_add, carpeta
# del socket en solo lectura) y un laboratorio privado (nginx con deploy/linux/nginx-lab-preview.conf, 127.0.0.1:18097).
# Recorrido: comprobar → preparar → ensayar → promoción rechazada por imagen cambiada → promoción con fallo simulado
# (vuelta automática) → promoción real midiendo la interrupción → recuperar → promoción de nuevo → candidato roto que el
# ensayo detiene sin tocar producción. Cada paso comprueba el estado real con docker inspect y por los sockets.
# Variables: ENSAYO_CONSERVAR=1 deja la réplica en marcha para revisarla.
set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecuta como root (Docker y carpetas 10001:<grupo>).'; exit 1; }
REV=${1:?commit candidato}; BASE=${2:?commit de la versión actual}
ORIGEN=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
P=globalt-ensayo
W=/var/tmp/$P
NGINX_IMG=nginx:1.27-alpine
GID=101                      # grupo nginx de la imagen (en producción: el de globalt-robotics-web)
export GLOBALT_ENSAYO_CONTENEDOR=$P-compiler GLOBALT_ENSAYO_SOCKETS=$W/run GLOBALT_ENSAYO_ESTADO=$W/estado GLOBALT_ENSAYO_IMAGEN=$P-compilador
C=$GLOBALT_ENSAYO_CONTENEDOR; S=$GLOBALT_ENSAYO_SOCKETS; I=$GLOBALT_ENSAYO_IMAGEN
OK=0; MAL=0
nota() { printf '\n######## %s\n' "$*"; }
afirma() { local d=$1; shift; if "$@"; then echo "  ✔ $d"; OK=$((OK + 1)); else echo "  ✘ $d"; MAL=$((MAL + 1)); fi; }
salud() { curl -fsS --max-time 5 --unix-socket "$S/compilador.sock" http://localhost/api/arduino/salud; }
imagen() { docker inspect -f '{{.Image}}' "$C" 2>/dev/null; }
iid() { docker image inspect -f '{{.Id}}' "$1"; }
con_servo() { salud | grep -q '"servo": "Servo 1.3.0'; }
sin_servo() { salud | grep -q '"ok": true' && ! salud | grep -q '"servo"'; }
aula() { docker exec $P-aula python3 -c 'import socket,sys
s=socket.socket(socket.AF_UNIX);s.settimeout(5);s.connect("/compilador/compilador.sock")
s.sendall(b"GET /api/arduino/salud HTTP/1.0\r\n\r\n");d=s.recv(4096)
print(d.split(b" ")[1].decode())'; }
lab() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:18097/api/arduino/salud; }
lab_compila() {   # $1 programa de tests/fixtures/laboratorio → compila por el proxy nginx y compara el HEX
  python3 - "$REPO/tests/fixtures/laboratorio/$1" <<'PY'
import json, sys, urllib.request
ino = open(sys.argv[1] + '.ino').read(); hexf = open(sys.argv[1] + '.hex').read()
req = urllib.request.Request('http://127.0.0.1:18097/api/arduino/compilar', data=json.dumps({'placa': 'nano', 'codigo': ino}).encode(),
                             headers={'Content-Type': 'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=40))
sys.exit(0 if r.get('ok') and r.get('hex') == hexf else 1)
PY
}
herramienta() { (cd "$REPO" && PATH="$W/bin:$PATH" bash deploy/linux/compilador-produccion.sh "$@"); }

limpiar() {
  docker ps -aq --filter "name=^$P-" | xargs -r docker rm -f >/dev/null
  rm -rf "$W"
}
if [[ ${ENSAYO_CONSERVAR:-0} != 1 ]]; then trap limpiar EXIT; fi
limpiar
install -d -m 755 "$W" "$W/bin"
# En el entorno de desarrollo, docker build necesita la CA del proxy (ver tests/docker/docker-ensayo). En el servidor no.
if [[ -f /root/.ccr/ca-bundle.crt ]]; then ln -s "$ORIGEN/tests/docker/docker-ensayo" "$W/bin/docker"; fi

nota "Réplica de producción con la versión actual ($BASE)"
REPO=$W/repo
git clone -q "$ORIGEN" "$REPO"
git -C "$REPO" checkout -q "$REV"
mkdir -p "$W/base"
git -C "$REPO" archive "$BASE" services/compilador-arduino | tar -x -C "$W/base"
PATH="$W/bin:$PATH" docker build -q -t "$I:base" "$W/base/services/compilador-arduino" >/dev/null
install -d -o 10001 -g $GID -m 770 "$S"
docker run -d --name "$C" --restart unless-stopped --init --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 64 --memory 768m --memory-swap 768m --cpus 1 \
  --ulimit nofile=256:256 --tmpfs /tmp:size=64m,mode=1777,noexec,nosuid,nodev \
  --user 10001:$GID --log-opt max-size=5m --log-opt max-file=2 \
  --env COMPILADOR_SOCKET=/run/compilador/compilador.sock --env COMPILADOR_SIMULTANEOS=1 --env COMPILADOR_ESPERA=5 \
  --mount type=bind,src="$S",dst=/run/compilador "$I:base" >/dev/null
docker run -d --name $P-aula --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --user 10002:10002 --group-add $GID --mount type=bind,src="$S",dst=/compilador,readonly \
  "$I:base" python3 -c 'import time; time.sleep(10**9)' >/dev/null
install -d -m 755 "$W/web"; echo 'laboratorio de ensayo' > "$W/web/index.html"
docker run -d --name $P-lab --read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp --publish 127.0.0.1:18097:80 \
  --mount type=bind,src="$W/web",dst=/srv/lab,readonly --mount type=bind,src="$S",dst=/compiler-socket,readonly \
  --mount type=bind,src="$REPO/deploy/linux/nginx-lab-preview.conf",dst=/etc/nginx/conf.d/default.conf,readonly "$NGINX_IMG" >/dev/null
for _ in $(seq 1 30); do salud >/dev/null 2>&1 && break; sleep 1; done
BASE_ID=$(iid "$I:base")
afirma 'compilador actual sano y sin Servo' sin_servo
afirma 'consumidor API ve 200 por su montaje' test "$(aula)" = 200
afirma 'laboratorio nginx ve 200 por el proxy' test "$(lab)" = 200
afirma 'laboratorio compila el LED con HEX idéntico' lab_compila solucion

nota 'comprobar (solo lectura)'
herramienta comprobar | tail -12
afirma 'comprobar no cambia nada' test "$(imagen)" = "$BASE_ID"

nota "preparar $REV"
herramienta preparar "$REV" | tail -8
afirma 'la imagen actual queda etiquetada como respaldo' sh -c "docker images '$I' --format '{{.Tag}}' | grep -q '^respaldo-'"
afirma 'producción sin cambios tras preparar' test "$(imagen)" = "$BASE_ID"

nota "ensayar $REV (candidato con socket propio)"
herramienta ensayar "$REV" | tail -25
afirma 'el candidato se retiró' sh -c "! docker container inspect '$C-candidato' >/dev/null 2>&1"
afirma 'producción sin cambios tras ensayar' test "$(imagen)" = "$BASE_ID"
afirma 'producción sigue sin Servo y sana' sin_servo

nota 'promover con la imagen cambiada después del ensayo (debe negarse)'
docker image tag "$I:$REV" "$I:guardada"
docker image tag "$I:base" "$I:$REV"
if herramienta promover "$REV" > "$W/p0.log" 2>&1; then r=0; else r=$?; fi
tail -2 "$W/p0.log"
afirma 'se niega a promover' test "$r" != 0
afirma 'mensaje: la imagen cambió desde el ensayo' grep -q 'cambió desde el ensayo' "$W/p0.log"
docker image tag "$I:guardada" "$I:$REV"; docker rmi "$I:guardada" >/dev/null
afirma 'producción intacta' test "$(imagen)" = "$BASE_ID"

nota 'promover con un fallo simulado después del cambio (vuelta automática)'
if GLOBALT_ENSAYO_FALLO=tras-cambio herramienta promover "$REV" > "$W/p1.log" 2>&1; then r=0; else r=$?; fi
grep -E 'Fallo simulado|RESTAURADO|ATENCIÓN|antes|ahora' "$W/p1.log" | tail -8
afirma 'promover termina con error' test "$r" != 0
afirma 'vuelve a la imagen anterior' test "$(imagen)" = "$BASE_ID"
afirma 'compilador anterior sano y sin Servo' sin_servo
afirma 'API y laboratorio vuelven a ver 200' test "$(aula)$(lab)" = 200200
afirma 'el laboratorio compila con el compilador anterior' lab_compila semaforo-solucion
afirma 'no queda ningún contenedor «anterior» suelto' sh -c "test -z \"\$(docker ps -aq --filter name=^$C-anterior)\""

nota 'promover (real), midiendo la interrupción desde el laboratorio'
( fallos=0; total=0; while [[ ! -f $W/fin-medida ]]; do total=$((total + 1)); [[ $(lab) == 200 ]] || fallos=$((fallos + 1)); sleep 0.2; done
  echo "$fallos $total" > "$W/medida" ) &
herramienta promover "$REV" | tail -14
touch "$W/fin-medida"; wait
read -r f t < "$W/medida"
echo "  Peticiones de salud al laboratorio cada 0,2 s durante «promover»: $f fallidas de $t (≈ $(python3 -c "print(round($f*0.2,1))") s sin servicio)."
NEW_ID=$(iid "$I:$REV")
afirma 'producción usa la imagen nueva' test "$(imagen)" = "$NEW_ID"
afirma 'la salud identifica Servo 1.3.0' con_servo
afirma 'API y laboratorio ven 200' test "$(aula)$(lab)" = 200200
afirma 'el laboratorio compila Servo (lección 12) con HEX idéntico' lab_compila pos-solucion
afirma 'el laboratorio compila una lección anterior con HEX idéntico' lab_compila dos-solucion
afirma 'socket 10001:101 660 en carpeta 770' test "$(stat -c '%u:%g %a' "$S/compilador.sock") $(stat -c '%a' "$S")" = '10001:101 660 770'
afirma 'mismo aislamiento (sin red, solo lectura, sin puertos)' test "$(docker inspect -f '{{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}} {{len .HostConfig.PortBindings}} {{.HostConfig.RestartPolicy.Name}}' "$C")" = 'none true 0 unless-stopped'
afirma 'variables del contenedor conservadas' sh -c "docker inspect -f '{{json .Config.Env}}' '$C' | grep -q 'COMPILADOR_SIMULTANEOS=1'"
afirma 'contenedor anterior conservado y detenido' sh -c "docker ps -a --filter name=^$C-anterior --format '{{.Status}} {{.Image}}' | grep -q '^Exited'"

nota 'recuperar (vuelta a la versión anterior)'
herramienta recuperar | tail -8
afirma 'producción vuelve a la imagen anterior' test "$(imagen)" = "$BASE_ID"
afirma 'compilador anterior sano y sin Servo' sin_servo
afirma 'API y laboratorio ven 200' test "$(aula)$(lab)" = 200200
afirma 'la versión nueva queda retirada y conservada' sh -c "docker ps -a --filter name=^$C-retirado --format '{{.Status}}' | grep -q '^Exited'"

nota 'promover otra vez tras recuperar'
herramienta promover "$REV" | tail -5
afirma 'producción con Servo de nuevo' con_servo
afirma 'API y laboratorio ven 200' test "$(aula)$(lab)" = 200200

nota 'candidato roto: el ensayo lo detiene sin tocar producción'
git -C "$REPO" -c user.name=ensayo -c user.email=ensayo@example.invalid checkout -q -b ensayo-roto "$REV"
printf '\nraise SystemExit("roto a propósito")\n' >> "$REPO/services/compilador-arduino/server.py"
git -C "$REPO" -c user.name=ensayo -c user.email=ensayo@example.invalid commit -qam 'Compilador roto (ensayo)'
ROTO=$(git -C "$REPO" rev-parse HEAD)
ACTUAL=$(imagen)
herramienta preparar "$ROTO" > "$W/roto-p.log" 2>&1 || true
if herramienta ensayar "$ROTO" > "$W/roto-e.log" 2>&1; then r=0; else r=$?; fi
grep -E 'FAIL|Error|ERROR|Candidato retirado' "$W/roto-e.log" | tail -4
afirma 'el ensayo del candidato roto falla' test "$r" != 0
afirma 'no se registra ensayo superado' test ! -f "$W/estado/ensayo-$ROTO.ok"
if herramienta promover "$ROTO" > "$W/roto-pr.log" 2>&1; then r=0; else r=$?; fi
afirma 'promover se niega sin ensayo superado' test "$r" != 0
afirma 'producción intacta y sana' sh -c "test '$(imagen)' = '$ACTUAL' && curl -fsS --unix-socket '$S/compilador.sock' http://localhost/api/arduino/salud | grep -q Servo"
afirma 'sin candidato residual' sh -c "! docker container inspect '$C-candidato' >/dev/null 2>&1"

printf '\nRESULTADO DEL ENSAYO: %d comprobaciones superadas, %d fallidas.\n' "$OK" "$MAL"
[[ $MAL == 0 ]]
