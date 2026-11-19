#!/usr/bin/env bash
# Aula de GLOBALT ROBOTICS en el dominio público (https://globalt-robotics.com), por etapas.
# Proyecto Compose propio «globalt-aula» (API + PostgreSQL), independiente del piloto privado (8100).
#
#   sudo bash deploy/linux/aula-produccion.sh preparar  <commit>   # API, base, respaldos y pruebas, sin exponer nada
#   sudo bash deploy/linux/aula-produccion.sh comprobar             # solo lectura
#   sudo bash deploy/linux/aula-produccion.sh activar   <commit de main con la PR fusionada>
#   sudo bash deploy/linux/aula-produccion.sh revertir              # vuelve web, nginx y publicador; NO toca la base
#   sudo bash deploy/linux/aula-produccion.sh actualizar <commit>   # nueva versión de la API con respaldo y vuelta atrás
#   sudo bash deploy/linux/aula-produccion.sh crear-cuenta --correo C --nombre N   # contraseña por teclado (oculta)
#   sudo bash deploy/linux/aula-produccion.sh registro estado|abrir|cerrar   # registro de adultos: cerrado por defecto
#   sudo bash deploy/linux/aula-produccion.sh correo configurar|desactivar|probar --a CORREO   # SMTP de producción
#   sudo bash deploy/linux/aula-produccion.sh documentos listar|cargar|activar …   # términos y autorización de datos
#   sudo bash deploy/linux/aula-produccion.sh respaldo              # respaldo comprobado inmediato
#   sudo bash deploy/linux/aula-produccion.sh bajas estado|configurar|reconectar|deshabilitar|eliminar|resolver
#                                                                   # registro externo de bajas (opcional)
#
# Ejecutar desde una copia del repositorio en el commit indicado (el script se compara con el del commit).
# Nunca restaura la base automáticamente. Credenciales generadas en el servidor, fuera de GitHub.
# Ver docs/AULA_PRODUCCION.md.
set -Eeuo pipefail
umask 077
export LC_ALL=C

STATE=/var/lib/globalt-robotics-aula
NAME=globalt-aula
DB_C=globalt-aula-db; API_C=globalt-aula-api
RED_FRONTAL=${NAME}_frontal
IMG=globalt-aula-produccion-api
PUB_C=globalt-robotics-public
PUB_CONF=/etc/globalt-robotics/nginx-public.conf
PUB_URL=http://127.0.0.1:8096
LIB=/usr/local/lib/globalt-robotics
PUBLICADOR=$LIB/update.py
WEBROOT=/srv/globalt-robotics
PUB_REPO=/var/lib/globalt-robotics/repository.git
COMP_C=globalt-arduino-compiler
SOCKET_DIR=/var/lib/globalt-robotics-lab/run
SOCKET_API=/compilador
ORIGENES=https://globalt-robotics.com,https://www.globalt-robotics.com
RESPALDOS=/var/backups/globalt-aula
BAJAS_CONF=$STATE/bajas.conf     # destino externo de bajas: ruta, origen y tipo del montaje e identificador (sin credenciales)
BAJAS_API=/bajas                 # ruta del registro dentro del contenedor de la API
BAJAS_TIPOS='nfs nfs4 cifs smb3 fuse.sshfs'
PG_IMAGE='postgres:16.6-alpine@sha256:1d04b9ba1d4996401f2552b51beda8187f175c0645c091e4781134fc9c9a3eef'

falla() { echo "ERROR: $*" >&2; exit 1; }
paso() { printf '\n== %s\n' "$*"; }
[[ $EUID -eq 0 ]] || falla 'Ejecuta con sudo bash.'
ORDEN=${1:-}; shift || true
REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SELF=$(readlink -f -- "${BASH_SOURCE[0]}")
GIT=(git -c safe.directory="$REPO" -C "$REPO")
DC=(docker compose -f "$STATE/compose.json")
for t in docker git python3 curl tar sha256sum flock stat runuser install findmnt timeout; do command -v "$t" >/dev/null || falla "Falta $t"; done
docker info >/dev/null 2>&1 || falla 'Docker no responde.'

