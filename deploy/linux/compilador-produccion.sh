#!/usr/bin/env bash
# Compilador Arduino de GLOBALT (contenedor globalt-arduino-compiler): nueva versión por etapas y con vuelta atrás.
#
#   sudo bash deploy/linux/compilador-produccion.sh comprobar             # solo lectura: contenedor, socket, salud y consumidores
#   sudo bash deploy/linux/compilador-produccion.sh preparar  <commit>    # exporta el commit y construye la imagen candidata
#   sudo bash deploy/linux/compilador-produccion.sh ensayar   <commit>    # candidato temporal con SOCKET PROPIO y pruebas; se retira solo
#   sudo bash deploy/linux/compilador-produccion.sh promover  <commit>    # sustituye el contenedor; ante un fallo vuelve solo al anterior
#   sudo bash deploy/linux/compilador-produccion.sh recuperar             # vuelve a la versión que guardó el último «promover»
#
# Ejecutar desde una copia del repositorio en el commit indicado (el script se compara con el del commit).
# Conserva usuario, grupo, permisos y ruta del socket, límites y aislamiento del contenedor actual: los lee de
# `docker inspect` y aborta ante cualquier diferencia no contemplada. Nunca publica puertos, nunca monta el socket de
# Docker, nunca borra imágenes, contenedores anteriores ni volúmenes, y no toca la API del aula, la web ni PostgreSQL.
# Ver docs/ACTUALIZACION_LECCIONES_12_13.md.
set -Eeuo pipefail
umask 077
export LC_ALL=C

# Valores de producción. Las variables GLOBALT_ENSAYO_* solo existen para el ensayo local con Docker
# (tests/docker/ensayo-compilador.sh); en el servidor no deben definirse.
COMP_C=${GLOBALT_ENSAYO_CONTENEDOR:-globalt-arduino-compiler}
SOCKET_DIR=${GLOBALT_ENSAYO_SOCKETS:-/var/lib/globalt-robotics-lab/run}
STATE=${GLOBALT_ENSAYO_ESTADO:-/var/lib/globalt-robotics-lab/compilador}
IMG=${GLOBALT_ENSAYO_IMAGEN:-globalt-compilador-arduino}
ENSAYO=$([[ -n ${GLOBALT_ENSAYO_CONTENEDOR:-}${GLOBALT_ENSAYO_SOCKETS:-}${GLOBALT_ENSAYO_ESTADO:-}${GLOBALT_ENSAYO_IMAGEN:-} ]] && echo 1 || echo 0)
CAND_C=$COMP_C-candidato
CAND_DIR=$STATE/candidato-run
SOCKET_DST=/run/compilador
SERVO_COMMIT=2862ad9864d0dda5669b264857deafbba624940d
PARADA_S=30   # docker stop: el servicio nuevo termina las compilaciones en curso (≤ 25 s) antes de salir

falla() { echo "ERROR: $*" >&2; exit 1; }
error() { echo "ERROR: $*" >&2; return 1; }   # tras iniciar un cambio: devuelve fallo para activar la vuelta atrás (trap ERR)
paso() { printf '\n== %s\n' "$*"; }
[[ $EUID -eq 0 ]] || falla 'Ejecuta con sudo bash.'
ORDEN=${1:-}; shift || true
REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SELF=$(readlink -f -- "${BASH_SOURCE[0]}")
GIT=(git -c safe.directory="$REPO" -C "$REPO")
for t in docker git python3 curl flock stat install cmp; do command -v "$t" >/dev/null || falla "Falta $t"; done
docker info >/dev/null 2>&1 || falla 'Docker no responde.'
[[ $ENSAYO == 1 ]] && echo "MODO ENSAYO: contenedor $COMP_C, sockets $SOCKET_DIR, estado $STATE, imagen $IMG"

iniciar_registro() {
  install -d -m 700 "$STATE" "$STATE/registros" "$STATE/versiones" "$STATE/fuentes"
  exec 9>"$STATE/.bloqueo"
  flock -n 9 || falla 'Ya hay otra operación del compilador en curso.'
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  LOG="$STATE/registros/$ORDEN-$TS.log"
  exec > >(tee -a "$LOG") 2>&1
  echo "Compilador · $ORDEN · $TS"
}

verificar_commit() {   # $1 commit
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || falla 'Indica el commit completo (40 caracteres hexadecimales).'
  "${GIT[@]}" cat-file -e "$1^{commit}" 2>/dev/null || falla "El commit $1 no está en $REPO (ejecuta git fetch)."
  "${GIT[@]}" show "$1:deploy/linux/compilador-produccion.sh" | cmp -s - "$SELF" \
    || falla 'Este script no coincide con el del commit indicado. Ejecuta la copia de ese mismo commit.'
  for f in services/compilador-arduino/Dockerfile services/compilador-arduino/server.py services/compilador-arduino/build-core.sh \
           services/compilador-arduino/build-servo.sh deploy/linux/compilador-prueba.py tests/test_laboratorio.py \
           tests/fixtures/laboratorio/pos-solucion.hex; do
    "${GIT[@]}" cat-file -e "$1:$f" 2>/dev/null || falla "El commit no contiene $f."
  done
}