sql() { docker exec -i "$DB_C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; }
en_ejecucion() { [[ $(docker inspect -f '{{.State.Running}}' "$1" 2>/dev/null) == true ]]; }

iniciar_registro() {
  install -d -m 700 "$STATE" "$STATE/registros"
  exec 9>"$STATE/.bloqueo"
  flock -n 9 || falla 'Ya hay otra operación del aula en curso.'
  TS=$(date -u +%Y%m%dT%H%M%SZ)
  LOG="$STATE/registros/$ORDEN-$TS.log"
  exec > >(tee -a "$LOG") 2>&1
  echo "Aula producción · $ORDEN · $TS"
}

verificar_commit() {   # $1 commit
  [[ $1 =~ ^[0-9a-f]{40}$ ]] || falla 'Indica el commit completo (40 caracteres hexadecimales).'
  "${GIT[@]}" cat-file -e "$1^{commit}" 2>/dev/null || falla "El commit $1 no está en $REPO (ejecuta git fetch)."
  "${GIT[@]}" show "$1:deploy/linux/aula-produccion.sh" | cmp -s - "$SELF" \
    || falla 'Este script no coincide con el del commit indicado. Ejecuta la copia de ese mismo commit.'
  for f in services/aula-api/Dockerfile services/aula-api/app/main.py services/aula-api/app/cuentas.py \
           services/aula-api/app/correo.py services/aula-api/app/documentos.py services/aula-api/app/registro_bajas.py \
           deploy/linux/nginx-public-aula.conf deploy/linux/aula-respaldo.sh deploy/linux/aula-prueba.py \
           deploy/linux/update.py aula/index.html; do
    "${GIT[@]}" cat-file -e "$1:$f" 2>/dev/null || falla "El commit no contiene $f."
  done
}

verificar_compilador() {   # solo comprueba el compilador existente; define SOCK_GID
  [[ -S $SOCKET_DIR/compilador.sock && ! -L $SOCKET_DIR/compilador.sock && ! -L $SOCKET_DIR ]] || falla 'No existe el socket del compilador.'
  read -r s_uid SOCK_GID s_modo < <(stat -c '%u %g %a' "$SOCKET_DIR/compilador.sock")
  read -r d_uid d_gid d_modo < <(stat -c '%u %g %a' "$SOCKET_DIR")
  [[ $s_uid == 10001 && $s_modo == 660 && $d_uid == 10001 && $d_gid == "$SOCK_GID" && $d_modo == 770 && $SOCK_GID != 0 ]] \
    || falla "Permisos del socket inesperados ($s_uid:$SOCK_GID $s_modo, carpeta $d_uid:$d_gid $d_modo)."
  docker inspect "$COMP_C" | python3 -c '
import json, sys
c = json.load(sys.stdin)[0]
assert c["State"]["Running"], "el compilador no está en ejecución"
assert c["HostConfig"]["NetworkMode"] == "none", "el compilador debe seguir sin red"
assert c["HostConfig"]["ReadonlyRootfs"] and "ALL" in (c["HostConfig"]["CapDrop"] or []), "aislamiento del compilador"
assert not any(m["Source"] in ("/var/run/docker.sock", "/run/docker.sock") for m in c["Mounts"])' \
    || falla 'El contenedor del compilador no coincide con lo esperado.'
  local salud; salud=$(curl -fsS --max-time 5 --unix-socket "$SOCKET_DIR/compilador.sock" http://localhost/api/arduino/salud || true)
  [[ $salud == *'"ok": true'* || $salud == *'"ok":true'* ]] || falla 'El compilador existente no responde sano.'
  echo 'Compilador existente (sin red, socket 660): OK'
}

verificar_publica() {
  en_ejecucion "$PUB_C" || falla "El contenedor $PUB_C no está en ejecución."
  [[ -f $PUB_CONF ]] || falla "Falta $PUB_CONF."
  [[ -L $WEBROOT/current ]] || falla "Falta $WEBROOT/current."
  curl -fsS --max-time 5 -o /dev/null "$PUB_URL/" || falla 'La web pública (8096) no responde.'
  [[ $(curl -s -o /dev/null -w '%{http_code}' "$PUB_URL/api/arduino/salud") == 403 ]] || falla 'La web pública no bloquea /api/arduino.'
  echo 'Web pública 8096: OK'
}

puerta_tunel() {   # puerta de enlace de la red por la que se publica 8096 (conexiones del túnel)
  docker inspect "$PUB_C" | python3 -c '
import json, sys, ipaddress
c = json.load(sys.stdin)[0]
redes = {n: v for n, v in c["NetworkSettings"]["Networks"].items() if not n.endswith("_frontal")}
assert len(redes) == 1, f"redes inesperadas: {sorted(redes)}"
gw = next(iter(redes.values()))["Gateway"]
ipaddress.ip_address(gw)
assert c["HostConfig"]["PortBindings"]["80/tcp"] == [{"HostIp": "127.0.0.1", "HostPort": "8096"}], "8096 solo en localhost"
print(gw)'
}

escribir_compose() {   # $1 commit, $2 gid del socket
  install -d -m 0750 -o root -g 10002 "$STATE/smtp"
  if bajas_leer; then   # el punto de montaje debe existir para arrancar la API aunque falte el montaje remoto
    timeout 15 test -d "$B_RUTA" || timeout 15 install -d -m 0700 "$B_RUTA" || echo "AVISO: no se pudo comprobar $B_RUTA" >&2
  fi
  python3 - "$STATE" "$1" "$2" "$SOCKET_DIR" "$SOCKET_API" "$IMG" "$PG_IMAGE" "$BAJAS_API" <<'PY'
import json, pathlib, sys
state, rev, gid, sdir, sapi, img, pg, bapi = sys.argv[1:]
duro = {'read_only': True, 'tmpfs': ['/tmp'], 'cap_drop': ['ALL'], 'security_opt': ['no-new-privileges:true'],
        'init': True, 'restart': 'unless-stopped',
        'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '3'}}}
c = {'name': 'globalt-aula', 'services': {
    'db': {'image': pg, 'container_name': 'globalt-aula-db', 'env_file': ['db.env'],
           'volumes': ['datos:/var/lib/postgresql/data'], 'networks': ['aislada'], 'restart': 'unless-stopped',
           'mem_limit': '512m', 'cpus': 0.5, 'shm_size': '64m',
           'logging': duro['logging'],
           'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -U aula -d aula'], 'interval': '5s', 'timeout': '3s', 'retries': 30}},
    'api': {**duro, 'build': {'context': 'source/services/aula-api'}, 'image': f'{img}:{rev}',
            'container_name': 'globalt-aula-api', 'env_file': ['api.env'],
            'environment': {'AULA_COMPILADOR_SOCKET': f'{sapi}/compilador.sock', 'AULA_SMTP_SOCKET': '/smtp/proveedor.sock'},
            'volumes': [f'{sdir}:{sapi}:ro', f'{state}/smtp:/smtp:ro'], 'group_add': [gid],
            'networks': ['aislada', 'frontal'], 'mem_limit': '512m', 'cpus': 1, 'pids_limit': 128,
            'depends_on': {'db': {'condition': 'service_healthy'}}}},
    # Ambas redes internas: la base solo ve a la API; la API solo ve a la base y a la web pública.
    'networks': {'aislada': {'internal': True}, 'frontal': {'internal': True}},
    'volumes': {'datos': {}}}
# Registro externo de bajas (opcional). Sin bajas.conf no hay volumen ni variables: las bajas quedan bloqueadas.
conf = pathlib.Path(state, 'bajas.conf')
if conf.exists():
    b = dict(l.split('=', 1) for l in conf.read_text().splitlines() if '=' in l)
    api = c['services']['api']
    # rslave: si el montaje del anfitrión desaparece o vuelve, la API ve el mismo cambio.
    api['volumes'].append({'type': 'bind', 'source': b['RUTA'], 'target': bapi, 'bind': {'propagation': 'rslave'}})
    if b.get('ID'):   # sin identificador (registro aún por inicializar) la API no habilita las bajas
        api['environment'].update({'AULA_BAJAS_REGISTRO': bapi, 'AULA_BAJAS_REGISTRO_ID': b['ID']})
p = pathlib.Path(state, 'compose.json'); tmp = p.with_name('.compose.json.nuevo')
tmp.write_text(json.dumps(c, indent=2)); tmp.chmod(0o600); tmp.replace(p)
PY
}

esperar_api() {
  for _ in $(seq 1 60); do
    if docker exec "$API_C" python -c "import urllib.request,sys; sys.exit(0 if b'\"ok\"' in urllib.request.urlopen('http://127.0.0.1:8000/api/aula/salud', timeout=3).read() else 1)" 2>/dev/null; then
      return 0
    fi
    sleep 2
  done
  docker logs --tail 30 "$API_C" >&2 || true
  return 1
}

verificar_migraciones() {   # $1 commit: aplicadas == archivos del commit, con la misma suma
  local esperadas aplicadas
  esperadas=$("${GIT[@]}" ls-tree --name-only "$1" services/aula-api/migrations/ | grep -E '\.sql$' | sort | while read -r f; do
    printf '%s %s\n' "$(basename "$f" .sql)" "$("${GIT[@]}" show "$1:$f" | sha256sum | cut -d' ' -f1)"; done)
  aplicadas=$(echo 'SELECT version, suma FROM esquema_migraciones ORDER BY version' | sql | tr '|' ' ')
  [[ $esperadas == "$aplicadas" ]] || { echo "Migraciones esperadas:"$'\n'"$esperadas"$'\n'"aplicadas:"$'\n'"$aplicadas" >&2; return 1; }
  echo "Migraciones al día: $(echo "$aplicadas" | cut -d' ' -f1 | tr '\n' ' ')"
}

migraciones_compatibles() {   # $1 commit: las ya aplicadas existen sin cambios
  local version suma
  while read -r version suma; do
    [[ -z $version ]] && continue
    "${GIT[@]}" show "$1:services/aula-api/migrations/$version.sql" 2>/dev/null | sha256sum | grep -q "^$suma " \
      || falla "La migración aplicada $version no existe o cambió en $1."
  done < <(echo 'SELECT version, suma FROM esquema_migraciones' | sql | tr '|' ' ')
}

# Prueba funcional con una cuenta ficticia creada aquí y borrada al terminar (no toca otras cuentas).
prueba_funcional() {   # $1 = interna | tunel
  local correo clave abierto rc=0
  correo="verificacion-aula-$(date +%s)-$RANDOM@example.com"
  clave=$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')
  abierto=$(grep -qx 'AULA_REGISTRO_ABIERTO=true' "$STATE/api.env" && echo si || echo no)
  printf '%s\n' "$clave" | docker exec -i "$API_C" python -m app.cuentas crear --correo "$correo" --nombre 'Verificación automática' >/dev/null
  if [[ $1 == tunel ]]; then
    AULA_PRUEBA_CLAVE=$clave python3 "$STATE/source/deploy/linux/aula-prueba.py" "$PUB_URL" "$correo" "$abierto" tunel || rc=$?
  else
    docker run --rm -i --network "$RED_FRONTAL" --read-only --cap-drop ALL --security-opt no-new-privileges:true \
      -e AULA_PRUEBA_CLAVE="$clave" "$(docker inspect -f '{{.Config.Image}}' "$API_C")" \
      python - http://globalt-aula-api:8000 "$correo" "$abierto" < "$STATE/source/deploy/linux/aula-prueba.py" || rc=$?
  fi
  printf "DELETE FROM usuarios WHERE correo = '%s' AND correo LIKE 'verificacion-aula-%%@example.com';\n" "$correo" | sql >/dev/null || rc=1
  return $rc
}

instalar_respaldos() {
  install -d -m 755 "$LIB"
  install -m 700 "$STATE/source/deploy/linux/aula-respaldo.sh" "$LIB/aula-respaldo.sh"
  install -m 644 "$STATE/source/deploy/linux/globalt-aula-respaldo.service" "$STATE/source/deploy/linux/globalt-aula-respaldo.timer" /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now globalt-aula-respaldo.timer
}

respaldo_ahora() { "$LIB/aula-respaldo.sh"; }

exportar() {   # $1 commit, $2 destino
  rm -rf -- "$2"; install -d -m 700 "$2"
  "${GIT[@]}" archive "$1" | tar -x -C "$2"
}

# ============================================================== preparar
preparar() {
  local REV=${1:-}
  verificar_commit "$REV"
  iniciar_registro
  paso '1/6 Comprobaciones previas (no se modifica nada)'
  verificar_compilador
  verificar_publica
  PUERTA=$(puerta_tunel) || falla 'No se pudo identificar la red del puerto 8096.'
  echo "Red del túnel (puerta de enlace): $PUERTA"
  if [[ -f $STATE/revision.txt ]]; then
    [[ $(cat "$STATE/revision.txt") == "$REV" ]] || falla "Ya está preparada otra versión ($(cat "$STATE/revision.txt")). Usa «actualizar»."
    echo 'Ya preparada con este commit: se repiten las comprobaciones.'
  elif [[ -f $STATE/preparando.txt ]]; then
    [[ $(cat "$STATE/preparando.txt") == "$REV" ]] || falla "Hay una preparación interrumpida de otro commit ($(cat "$STATE/preparando.txt")); revisar antes de seguir."
    echo 'Se retoma una preparación interrumpida de este mismo commit.'
  else
    for c in "$DB_C" "$API_C"; do docker inspect "$c" >/dev/null 2>&1 && falla "Ya existe el contenedor $c."; done
    docker network inspect "$RED_FRONTAL" >/dev/null 2>&1 && falla "Ya existe la red $RED_FRONTAL."
  fi
  trap 'echo "Preparación interrumpida. La web pública no se modificó. Puede repetirse con el mismo commit. Registro: $LOG" >&2' ERR
  [[ -f $STATE/revision.txt ]] || printf '%s\n' "$REV" > "$STATE/preparando.txt"

  paso '2/6 Exportación y credenciales propias (fuera de GitHub)'
  exportar "$REV" "$STATE/source"
  if [[ ! -f $STATE/db.env ]]; then
    python3 - "$STATE" "$ORIGENES" <<'PY'
import pathlib, secrets, sys
s, origenes = pathlib.Path(sys.argv[1]), sys.argv[2]
clave = secrets.token_hex(32)
(s / 'db.env').write_text(f'POSTGRES_DB=aula\nPOSTGRES_USER=aula\nPOSTGRES_PASSWORD={clave}\n')
(s / 'api.env').write_text(f'AULA_DATABASE_URL=postgresql://aula:{clave}@db:5432/aula\nAULA_ORIGENES={origenes}\n'
                           'AULA_COOKIE_SEGURA=true\nAULA_REGISTRO_ABIERTO=false\nFORWARDED_ALLOW_IPS=127.0.0.1\n')
for f in ('db.env', 'api.env'): (s / f).chmod(0o600)
PY
    echo 'Credenciales nuevas generadas (no se muestran).'
  else
    echo 'Se conservan las credenciales existentes.'
  fi
  verificar_compilador >/dev/null
  escribir_compose "$REV" "$SOCK_GID"
  "${DC[@]}" config --quiet

  paso '3/6 Construcción de la API y arranque interno (sin puertos ni acceso público)'
  docker build -q -t "$IMG:$REV" "$STATE/source/services/aula-api" >/dev/null
  "${DC[@]}" up -d db api
  esperar_api
  verificar_migraciones "$REV"

  paso '4/6 Prueba funcional interna con cuenta ficticia temporal'
  prueba_funcional interna

  paso '5/6 Configuración nginx pública preparada (aún no instalada)'
  sed "s/__PUERTA_TUNEL__/$PUERTA/" "$STATE/source/deploy/linux/nginx-public-aula.conf" > "$STATE/nginx-public-aula.conf"
  docker run --rm --network none --read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp \
    --mount type=bind,src="$WEBROOT",dst="$WEBROOT",readonly \
    --mount type=bind,src="$STATE/nginx-public-aula.conf",dst=/etc/nginx/conf.d/default.conf,readonly \
    --entrypoint nginx "$(docker inspect -f '{{.Image}}' "$PUB_C")" -t -q
  echo 'nginx -t con la configuración nueva: OK'

  paso '6/6 Respaldos automáticos'
  instalar_respaldos
  respaldo_ahora
  printf '%s\n' "$REV" > "$STATE/revision.txt"
  "${GIT[@]}" rev-parse "$REV:services/aula-api" > "$STATE/arbol-api.txt"
  rm -f "$STATE/preparando.txt"
  trap - ERR
  printf '\nPreparación completa (%s). La web pública NO cambió.\n' "$REV"
  printf 'Siguiente: fusionar la PR #2 y ejecutar «activar» con el commit de main resultante.\n'
}

# ============================================================== comprobar
comprobar() {
  [[ -f $STATE/revision.txt ]] || falla 'El aula no está preparada.'
  local REV; REV=$(cat "$STATE/revision.txt")
  echo "Versión de la API: $REV"
  en_ejecucion "$DB_C" && en_ejecucion "$API_C" || falla 'La API o la base no están en ejecución.'
  esperar_api && echo 'API: OK'
  verificar_compilador
  verificar_migraciones "$REV"
  local ultimo; ultimo=$(find "$RESPALDOS" -maxdepth 1 -name 'aula-*.dump' -mmin -1800 | sort | tail -1)
  [[ -n $ultimo ]] && echo "Último respaldo (<30 h): $ultimo" || echo 'AVISO: no hay respaldo de las últimas 30 h.'
  echo 'Registro de adultos (requisitos de producción):'
  estado_registro || echo 'Registro real: NO disponible (ver «faltan»).'
  bajas_verificar || true
  if [[ -f $STATE/activado ]]; then
    echo 'Estado: ACTIVADO en la web pública.'
    curl -fsS --max-time 5 -H 'X-Forwarded-Proto: https' "$PUB_URL/api/aula/salud" | grep -q '"ok"' && echo 'Ruta pública /api/aula/salud: OK'
  else
    echo 'Estado: preparado, NO activado (la web pública no lo expone).'
  fi
}

# ============================================================== activar / revertir
volver_web() {   # $1 carpeta de la activación con la copia previa
  local ACT=$1
  set +e
  echo '!! Restaurando web pública, nginx y publicador anteriores. La base y la API no se tocan.' >&2
  cat "$ACT/nginx-public.conf" > "$PUB_CONF"
  docker exec "$PUB_C" nginx -t -q && docker exec "$PUB_C" nginx -s reload
  docker network disconnect "$RED_FRONTAL" "$PUB_C" >/dev/null 2>&1
  install -m 644 "$ACT/update.py" "$PUBLICADOR"
  if ! grep -q "'aula'" "$PUBLICADOR"; then rm -rf -- "$(readlink -f "$WEBROOT/current")/aula"; fi
  rm -f "$STATE/activado"
  sleep 1
  if [[ $(curl -s -o /dev/null -w '%{http_code}' "$PUB_URL/") == 200 ]]; then
    echo 'Web pública restablecida como antes de la activación.' >&2
  else
    echo "La web pública no responde tras restaurar: revisar $PUB_C (registro: $LOG)." >&2
  fi
  set -e
}

activar() {
  local MAIN=${1:-}
  verificar_commit "$MAIN"
  iniciar_registro
  [[ -f $STATE/revision.txt ]] || falla 'Primero ejecuta «preparar».'
  [[ ! -f $STATE/activado ]] || falla 'El aula ya está activada. Usa «comprobar», o «revertir» antes de activar de nuevo.'
  paso '1/5 Comprobaciones previas'
  [[ $("${GIT[@]}" rev-parse "$MAIN:services/aula-api") == $(cat "$STATE/arbol-api.txt") ]] \
    || falla 'La API de ese commit difiere de la preparada. Ejecuta «actualizar» con ese commit antes de activar.'
  "${GIT[@]}" show "$MAIN:deploy/linux/update.py" | grep -q "'aula'" || falla 'El publicador de ese commit no incluye aula/.'
  verificar_publica
  verificar_compilador
  en_ejecucion "$API_C" && esperar_api || falla 'La API preparada no responde.'
  PUERTA=$(puerta_tunel) || falla 'No se pudo identificar la red del puerto 8096.'
  [[ -d $PUB_REPO ]] || falla "Falta el repositorio del publicador $PUB_REPO."
  local ACT="$STATE/activaciones/$TS"
  install -d -m 700 "$ACT"
  cp -p "$PUB_CONF" "$ACT/nginx-public.conf"
  cp -p "$PUBLICADOR" "$ACT/update.py"
  readlink "$WEBROOT/current" > "$ACT/version-web.txt"
  paso '2/5 Respaldo comprobado de la base'
  respaldo_ahora
  trap "volver_web '$ACT'; echo 'Activación fallida; registro: $LOG' >&2; exit 1" ERR

  paso '3/5 Publicador con aula/ y publicación de main'
  "${GIT[@]}" show "$MAIN:deploy/linux/update.py" > "$ACT/update.py.nuevo"
  install -m 644 "$ACT/update.py.nuevo" "$PUBLICADOR"
  (umask 022; runuser -u globalt-robotics -- python3 "$PUBLICADOR" --force)   # mismos permisos que bajo systemd
  local publicado; publicado=$(cat "$WEBROOT/current/revision.txt")
  git --git-dir="$PUB_REPO" -c safe.directory="$PUB_REPO" merge-base --is-ancestor "$MAIN" "$publicado" \
    || { echo "main publicado ($publicado) no contiene $MAIN: ¿se fusionó la PR?" >&2; false; }
  [[ -f $WEBROOT/current/aula/index.html ]]
  echo "Web publicada: $publicado (incluye aula/)"

  paso '4/5 Conexión interna web → API y configuración nginx'
  docker network inspect "$RED_FRONTAL" -f '{{range .Containers}}{{.Name}} {{end}}' | grep -qw "$PUB_C" \
    || docker network connect "$RED_FRONTAL" "$PUB_C"
  local ip_web; ip_web=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$RED_FRONTAL\").IPAddress}}" "$PUB_C")
  [[ $ip_web =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
  python3 - "$STATE/api.env" "$ip_web" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
lineas = [l for l in p.read_text().splitlines() if not l.startswith('FORWARDED_ALLOW_IPS=')]
p.write_text('\n'.join(lineas) + f'\nFORWARDED_ALLOW_IPS={sys.argv[2]}\n')   # solo se confía en esta nginx
PY
  "${DC[@]}" up -d --no-deps --force-recreate api
  esperar_api
  sed "s/__PUERTA_TUNEL__/$PUERTA/" "$STATE/source/deploy/linux/nginx-public-aula.conf" > "$ACT/nginx-public.conf.nuevo"
  cat "$ACT/nginx-public.conf.nuevo" > "$PUB_CONF"   # mismo archivo (montado en el contenedor)
  docker exec "$PUB_C" nginx -t -q
  docker exec "$PUB_C" nginx -s reload
  sleep 2

  paso '5/5 Comprobaciones a través de la entrada del túnel'
  python3 - "$PUB_URL" <<'PY'
import sys, urllib.error, urllib.request
base = sys.argv[1]
class SinRed(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
abrir = urllib.request.build_opener(SinRed).open
def estado(ruta, metodo='GET', proto='https'):
    req = urllib.request.Request(base + ruta, method=metodo, headers={'X-Forwarded-Proto': proto, 'Host': 'globalt-robotics.com'})
    try:
        with abrir(req, timeout=10) as r: return r.status
    except urllib.error.HTTPError as e: return e.code
esperado = {'/': 200, '/aula/': 200, '/games/robolab-arduino/index.html': 200, '/api/aula/salud': 200,
            '/api/aula/config': 200, '/api/arduino/salud': 403, '/api/arduino/compilar': 403, '/admin': 403,
            '/admin.html': 403, '/src/admin/admin.js': 403, '/api/aula/otra': 403, '/api/aula/../arduino/salud': 403,
            '/api/aula/documentos/datos/no-existe': 404, '/api/aula/cuenta/otra': 403, '/api/aula/documentos/otro/v1': 403,
            '/aula/documento.html': 200}
malos = {r: (estado(r), e) for r, e in esperado.items() if estado(r) != e}
assert estado('/api/aula/salud', proto='http') == 403 and estado('/aula/', proto='http') == 301, 'HTTP sin cifrar'
assert estado('/api/arduino/compilar', 'POST') == 403
assert not malos, malos
print('Rutas públicas, bloqueos de administración y compilador directo, y redirección a HTTPS: OK')
PY
  prueba_funcional tunel
  trap - ERR
  touch "$STATE/activado"
  printf '\nAula ACTIVADA en la entrada pública 8096 (dominio vía Cloudflare Tunnel, sin cambios en Cloudflare).\n'
  printf 'Registro público: CERRADO. Crear cuentas: sudo bash deploy/linux/aula-produccion.sh crear-cuenta --correo … --nombre …\n'
  printf 'Copia previa de la configuración: %s\n' "$ACT"
}

revertir() {
  iniciar_registro
  local ACT; ACT=$(find "$STATE/activaciones" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1)
  [[ -n $ACT && -f $ACT/nginx-public.conf && -f $ACT/update.py ]] || falla 'No hay ninguna activación que revertir.'
  volver_web "$ACT"
  echo "Revertido con la copia de $ACT. La API y la base siguen en ejecución, sin acceso público; los datos se conservan."
}

# ============================================================== actualizar
actualizar() {
  local REV=${1:-}
  verificar_commit "$REV"
  iniciar_registro
  [[ -f $STATE/revision.txt ]] || falla 'Primero ejecuta «preparar».'
  local OLD; OLD=$(cat "$STATE/revision.txt")
  paso '1/4 Comprobaciones y respaldo'
  verificar_compilador
  en_ejecucion "$API_C" && esperar_api || falla 'La API actual no responde.'
  migraciones_compatibles "$REV"
  respaldo_ahora
  local ANT="$STATE/anteriores/$TS-${OLD:0:12}"
  install -d -m 700 "$ANT"
  cp -p "$STATE/compose.json" "$STATE/revision.txt" "$STATE/arbol-api.txt" "$ANT/"
  paso '2/4 Exportación y construcción'
  exportar "$REV" "$STATE/source.nuevo"
  docker build -q -t "$IMG:$REV" "$STATE/source.nuevo/services/aula-api" >/dev/null
  volver_api() {
    set +e
    echo '!! Fallo: se vuelve a la API anterior. La base NO se restaura.' >&2
    if [[ -f $ANT/nginx-public.conf ]]; then   # rutas públicas de la versión anterior
      cat "$ANT/nginx-public.conf" > "$PUB_CONF"
      docker exec "$PUB_C" nginx -t -q && docker exec "$PUB_C" nginx -s reload
    fi
    cp -p "$ANT/compose.json" "$STATE/compose.json"
    if [[ -d $ANT/source ]]; then rm -rf -- "$STATE/source.fallida"; mv "$STATE/source" "$STATE/source.fallida"; mv "$ANT/source" "$STATE/source"; fi
    "${DC[@]}" up -d --no-deps api
    esperar_api && echo "API anterior ($OLD) restablecida." >&2
    exit 1
  }
  trap volver_api ERR
  paso '3/4 Cambio de la API y migraciones'
  mv "$STATE/source" "$ANT/source"
  mv "$STATE/source.nuevo" "$STATE/source"
  verificar_compilador >/dev/null
  escribir_compose "$REV" "$SOCK_GID"
  "${DC[@]}" up -d --no-deps api
  esperar_api
  verificar_migraciones "$REV"
  if [[ -f $STATE/activado ]]; then   # lista cerrada de rutas públicas de esta versión (p. ej. /api/aula/cuenta/…)
    local PUERTA; PUERTA=$(puerta_tunel)
    cp -p "$PUB_CONF" "$ANT/nginx-public.conf"
    sed "s/__PUERTA_TUNEL__/$PUERTA/" "$STATE/source/deploy/linux/nginx-public-aula.conf" > "$ANT/nginx-public.conf.nuevo"
    if cmp -s "$ANT/nginx-public.conf.nuevo" "$PUB_CONF"; then
      echo 'Configuración nginx pública: sin cambios.'
    else
      cat "$ANT/nginx-public.conf.nuevo" > "$PUB_CONF"   # mismo archivo (montado en el contenedor)
      docker exec "$PUB_C" nginx -t -q
      docker exec "$PUB_C" nginx -s reload
      sleep 2
      echo "Configuración nginx pública actualizada (copia anterior: $ANT/nginx-public.conf)."
    fi
  fi
  paso '4/4 Prueba funcional'
  if [[ -f $STATE/activado ]]; then prueba_funcional tunel; else prueba_funcional interna; fi
  trap - ERR
  printf '%s\n' "$REV" > "$STATE/revision.txt"
  "${GIT[@]}" rev-parse "$REV:services/aula-api" > "$STATE/arbol-api.txt"
  instalar_respaldos   # script y temporizador de respaldo de esta versión
  bajas_verificar || true   # solo informa: sesiones, progreso y compilación no dependen del registro de bajas
  printf '\nAPI actualizada a %s. Anterior conservada: imagen %s:%s y %s\n' "$REV" "$IMG" "$OLD" "$ANT"
}

# ============================================================== cuentas, registro y respaldo
crear_cuenta() {
  local correo='' nombre=''
  while (($#)); do case $1 in --correo) correo=$2; shift 2;; --nombre) nombre=$2; shift 2;; *) falla "Opción desconocida: $1";; esac; done
  [[ -n $correo && -n $nombre ]] || falla 'Uso: crear-cuenta --correo CORREO --nombre "Nombre visible"'
  en_ejecucion "$API_C" || falla 'La API no está en ejecución.'
  local c1 c2
  IFS= read -r -s -p 'Contraseña inicial (mínimo 10 caracteres): ' c1 </dev/tty; echo
  IFS= read -r -s -p 'Repite la contraseña: ' c2 </dev/tty; echo
  [[ $c1 == "$c2" ]] || falla 'Las contraseñas no coinciden.'
  printf '%s\n' "$c1" | docker exec -i "$API_C" python -m app.cuentas crear --correo "$correo" --nombre "$nombre"
  unset c1 c2
}

fijar_env() {   # KEY=VALOR por la entrada estándar, una por línea; sustituye las existentes en api.env
  python3 -c '
import pathlib, sys
p = pathlib.Path(sys.argv[1])
nuevos = dict(l.split("=", 1) for l in sys.stdin.read().splitlines() if "=" in l)
for k, v in nuevos.items():
    assert k.replace("_", "").isalnum() and "\n" not in v, k
lineas = [l for l in p.read_text().splitlines() if l.split("=", 1)[0] not in nuevos]
p.write_text("\n".join(lineas + [f"{k}={v}" for k, v in nuevos.items()]) + "\n")' "$STATE/api.env"
}

recrear_api() {
  "${DC[@]}" up -d --no-deps --force-recreate api
  esperar_api
}

estado_registro() {   # 0 solo si el registro real puede abrirse (documentos aprobados vigentes y correo de producción)
  docker exec "$API_C" python -m app.documentos estado --produccion
}

registro() {
  local accion=${1:-}
  [[ $accion == abrir || $accion == cerrar || $accion == estado ]] || falla 'Uso: registro estado|abrir|cerrar'
  [[ -f $STATE/api.env ]] || falla 'El aula no está preparada.'
  if [[ $accion == estado ]]; then estado_registro || true; return; fi
  iniciar_registro
  if [[ $accion == abrir ]]; then
    grep -q '^AULA_PERMITIR_TEXTOS_PRUEBA=true' "$STATE/api.env" && falla 'api.env admite textos de prueba: no se abre el registro real.'
    estado_registro || falla 'No se abre: faltan documentos aprobados vigentes o la configuración de correo de producción (ver arriba).'
    echo 'AVISO: el registro abierto permite a cualquier ADULTO crear una cuenta con su correo.'
    echo 'Las personas que indican ser menores de edad no pueden registrarse (practican sin cuenta).'
    echo 'Los documentos vigentes (listados arriba) deben ser los textos definitivos aprobados por el responsable.'
    local resp; IFS= read -r -p 'Escribe ABRIR para confirmar: ' resp </dev/tty
    [[ $resp == ABRIR ]] || falla 'Cancelado.'
  fi
  local valor; valor=$([[ $accion == abrir ]] && echo true || echo false)
  printf 'AULA_REGISTRO_ABIERTO=%s\n' "$valor" | fijar_env
  recrear_api
  docker exec "$API_C" python -c "import json,urllib.request; print('Registro público abierto:', json.load(urllib.request.urlopen('http://127.0.0.1:8000/api/aula/config'))['registro_abierto'])"
}

instalar_salida_smtp() {
  local unidad=globalt-aula-smtp
  cat > "/etc/systemd/system/$unidad.socket" <<EOF
[Unit]
Description=Socket privado de correo del aula GLOBALT
[Socket]
ListenStream=$STATE/smtp/proveedor.sock
SocketGroup=root
ExecStartPost=/usr/bin/chgrp +10002 $STATE/smtp/proveedor.sock
SocketMode=0660
RemoveOnStop=yes
[Install]
WantedBy=sockets.target
EOF
  cat > "/etc/systemd/system/$unidad.service" <<EOF
[Unit]
Description=Conexión al proveedor SMTP del aula GLOBALT
Requires=$unidad.socket
After=network-online.target
[Service]
DynamicUser=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ExecStart=/usr/lib/systemd/systemd-socket-proxyd $1:$2
EOF
  chmod 0644 "/etc/systemd/system/$unidad."{socket,service}
  systemctl daemon-reload
  systemctl enable --now "$unidad.socket" || falla 'No se pudo activar el socket SMTP. Consulta journalctl -u globalt-aula-smtp.socket.'
  systemctl is-active --quiet "$unidad.socket" && [[ -S $STATE/smtp/proveedor.sock && $(stat -c %g:%a "$STATE/smtp/proveedor.sock") == 10002:660 ]] || falla 'El socket SMTP no está listo para la API.'
  systemctl try-restart "$unidad.service"
}

correo_cmd() {
  local accion=${1:-}; shift || true
  [[ -f $STATE/api.env ]] || falla 'El aula no está preparada.'
  en_ejecucion "$API_C" || falla 'La API no está en ejecución.'
  case $accion in
    configurar)
      iniciar_registro
      local host puerto tls usuario remitente c1 c2
      IFS= read -r -p 'Servidor SMTP (p. ej. smtp.proveedor.example): ' host </dev/tty
      IFS= read -r -p 'Puerto [587]: ' puerto </dev/tty; puerto=${puerto:-587}
      IFS= read -r -p 'Cifrado (starttls|ssl) [starttls]: ' tls </dev/tty; tls=${tls:-starttls}
      IFS= read -r -p 'Usuario SMTP: ' usuario </dev/tty
      IFS= read -r -p 'Remitente (p. ej. "Aula GLOBALT ROBOTICS <aula@dominio>"): ' remitente </dev/tty
      IFS= read -r -s -p 'Clave SMTP (oculta): ' c1 </dev/tty; echo
      IFS= read -r -s -p 'Repite la clave: ' c2 </dev/tty; echo
      [[ $c1 == "$c2" ]] || falla 'Las claves no coinciden.'
      [[ $host =~ ^[A-Za-z0-9.-]+$ && $puerto =~ ^[0-9]+$ && ( $tls == starttls || $tls == ssl ) && -n $remitente ]] \
        || falla 'Datos de correo no válidos (TLS obligatorio: starttls o ssl).'
      [[ $host =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ && ${#puerto} -le 5 ]] && (( 10#$puerto >= 1 && 10#$puerto <= 65535 )) || falla 'Destino SMTP inválido.'
      [[ -x /usr/lib/systemd/systemd-socket-proxyd ]] || falla 'Falta systemd-socket-proxyd.'
      grep -q '/smtp/proveedor.sock' "$STATE/compose.json" || falla 'Actualiza primero el despliegue del aula.'
      instalar_salida_smtp "$host" "$puerto"
      printf 'AULA_CORREO_MODO=smtp\nAULA_SMTP_HOST=%s\nAULA_SMTP_PUERTO=%s\nAULA_SMTP_TLS=%s\nAULA_SMTP_USUARIO=%s\nAULA_SMTP_CLAVE=%s\nAULA_CORREO_REMITENTE=%s\nAULA_URL_PUBLICA=https://globalt-robotics.com\n' \
        "$host" "$puerto" "$tls" "$usuario" "$c1" "$remitente" | fijar_env
      unset c1 c2
      recrear_api
      echo 'Correo configurado (la clave no se muestra). Pruébalo con: correo probar --a <tu correo>'
      ;;
    desactivar)
      iniciar_registro
      printf 'AULA_CORREO_MODO=desactivado\nAULA_REGISTRO_ABIERTO=false\n' | fijar_env
      recrear_api
      if [[ -f /etc/systemd/system/globalt-aula-smtp.socket ]]; then
        systemctl disable --now globalt-aula-smtp.socket
        systemctl stop globalt-aula-smtp.service
      fi
      echo 'Correo desactivado y registro cerrado. La recuperación por correo queda no disponible.'
      ;;
    probar)
      [[ ${1:-} == --a && -n ${2:-} ]] || falla 'Uso: correo probar --a CORREO'
      docker exec -i "$API_C" python - "$2" <<'PY'
import sys
from app import config, correo
try:
    correo.enviar(config.cargar(), sys.argv[1], 'Prueba de correo · Aula GLOBALT ROBOTICS',
                  'Mensaje de prueba de la configuración de correo del Aula. No requiere ninguna acción.', 'prueba')
except correo.ErrorEnvio as e:
    sys.exit(f'No se pudo enviar ({e}).')
print('Correo de prueba entregado al servidor SMTP.')
PY
      ;;
    *) falla 'Uso: correo configurar|desactivar|probar --a CORREO' ;;
  esac
}

documentos_cmd() {
  local accion=${1:-}; shift || true
  en_ejecucion "$API_C" || falla 'La API no está en ejecución.'
  local tipo='' version='' titulo='' finalidad='' archivo=''
  while (($#)); do case $1 in
    --tipo) tipo=$2; shift 2;; --version) version=$2; shift 2;; --titulo) titulo=$2; shift 2;;
    --finalidad) finalidad=$2; shift 2;; --archivo) archivo=$2; shift 2;; *) falla "Opción desconocida: $1";; esac; done
  case $accion in
    listar) docker exec "$API_C" python -m app.documentos listar ;;
    cargar)
      [[ -n $tipo && -n $version && -n $titulo && -n $finalidad && -f $archivo ]] \
        || falla 'Uso: documentos cargar --tipo terminos|datos --version V --titulo T --finalidad F --archivo texto.md'
      iniciar_registro
      echo "Texto: $archivo (sha256 $(sha256sum "$archivo" | cut -d' ' -f1))"
      echo 'Solo se cargan textos DEFINITIVOS aprobados por el responsable. Una versión cargada no se modifica.'
      local resp; IFS= read -r -p 'Escribe APROBADO para confirmar: ' resp </dev/tty
      [[ $resp == APROBADO ]] || falla 'Cancelado.'
      docker exec -i "$API_C" python -m app.documentos cargar --tipo "$tipo" --version "$version" \
        --titulo "$titulo" --finalidad "$finalidad" --aprobado < "$archivo"
      ;;
    activar)
      [[ -n $tipo && -n $version ]] || falla 'Uso: documentos activar --tipo terminos|datos --version V'
      iniciar_registro
      echo 'Al activar una versión, las cuentas que no la hayan aceptado deberán aceptarla en su próximo acceso.'
      local resp; IFS= read -r -p 'Escribe ACTIVAR para confirmar: ' resp </dev/tty
      [[ $resp == ACTIVAR ]] || falla 'Cancelado.'
      docker exec "$API_C" python -m app.documentos activar --tipo "$tipo" --version "$version"
      ;;
    *) falla 'Uso: documentos listar|cargar|activar …' ;;
  esac
}