# Comprobaciones y opciones del contenedor a partir de `docker inspect` (python3 del host, solo biblioteca estándar).
#   validar <inspect.json> <carpeta del socket>        → imprime el GID del socket; falla ante cualquier diferencia
#   opciones <inspect.json> <imagen.json> <carpeta>    → opciones de `docker run` (separadas por NUL) con el mismo
#                                                        aislamiento, límites, usuario, variables y registro
contenedor_py() {
  python3 - "$@" <<'PY'
import json, os, re, sys
orden, ruta = sys.argv[1], sys.argv[2]
c = json.load(open(ruta))[0]
h, cfg = c['HostConfig'], c['Config']
if orden == 'validar':
    carpeta = sys.argv[3]
    e = []
    def exige(cond, texto):
        if not cond: e.append(texto)
    exige(c['State']['Running'], 'no está en ejecución')
    exige(h.get('NetworkMode') == 'none', f"red {h.get('NetworkMode')} (se espera none)")
    exige(h.get('ReadonlyRootfs') is True, 'la raíz no es de solo lectura')
    exige('ALL' in (h.get('CapDrop') or []) and not h.get('CapAdd'), 'capacidades distintas de cap-drop ALL')
    exige(not h.get('Privileged') and not h.get('Devices') and not h.get('GroupAdd'), 'privilegios, dispositivos o grupos añadidos')
    exige(set(h.get('SecurityOpt') or []) <= {'no-new-privileges', 'no-new-privileges:true'} and h.get('SecurityOpt'), f"opciones de seguridad {h.get('SecurityOpt')}")
    exige(h.get('Init') is True, 'sin init (recogida de procesos huérfanos)')
    exige(not h.get('PortBindings') and not h.get('PublishAllPorts'), 'publica puertos')
    exige(0 < (h.get('PidsLimit') or 0) <= 256, f"límite de procesos {h.get('PidsLimit')}")
    exige(0 < (h.get('Memory') or 0) <= 2 * 1024 ** 3, f"límite de memoria {h.get('Memory')}")
    exige(0 < (h.get('NanoCpus') or 0) <= 2e9, f"límite de CPU {h.get('NanoCpus')}")
    exige('noexec' in (h.get('Tmpfs') or {}).get('/tmp', ''), 'sin tmpfs /tmp con noexec')
    exige(not h.get('VolumesFrom') and not h.get('Binds'), 'volúmenes o binds adicionales')
    m = c.get('Mounts') or []
    exige(len(m) == 1 and m[0].get('Type') == 'bind' and os.path.realpath(m[0]['Source']) == os.path.realpath(carpeta)
          and m[0]['Destination'] == '/run/compilador' and m[0].get('RW') is True,
          'montajes inesperados: ' + json.dumps([(x.get('Source'), x.get('Destination')) for x in m]))
    exige(not any('docker.sock' in (x.get('Source') or '') for x in m), 'monta el socket de Docker')
    u = re.fullmatch(r'10001:(\d+)', cfg.get('User') or '')
    exige(u and u[1] != '0', f"usuario {cfg.get('User')} (se espera 10001:<grupo>)")
    env = dict(x.split('=', 1) for x in cfg.get('Env') or [])
    exige(env.get('COMPILADOR_SOCKET') == '/run/compilador/compilador.sock', 'COMPILADOR_SOCKET distinto')
    if e:
        print('Diferencias no contempladas en ' + c['Name'].lstrip('/') + ': ' + '; '.join(e), file=sys.stderr)
        sys.exit(1)
    print(u[1])
elif orden == 'opciones':
    imagen, carpeta = json.load(open(sys.argv[3]))[0], sys.argv[4]
    a = ['--init', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true',
         '--pids-limit', str(h['PidsLimit']), '--memory', str(h['Memory']), '--memory-swap', str(h['MemorySwap']),
         '--cpus', f"{h['NanoCpus'] / 1e9:g}", '--user', cfg['User'], '--tmpfs', '/tmp:' + h['Tmpfs']['/tmp']]
    for x in h.get('Ulimits') or []:
        a += ['--ulimit', f"{x['Name']}={x['Soft']}:{x['Hard']}"]
    lc = h.get('LogConfig') or {}
    if lc.get('Type'):
        a += ['--log-driver', lc['Type']]
        for k, v in (lc.get('Config') or {}).items():
            a += ['--log-opt', f'{k}={v}']
    base = set(imagen['Config'].get('Env') or [])
    for x in cfg.get('Env') or []:
        if x not in base:          # solo las variables propias del contenedor (socket, cola…), no las de la imagen
            a += ['--env', x]
    a += ['--mount', f'type=bind,src={carpeta},dst=/run/compilador']
    sys.stdout.write('\0'.join(a) + '\0')
elif orden == 'reinicio':
    print((h.get('RestartPolicy') or {}).get('Name') or 'no')
PY
}

leer_actual() {   # guarda la inspección del contenedor actual en $1 y define GID; falla ante diferencias
  docker container inspect "$COMP_C" > "$1" 2>/dev/null || falla "No existe el contenedor $COMP_C."
  GID=$(contenedor_py validar "$1" "$SOCKET_DIR") || falla "El contenedor $COMP_C no coincide con lo esperado; no se cambió nada."
}

permisos_socket() {   # $1 carpeta: socket 10001:GID 660 en carpeta 10001:GID 770, sin enlaces
  [[ -S $1/compilador.sock && ! -L $1/compilador.sock && ! -L $1 ]] || { echo "No existe el socket en $1." >&2; return 1; }
  local s d
  s=$(stat -c '%u %g %a' "$1/compilador.sock"); d=$(stat -c '%u %g %a' "$1")
  [[ $s == "10001 $GID 660" && $d == "10001 $GID 770" ]] || { echo "Permisos inesperados: socket $s, carpeta $d (se espera 10001 $GID 660 / 770)." >&2; return 1; }
}

salud() {   # $1 carpeta del socket → JSON de /salud (HTTP 200) o error
  curl -fsS --max-time 5 --unix-socket "$1/compilador.sock" http://localhost/api/arduino/salud
}

esperar_salud() {   # $1 carpeta, $2 "servo" si debe identificar Servo
  local r=''
  for _ in $(seq 1 40); do
    if r=$(salud "$1" 2>/dev/null) && [[ $r == *'"ok": true'* ]]; then
      if [[ ${2:-} != servo || $r == *"$SERVO_COMMIT"* ]]; then echo "Salud: $r"; return 0; fi
      echo "La salud no identifica Servo $SERVO_COMMIT: $r" >&2; return 1
    fi
    sleep 1
  done
  echo "El servicio no respondió HTTP 200 por $1/compilador.sock." >&2
  return 1
}

imagen_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null; }

exportar() {   # $1 commit → $STATE/fuentes/$1 (solo lo necesario, legible para el usuario del contenedor de pruebas)
  FUENTES="$STATE/fuentes/$1"
  python3 - "$REPO" "$1" "$FUENTES" <<'PY'
from pathlib import Path, PurePosixPath
import io, os, shutil, subprocess, sys, tarfile, tempfile
repo, sha, destino = sys.argv[1], sys.argv[2], Path(sys.argv[3])
marca = destino / '.commit'
if marca.is_file() and marca.read_text().strip() == sha:
    print('Reutilizando la exportación de ' + sha)
    raise SystemExit(0)
if destino.exists():
    raise SystemExit('Existe una exportación incompleta; se conserva para revisar: ' + str(destino))
rutas = ['services/compilador-arduino', 'deploy/linux/compilador-prueba.py', 'tests/test_laboratorio.py', 'tests/fixtures/laboratorio']
datos = subprocess.check_output(['git', '-c', f'safe.directory={repo}', '-C', repo, 'archive', sha, '--', *rutas])
etapa = Path(tempfile.mkdtemp(dir=destino.parent, prefix='.exportando-'))
try:
    total = 0
    with tarfile.open(fileobj=io.BytesIO(datos)) as tar:
        for m in tar:
            p = PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or not (m.isdir() or m.isfile()):
                raise SystemExit('Archivo no permitido en la exportación: ' + m.name)
            total += m.size
            if total > 30 * 1024 * 1024:
                raise SystemExit('Exportación demasiado grande')
        tar.extractall(etapa, filter='data')
    for raiz, dirs, archivos in os.walk(etapa):
        os.chmod(raiz, 0o755)
        for a in archivos:
            os.chmod(os.path.join(raiz, a), 0o644)
    (etapa / '.commit').write_text(sha + '\n')
    etapa.rename(destino)
finally:
    if etapa.exists():
        shutil.rmtree(etapa)
PY
  chmod 755 "$STATE/fuentes"
}

LIMITES=(--init --network none --read-only --cap-drop ALL --security-opt no-new-privileges:true
  --pids-limit 64 --memory 768m --memory-swap 768m --cpus 1
  --ulimit nofile=256:256 --tmpfs /tmp:size=64m,mode=1777,noexec,nosuid,nodev)