# ============================================================== registro externo de bajas
# El montaje remoto (NFS, SMB o SSHFS) y sus credenciales los define el administrador en el anfitrión
# (fstab o unidad .mount, credenciales en un archivo de root). Este script nunca recibe ni guarda credenciales:
# solo comprueba que la ruta es el montaje esperado y lo lleva a la API como volumen.
bajas_leer() {   # define B_RUTA B_FUENTE B_TIPO B_ID desde bajas.conf; 1 si no hay destino configurado
  [[ -f $BAJAS_CONF ]] || return 1
  B_RUTA=$(sed -n 's/^RUTA=//p' "$BAJAS_CONF"); B_FUENTE=$(sed -n 's/^FUENTE=//p' "$BAJAS_CONF")
  B_TIPO=$(sed -n 's/^TIPO=//p' "$BAJAS_CONF"); B_ID=$(sed -n 's/^ID=//p' "$BAJAS_CONF")
  [[ -n $B_RUTA && -n $B_FUENTE && -n $B_TIPO ]] || falla "$BAJAS_CONF incompleto."
}

bajas_guardar() {   # RUTA FUENTE TIPO ID (vacío mientras el registro no esté inicializado)
  printf 'RUTA=%s\nFUENTE=%s\nTIPO=%s\nID=%s\n' "$@" > "$BAJAS_CONF.nuevo"
  chmod 600 "$BAJAS_CONF.nuevo"; mv "$BAJAS_CONF.nuevo" "$BAJAS_CONF"
}