prueba_socket() {   # $1 carpeta del socket, $2 imagen del cliente, $3 modo, $4 commit de Servo (opcional)
  docker run --rm "${LIMITES[@]}" --user "10001:$GID" \
    --mount type=bind,src="$1",dst=/s,readonly --mount type=bind,src="$FUENTES",dst=/f,readonly \
    "$2" python3 /f/deploy/linux/compilador-prueba.py /s/compilador.sock /f --modo "$3" ${4:+--servo-commit "$4"}
}

# Contenedores en ejecución que montan la carpeta del socket (aula, laboratorios privados): nombre, destino y puerto
# local publicado (si lo hay).
consumidores() {
  local ids; ids=$(docker ps -q)
  [[ -n $ids ]] || return 0
  docker inspect $ids | python3 -c '
import json, os, sys
carpeta, excluir = os.path.realpath(sys.argv[1]), set(sys.argv[2:])
for c in json.load(sys.stdin):
    nombre = c["Name"].lstrip("/")
    if nombre in excluir: continue
    for m in c.get("Mounts") or []:
        if os.path.realpath(m.get("Source") or "") == carpeta:
            puertos = (c["NetworkSettings"].get("Ports") or {}).get("80/tcp") or []
            local = next((p["HostPort"] for p in puertos if p.get("HostIp") == "127.0.0.1"), "-")
            print(nombre, m["Destination"], local)
            break' "$SOCKET_DIR" "$COMP_C" "$CAND_C"
}

PY_SALUD='import socket,sys
s=socket.socket(socket.AF_UNIX);s.settimeout(5);s.connect(sys.argv[1])
s.sendall(b"GET /api/arduino/salud HTTP/1.0\r\nHost: compilador\r\n\r\n");d=b""
while True:
  b=s.recv(4096)
  if not b: break
  d+=b
print(d.split(b" ")[1].decode())'

estado_consumidor() {   # $1 nombre, $2 destino, $3 puerto → código HTTP visto por ese consumidor, o «sin-prueba»
  local py
  py=$(docker exec "$1" sh -c 'command -v python3 || command -v python' 2>/dev/null | head -n1 || true)
  if [[ -n $py ]]; then
    docker exec "$1" "$py" -c "$PY_SALUD" "$2/compilador.sock" 2>/dev/null || echo error
  elif [[ $3 != - ]]; then
    curl -s -o /dev/null --max-time 5 -w '%{http_code}' "http://127.0.0.1:$3/api/arduino/salud" || true
  else
    echo sin-prueba
  fi
}

estado_consumidores() {   # → líneas «nombre código»
  local n d p
  while read -r n d p; do
    [[ -n $n ]] && echo "$n $(estado_consumidor "$n" "$d" "$p")"
  done < <(consumidores)
}

comparar_consumidores() {   # $1 archivo con el estado previo: los que respondían 200 deben seguir respondiendo 200
  local n antes ahora ok=0
  while read -r n antes; do
    [[ -z $n ]] && continue
    ahora=$(docker inspect -f '{{.State.Running}}' "$n" 2>/dev/null || echo ausente)
    if [[ $ahora == true ]]; then
      ahora=$(estado_consumidor "$n" "$(consumidores | awk -v n="$n" '$1==n {print $2}')" "$(consumidores | awk -v n="$n" '$1==n {print $3}')")
    fi
    echo "  $n: antes $antes, ahora $ahora"
    if [[ $antes == 200 && $ahora != 200 ]]; then ok=1; fi
  done < "$1"
  return $ok
}

# ============================================================== comprobar
comprobar() {
  local tmp; tmp=$(mktemp)
  paso 'Contenedor del compilador'
  leer_actual "$tmp"
  echo "$COMP_C: imagen $(docker inspect -f '{{.Image}}' "$COMP_C") ($(docker inspect -f '{{.Config.Image}}' "$COMP_C")), en marcha desde $(docker inspect -f '{{.State.StartedAt}}' "$COMP_C"), reinicio $(contenedor_py reinicio "$tmp")"
  echo 'Aislamiento: sin red, raíz de solo lectura, cap-drop ALL, no-new-privileges, init, límites y un solo montaje del socket: OK'
  permisos_socket "$SOCKET_DIR" && echo "Socket $SOCKET_DIR/compilador.sock: 10001:$GID 660 (carpeta 770): OK"
  local s; s=$(salud "$SOCKET_DIR") || falla 'El compilador no responde HTTP 200 por el socket.'
  echo "Salud: $s"
  if [[ $s == *'"servo"'* ]]; then echo 'Servo: incluido'; else echo 'Servo: no incluido (versión anterior a las lecciones 12–13)'; fi
  paso 'Consumidores del socket (aula y laboratorios privados)'
  estado_consumidores | sed 's/^/  /'
  paso 'Estado guardado'
  [[ -d $STATE ]] || { echo '  (sin operaciones registradas)'; rm -f "$tmp"; return 0; }
  for f in "$STATE"/preparado-*.id "$STATE"/ensayo-*.ok "$STATE/actual.txt" "$STATE/ultima-promocion"; do
    [[ -f $f ]] && echo "  $(basename "$f"): $(tr '\n' ' ' < "$f")"
  done
  docker ps -a --filter "name=^$COMP_C-" --format '  contenedor conservado: {{.Names}} ({{.Status}})'
  docker images "$IMG" --format '  imagen: {{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedSince}}'
  rm -f "$tmp"
}

# ============================================================== preparar
preparar() {
  local REV=${1:-}
  verificar_commit "$REV"
  iniciar_registro
  paso '1/3 Referencia exacta de la versión actual (sin cambiarla)'
  local ANT="$STATE/versiones/$TS-actual"
  install -d -m 700 "$ANT"
  leer_actual "$ANT/contenedor.json"
  permisos_socket "$SOCKET_DIR" || falla 'Permisos del socket inesperados; no se cambió nada.'
  salud "$SOCKET_DIR" > "$ANT/salud.json" || falla 'El compilador actual no responde; revisarlo antes de preparar.'
  local OLD_ID; OLD_ID=$(docker inspect -f '{{.Image}}' "$COMP_C")
  docker image inspect "$OLD_ID" > "$ANT/imagen.json"
  docker image tag "$OLD_ID" "$IMG:respaldo-$TS"
  echo "$OLD_ID" > "$ANT/imagen-id"
  echo "Actual: imagen $OLD_ID, etiquetada también como $IMG:respaldo-$TS; configuración en $ANT"
  paso '2/3 Exportación del commit y construcción de la imagen candidata (con red solo durante la construcción)'
  exportar "$REV"
  docker build --label "org.globalt.commit=$REV" -t "$IMG:$REV" "$FUENTES/services/compilador-arduino"
  local ID; ID=$(imagen_id "$IMG:$REV")
  paso '3/3 Contenido de la imagen'
  docker run --rm "${LIMITES[@]}" --user 10001:10001 "$IMG:$REV" sh -c \
    'cat /opt/nucleo-nano/servo/VERSION; ls /opt/nucleo-nano/servo/include /opt/nucleo-nano/servo/include/avr; ls /opt/nucleo-nano | grep LICENSE; avr-gcc -dumpversion' \
    | tee "$STATE/preparado-$REV.contenido"
  grep -q "commit $SERVO_COMMIT" "$STATE/preparado-$REV.contenido" || falla 'La imagen no contiene Servo con el commit esperado.'
  grep -qx '7.3.0' "$STATE/preparado-$REV.contenido" || falla 'avr-gcc no es 7.3.0.'
  echo "$ID" > "$STATE/preparado-$REV.id"
  printf '\nImagen candidata %s:%s (%s) lista. Producción sin cambios. Siguiente: ensayar %s\n' "$IMG" "$REV" "$ID" "$REV"
}