montaje_actual() {   # «ORIGEN TIPO» del montaje superior en exactamente esa ruta (vacío si no hay ninguno)
  timeout 15 findmnt -n -M "$1" -o SOURCE,FSTYPE 2>/dev/null | tail -1 | tr -s ' ' || true
}

identidad_host() {   # identificador de la marca vista desde el anfitrión (vacío si falta o no es válida)
  local m; m=$(timeout 15 cat -- "$1/.aula-registro-bajas" 2>/dev/null) || return 0
  [[ $m =~ ^aula-registro-bajas\ v1$'\n'id=([0-9a-f-]{36})$ ]] && printf '%s' "${BASH_REMATCH[1]}"
  return 0
}

bajas_bloqueo() {
  echo "Bajas: BLOQUEADAS. $*" >&2
  echo 'Avisar al operador: no ejecutar bajas hasta corregirlo (ver docs/AULA_INACTIVIDAD.md).' >&2
}

# 0: habilitadas y en orden; 1: habilitadas con operaciones inciertas o problemas en el diario;
# 2: bloqueadas (sin montaje esperado, otro registro, API que no lo ve o sin escritura); 3: deshabilitadas.
bajas_verificar() {
  if ! bajas_leer; then echo 'Bajas: DESHABILITADAS (sin registro externo configurado). El resto del aula funciona.'; return 3; fi
  local real id nonce rc=0
  [[ -n $B_ID ]] || { bajas_bloqueo 'El registro no llegó a inicializarse. Repite «bajas configurar».'; return 2; }
  real=$(montaje_actual "$B_RUTA")
  [[ $real == "$B_FUENTE $B_TIPO" ]] \
    || { bajas_bloqueo "$B_RUTA no es el montaje esperado ($B_FUENTE, $B_TIPO). Encontrado: ${real:-ninguno (carpeta local)}."; return 2; }
  id=$(identidad_host "$B_RUTA")
  [[ $id == "$B_ID" ]] || { bajas_bloqueo "El montaje no contiene el registro $B_ID (encontrado: ${id:-ninguno})."; return 2; }
  en_ejecucion "$API_C" || { bajas_bloqueo 'La API no está en ejecución.'; return 2; }
  # Prueba cruzada: un archivo creado desde el anfitrión debe verse dentro de la API (mismo registro, no una copia).
  nonce=".prueba-anfitrion-$(date +%s%N)-$RANDOM"
  timeout 15 sh -c ': > "$1"' sh "${B_RUTA:?}/${nonce:?}" || { bajas_bloqueo 'El anfitrión no puede escribir en el registro.'; return 2; }
  docker exec "$API_C" python -c 'import os, sys; sys.exit(0 if os.path.exists(sys.argv[1]) else 1)' "$BAJAS_API/$nonce" || rc=1
  timeout 15 rm -f -- "${B_RUTA:?}/${nonce:?}" || true
  ((rc == 0)) || { bajas_bloqueo 'La API no ve el mismo registro que el anfitrión. Ejecuta «bajas reconectar».'; return 2; }
  docker exec "$API_C" python -m app.registro_bajas comprobar || rc=$?
  ((rc != 2)) || { bajas_bloqueo 'La API no puede usar el registro (ver el error anterior).'; return 2; }
  if ((rc == 0)); then
    echo "Bajas: HABILITADAS. Registro $B_ID en $B_FUENTE ($B_TIPO)."
  else
    echo 'Bajas: habilitadas, con operaciones inciertas o problemas en el registro. Revisar con «bajas resolver».' >&2
  fi
  return "$rc"
}