# ============================================================== ensayar
ensayar() {
  local REV=${1:-}
  verificar_commit "$REV"
  iniciar_registro
  local ID; ID=$(imagen_id "$IMG:$REV") || falla 'Primero ejecuta «preparar».'
  [[ -f $STATE/preparado-$REV.id && $(cat "$STATE/preparado-$REV.id") == "$ID" ]] || falla 'La imagen no es la preparada; ejecuta «preparar» de nuevo.'
  FUENTES="$STATE/fuentes/$REV"
  [[ -f $FUENTES/.commit ]] || falla 'Falta la exportación del commit; ejecuta «preparar».'
  paso '1/5 Compilador actual (referencia, no se cambia)'
  local tmp="$STATE/registros/ensayo-$TS-produccion.json"
  leer_actual "$tmp"
  permisos_socket "$SOCKET_DIR" || falla 'Permisos del socket inesperados.'
  local PROD_ID PROD_INICIO
  PROD_ID=$(docker inspect -f '{{.Id}}' "$COMP_C"); PROD_INICIO=$(docker inspect -f '{{.State.StartedAt}}' "$COMP_C")
  docker container inspect "$CAND_C" >/dev/null 2>&1 && falla "Ya existe $CAND_C (ensayo anterior). Revísalo y retíralo con: docker rm -f $CAND_C"
  [[ $(readlink -f "$CAND_DIR") != $(readlink -f "$SOCKET_DIR") ]] || falla 'El socket del candidato coincide con el de producción.'
  paso '2/5 Pruebas del servicio dentro de la imagen candidata (sin red)'
  docker run --rm "${LIMITES[@]}" --user 10001:10001 --mount type=bind,src="$FUENTES",dst=/workspace,readonly --workdir /workspace \
    "$IMG:$REV" python3 -m unittest discover -s tests -p test_laboratorio.py -k CompilerServiceTests -v
  docker run --rm "${LIMITES[@]}" --user 10001:10001 "$IMG:$REV" python3 -c '
import importlib.util, tempfile
from pathlib import Path
s = importlib.util.spec_from_file_location("compilador", "/opt/compilador/server.py")
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
    p = Path(d)
    code, out = m.ejecutar(["python3", "-c", "open(\"limite\", \"wb\").write(b\"x\" * (17 * 1024 * 1024))"], p, 5)
    assert code != 0 and (p / "limite").stat().st_size == 16 * 1024 * 1024, (code, out)
print("Límite de archivo de 16 MiB: OK")'
  paso '3/5 Candidato temporal con el mismo aislamiento y su propio socket'
  install -d -o 10001 -g "$GID" -m 770 "$CAND_DIR"
  if [[ -S $CAND_DIR/compilador.sock ]]; then rm -- "$CAND_DIR/compilador.sock"; fi
  [[ ! -e $CAND_DIR/compilador.sock ]] || falla "$CAND_DIR/compilador.sock no es un socket; se conserva para revisar."
  docker image inspect "$(docker inspect -f '{{.Image}}' "$COMP_C")" > "$STATE/registros/ensayo-$TS-imagen.json"
  local -a OPC
  mapfile -d '' OPC < <(contenedor_py opciones "$tmp" "$STATE/registros/ensayo-$TS-imagen.json" "$CAND_DIR")
  retirar_candidato() {
    local rc=$?
    set +e
    if docker container inspect "$CAND_C" >/dev/null 2>&1; then
      [[ $rc != 0 ]] && docker logs --tail 30 "$CAND_C" 2>&1
      docker rm -f "$CAND_C" >/dev/null
    fi
    [[ -S $CAND_DIR/compilador.sock ]] && rm -f -- "$CAND_DIR/compilador.sock"
    echo "Candidato retirado. Producción: $(docker inspect -f '{{.Id}} {{.State.StartedAt}}' "$COMP_C" 2>/dev/null | cut -c1-12,65-)"
  }
  trap retirar_candidato EXIT
  docker run -d --name "$CAND_C" --restart no "${OPC[@]}" "$IMG:$REV" >/dev/null
  esperar_salud "$CAND_DIR" servo
  docker container inspect "$CAND_C" > "$STATE/registros/ensayo-$TS-candidato.json"
  contenedor_py validar "$STATE/registros/ensayo-$TS-candidato.json" "$CAND_DIR" >/dev/null || falla 'El candidato no tiene el aislamiento esperado.'
  permisos_socket "$CAND_DIR" || falla 'El socket del candidato no tiene los permisos de producción.'
  echo 'Candidato: sin red, solo lectura, mismos límites, mismo usuario y grupo, socket 660 en carpeta 770: OK'
  paso '4/5 Prueba funcional completa por el socket del candidato'
  prueba_socket "$CAND_DIR" "$IMG:$REV" completa "$SERVO_COMMIT"
  paso '5/5 Producción intacta'
  [[ $(docker inspect -f '{{.Id}}' "$COMP_C") == "$PROD_ID" && $(docker inspect -f '{{.State.StartedAt}}' "$COMP_C") == "$PROD_INICIO" ]] \
    || falla 'El contenedor de producción cambió durante el ensayo.'
  permisos_socket "$SOCKET_DIR" && salud "$SOCKET_DIR" >/dev/null && echo 'Compilador de producción sin cambios y respondiendo: OK'
  echo "$ID" > "$STATE/ensayo-$REV.ok"
  printf '\nEnsayo superado para %s (imagen %s). Siguiente: promover %s\n' "$REV" "$ID" "$REV"
}

# ============================================================== promover
promover() {
  local REV=${1:-}
  verificar_commit "$REV"
  iniciar_registro
  local ID; ID=$(imagen_id "$IMG:$REV") || falla 'Primero ejecuta «preparar» y «ensayar».'
  [[ -f $STATE/ensayo-$REV.ok ]] || falla 'Primero ejecuta «ensayar» con este commit.'
  [[ $(cat "$STATE/ensayo-$REV.ok") == "$ID" ]] || falla "La imagen $IMG:$REV cambió desde el ensayo; repite «preparar» y «ensayar»."
  FUENTES="$STATE/fuentes/$REV"
  paso '1/4 Comprobaciones y copia de la versión actual'
  local V="$STATE/versiones/$TS-promover"
  install -d -m 700 "$V"
  leer_actual "$V/contenedor.json"
  permisos_socket "$SOCKET_DIR" || falla 'Permisos del socket inesperados; no se cambió nada.'
  salud "$SOCKET_DIR" > "$V/salud.json" || falla 'El compilador actual no responde; no se cambió nada.'
  local OLD_ID REINICIO BACKUP="$COMP_C-anterior-$TS"
  OLD_ID=$(docker inspect -f '{{.Image}}' "$COMP_C")
  [[ $OLD_ID != "$ID" ]] || falla 'El compilador ya usa esta imagen.'
  REINICIO=$(contenedor_py reinicio "$V/contenedor.json")
  docker image inspect "$OLD_ID" > "$V/imagen.json"
  docker image tag "$OLD_ID" "$IMG:respaldo-$TS"
  echo "$OLD_ID" > "$V/imagen-id"
  estado_consumidores > "$V/consumidores.txt"
  echo 'Consumidores antes del cambio:'; sed 's/^/  /' "$V/consumidores.txt"
  printf 'TS=%s\nCONTENEDOR=%s\nIMAGEN=%s\nREINICIO=%s\nREV=%s\nVERSION=%s\n' "$TS" "$BACKUP" "$OLD_ID" "$REINICIO" "$REV" "$V" > "$V/registro.env"
  local -a OPC
  mapfile -d '' OPC < <(contenedor_py opciones "$V/contenedor.json" "$V/imagen.json" "$SOCKET_DIR")
  local detenido=0 renombrado=0 creado=0
  volver() {
    set +e
    trap - ERR
    echo '!! Fallo tras iniciar el cambio: se vuelve al compilador anterior.' >&2
    if (( creado )); then docker logs --tail 30 "$COMP_C" 2>&1; docker rm -f "$COMP_C" >/dev/null; fi
    if (( renombrado )); then docker rename "$BACKUP" "$COMP_C"; fi
    docker update --restart "$REINICIO" "$COMP_C" >/dev/null
    if (( detenido )); then docker start "$COMP_C" >/dev/null; fi
    if esperar_salud "$SOCKET_DIR" && permisos_socket "$SOCKET_DIR" && prueba_socket "$SOCKET_DIR" "$OLD_ID" minima \
      && comparar_consumidores "$V/consumidores.txt"; then
      echo "RESTAURADO: compilador anterior (imagen $OLD_ID) con su socket y sus consumidores. Sin cambios: API del aula, web y base de datos. La imagen $IMG:$REV se conserva para revisar." >&2
    else
      echo "ATENCIÓN: el compilador anterior no quedó sano tras restaurarlo. Ver «Recuperación manual» en docs/ACTUALIZACION_LECCIONES_12_13.md." >&2
    fi
    exit 1
  }
  trap volver ERR
  paso "2/4 Cambio de contenedor (interrupción breve: las compilaciones en curso en la versión anterior pueden fallar y el estudiante reintenta)"
  docker update --restart no "$COMP_C" >/dev/null
  docker stop --time "$PARADA_S" "$COMP_C" >/dev/null; detenido=1
  docker rename "$COMP_C" "$BACKUP"; renombrado=1
  local inicio; inicio=$(date +%s)
  docker run -d --name "$COMP_C" --restart "$REINICIO" "${OPC[@]}" "$IMG:$REV" >/dev/null; creado=1
  paso '3/4 Verificación del compilador nuevo'
  esperar_salud "$SOCKET_DIR" servo
  echo "Sin servicio durante unos $(( $(date +%s) - inicio )) s (más la parada ordenada del anterior)."
  docker container inspect "$COMP_C" > "$V/nuevo.json"
  [[ $(contenedor_py validar "$V/nuevo.json" "$SOCKET_DIR") == "$GID" ]] || error 'El contenedor nuevo no tiene el aislamiento o el grupo esperados.'
  permisos_socket "$SOCKET_DIR"
  prueba_socket "$SOCKET_DIR" "$IMG:$REV" rapida "$SERVO_COMMIT"
  echo 'Consumidores después del cambio:'
  comparar_consumidores "$V/consumidores.txt"
  if [[ $ENSAYO == 1 && ${GLOBALT_ENSAYO_FALLO:-} == tras-cambio ]]; then echo 'Fallo simulado (solo en ensayo).'; false; fi
  trap - ERR
  paso '4/4 Registro'
  echo "$REV" > "$STATE/actual.txt"
  cp "$V/registro.env" "$STATE/ultima-promocion"
  printf '\nACTUALIZADO: compilador %s con Servo (imagen %s).\nCONSERVADO: contenedor anterior %s (detenido) e imagen %s:respaldo-%s.\nSIN CAMBIOS: API del aula, web pública, laboratorios privados y base de datos.\nVuelta atrás: sudo bash deploy/linux/compilador-produccion.sh recuperar\n' \
    "$COMP_C" "$ID" "$BACKUP" "$IMG" "$TS"
}