bajas_configurar() {
  local ruta='' fuente='' tipo='' inicializar=no previo='' real id
  while (($#)); do case $1 in
    --ruta) ruta=$2; shift 2;; --fuente) fuente=$2; shift 2;; --tipo) tipo=$2; shift 2;;
    --inicializar) inicializar=si; shift;; *) falla "Opción desconocida: $1";; esac; done
  [[ $ruta =~ ^/[A-Za-z0-9._/-]+[A-Za-z0-9._-]$ && $ruta != *..* && $ruta != "$STATE"* && -n $fuente && -n $tipo ]] \
    || falla 'Uso: bajas configurar --ruta /punto/de/montaje --fuente ORIGEN --tipo nfs4|nfs|cifs|smb3|fuse.sshfs [--inicializar]'
  [[ " $BAJAS_TIPOS " == *" $tipo "* ]] || falla "Tipo no admitido: $tipo (solo almacenamiento remoto: $BAJAS_TIPOS)."
  local valido='^[][A-Za-z0-9._@:/-]+$' con_clave='^[^@/]*:[^@/]*@'   # IPv6 entre corchetes admitida
  [[ $fuente =~ $valido ]] || falla 'Origen del montaje no válido.'
  [[ $fuente =~ $con_clave ]] && falla 'El origen no debe incluir contraseñas: van en el archivo de credenciales del montaje.'
  [[ -f $STATE/revision.txt ]] && en_ejecucion "$API_C" || falla 'El aula no está preparada o la API no está en ejecución.'
  iniciar_registro
  paso '1/4 Montaje en el anfitrión'
  real=$(montaje_actual "$ruta")
  [[ $real == "$fuente $tipo" ]] || falla "$ruta no está montado desde $fuente ($tipo). Encontrado: ${real:-ninguno}. Monta primero el almacenamiento remoto."
  id=$(identidad_host "$ruta")
  if [[ $inicializar == si ]]; then
    [[ -z $(timeout 15 find "$ruta" -mindepth 1 -maxdepth 1 ! -name lost+found -print -quit) ]] \
      || falla "--inicializar solo para un registro NUEVO en una carpeta vacía; $ruta tiene contenido."
  else
    [[ -n $id ]] || falla "$ruta no contiene un registro de bajas. Si es un registro NUEVO y vacío, repite con --inicializar; si debía tenerlo, el montaje no es el correcto."
  fi
  echo "Montaje: $fuente ($tipo) en $ruta"
  paso '2/4 Volumen para la API (bajas aún deshabilitadas)'
  if [[ -f $BAJAS_CONF ]]; then previo=$(cat "$BAJAS_CONF"); fi
  local REV; REV=$(cat "$STATE/revision.txt")
  verificar_compilador >/dev/null
  deshacer_bajas() {
    set +e
    echo '!! Fallo: se restablece la configuración de bajas anterior.' >&2
    if [[ -n $previo ]]; then printf '%s\n' "$previo" > "$BAJAS_CONF"; else mv -f "$BAJAS_CONF" "$BAJAS_CONF.fallida-$TS"; fi
    escribir_compose "$REV" "$SOCK_GID" && recrear_api
    exit 1
  }
  trap deshacer_bajas ERR
  bajas_guardar "$ruta" "$fuente" "$tipo" ''
  escribir_compose "$REV" "$SOCK_GID"
  recrear_api
  if [[ $inicializar == si ]]; then
    paso '3/4 Inicialización explícita del registro nuevo'
    docker exec -e AULA_BAJAS_REGISTRO="$BAJAS_API" "$API_C" python -m app.registro_bajas inicializar
    id=$(identidad_host "$ruta")
    [[ -n $id ]]
  else
    paso '3/4 Registro existente'
    echo "Registro $id"
  fi
  paso '4/4 Habilitación y comprobación cruzada anfitrión/API'
  bajas_guardar "$ruta" "$fuente" "$tipo" "$id"
  escribir_compose "$REV" "$SOCK_GID"
  recrear_api
  local rc=0; bajas_verificar || rc=$?
  ((rc <= 1))      # 1 = registro existente con operaciones por resolver: habilitado, pero se avisa arriba
  trap - ERR
  echo "Configuración guardada en $BAJAS_CONF (sin credenciales). Identificador del registro: $id. Anótalo fuera del servidor."
}