# ============================================================== recuperar
recuperar() {
  iniciar_registro
  [[ -f $STATE/ultima-promocion ]] || falla 'No hay ninguna promoción registrada que deshacer.'
  local TSP CONTENEDOR IMAGEN REINICIO REV VERSION
  # shellcheck disable=SC1091
  source <(grep -E '^(TS|CONTENEDOR|IMAGEN|REINICIO|REV|VERSION)=[A-Za-z0-9:._/+-]+$' "$STATE/ultima-promocion")
  TSP=$TS; TS=$(date -u +%Y%m%dT%H%M%SZ)
  [[ -n ${CONTENEDOR:-} && -n ${IMAGEN:-} && -d ${VERSION:-/nonexistent} ]] || falla 'Registro de la última promoción incompleto.'
  GID=$(contenedor_py validar "$VERSION/contenedor.json" "$SOCKET_DIR" 2>/dev/null || python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[0]["Config"]["User"].split(":")[1])' "$VERSION/contenedor.json")
  FUENTES="$STATE/fuentes/$REV"
  paso "1/3 Versión anterior guardada ($TSP)"
  if ! docker container inspect "$CONTENEDOR" >/dev/null 2>&1; then
    imagen_id "$IMAGEN" >/dev/null || falla "No existen ni el contenedor $CONTENEDOR ni la imagen $IMAGEN."
    echo "El contenedor $CONTENEDOR no existe: se recrea con la imagen $IMAGEN y la configuración guardada."
    local -a OPC
    mapfile -d '' OPC < <(contenedor_py opciones "$VERSION/contenedor.json" "$VERSION/imagen.json" "$SOCKET_DIR")
    docker create --name "$CONTENEDOR" --restart no "${OPC[@]}" "$IMAGEN" >/dev/null
  fi
  [[ $(docker inspect -f '{{.Image}}' "$CONTENEDOR") == "$IMAGEN" ]] || falla "$CONTENEDOR no usa la imagen guardada."
  echo "Anterior: $CONTENEDOR (imagen $IMAGEN)"
  local RETIRADO="$COMP_C-retirado-$TS" hay_actual=0
  docker container inspect "$COMP_C" >/dev/null 2>&1 && hay_actual=1
  (( hay_actual )) && docker inspect "$COMP_C" > "$STATE/versiones/$TSP-promover/retirado-$TS.json"
  deshacer() {
    set +e; trap - ERR
    echo '!! La versión anterior no quedó sana: se vuelve a poner la que estaba en marcha.' >&2
    docker logs --tail 30 "$COMP_C" 2>&1
    docker stop --time 5 "$COMP_C" >/dev/null; docker rename "$COMP_C" "$CONTENEDOR"; docker update --restart no "$CONTENEDOR" >/dev/null
    if (( hay_actual )); then
      docker rename "$RETIRADO" "$COMP_C"; docker update --restart "$REINICIO" "$COMP_C" >/dev/null; docker start "$COMP_C" >/dev/null
      esperar_salud "$SOCKET_DIR" && echo 'Se mantiene la versión que estaba en marcha (sin recuperar).' >&2
    fi
    exit 1
  }
  trap deshacer ERR
  paso '2/3 Cambio a la versión anterior (interrupción breve)'
  if (( hay_actual )); then
    docker update --restart no "$COMP_C" >/dev/null
    docker stop --time "$PARADA_S" "$COMP_C" >/dev/null
    docker rename "$COMP_C" "$RETIRADO"
  fi
  docker rename "$CONTENEDOR" "$COMP_C"
  docker update --restart "$REINICIO" "$COMP_C" >/dev/null
  docker start "$COMP_C" >/dev/null
  paso '3/3 Verificación'
  esperar_salud "$SOCKET_DIR"
  docker container inspect "$COMP_C" > "$STATE/registros/recuperar-$TS.json"
  [[ $(contenedor_py validar "$STATE/registros/recuperar-$TS.json" "$SOCKET_DIR") == "$GID" ]] || error 'Aislamiento o grupo distintos tras recuperar.'
  permisos_socket "$SOCKET_DIR"
  if [[ -f $FUENTES/.commit ]]; then prueba_socket "$SOCKET_DIR" "$IMAGEN" minima; fi
  comparar_consumidores "$VERSION/consumidores.txt"
  trap - ERR
  echo "anterior a $REV (recuperado $TS)" > "$STATE/actual.txt"
  rm -f -- "$STATE/ultima-promocion"
  printf '\nRESTAURADO: compilador anterior (imagen %s) y su socket.\nRETIRADO Y CONSERVADO: %s (detenido), imagen %s:%s.\nSIN CAMBIOS: API del aula (tiene su propia vuelta atrás: aula-produccion.sh actualizar <commit anterior>), web y base de datos.\n' \
    "$IMAGEN" "$( (( hay_actual )) && echo "$RETIRADO" || echo '(no había contenedor en marcha)')" "$IMG" "$REV"
}

case $ORDEN in
  comprobar) comprobar ;;
  preparar) preparar "$@" ;;
  ensayar) ensayar "$@" ;;
  promover) promover "$@" ;;
  recuperar) recuperar ;;
  *) sed -n '2,15p' "$SELF"; exit 2 ;;
esac