bajas_deshabilitar() {
  iniciar_registro
  bajas_leer || { echo 'Las bajas ya estaban deshabilitadas.'; return 0; }
  local REV; REV=$(cat "$STATE/revision.txt")
  verificar_compilador >/dev/null
  mv "$BAJAS_CONF" "$BAJAS_CONF.deshabilitado-$TS"
  escribir_compose "$REV" "$SOCK_GID"
  recrear_api
  echo 'Bajas deshabilitadas. La API ya no monta el registro y «eliminar» se niega. El registro remoto no se modifica.'
  echo "Configuración anterior (con su identificador): $BAJAS_CONF.deshabilitado-$TS"
}

bajas_cmd() {
  local accion=${1:-} rc=0; shift || true
  [[ -f $STATE/revision.txt ]] || falla 'El aula no está preparada.'
  case $accion in
    estado|comprobar) bajas_verificar ;;
    configurar) bajas_configurar "$@" ;;
    reconectar)   # tras volver a montar el registro: la API recrea su volumen desde el anfitrión
      iniciar_registro
      bajas_leer || falla 'No hay registro de bajas configurado.'
      [[ -n $B_ID && $(montaje_actual "$B_RUTA") == "$B_FUENTE $B_TIPO" && $(identidad_host "$B_RUTA") == "$B_ID" ]] \
        || falla "El anfitrión todavía no monta el registro $B_ID desde $B_FUENTE en $B_RUTA."
      recrear_api
      bajas_verificar ;;
    deshabilitar) bajas_deshabilitar ;;
    eliminar|resolver)
      [[ $accion == resolver || ${1:-} =~ ^[0-9a-f-]{36}$ ]] || falla 'Uso: bajas eliminar REFERENCIA'
      iniciar_registro
      bajas_verificar || rc=$?
      # Con operaciones inciertas (1) solo se permite resolverlas; cualquier bloqueo detiene ambas.
      if ((rc != 0)) && ! [[ $accion == resolver && $rc == 1 ]]; then
        falla 'Bajas detenidas: el registro externo no está disponible, no es el esperado o tiene operaciones por resolver.'
      fi
      docker exec "$API_C" python -m app.inactividad "$accion" "$@" ;;
    *) falla 'Uso: bajas estado|configurar|comprobar|reconectar|deshabilitar|eliminar REFERENCIA|resolver' ;;
  esac
}

case $ORDEN in
  preparar) preparar "$@" ;;
  comprobar) comprobar ;;
  activar) activar "$@" ;;
  revertir) revertir ;;
  actualizar) actualizar "$@" ;;
  crear-cuenta) crear_cuenta "$@" ;;
  registro) registro "$@" ;;
  correo) correo_cmd "$@" ;;
  documentos) documentos_cmd "$@" ;;
  respaldo) iniciar_registro; respaldo_ahora ;;
  bajas) bajas_cmd "$@" ;;
  *) sed -n '2,18p' "$SELF"; exit 1 ;;
esac
