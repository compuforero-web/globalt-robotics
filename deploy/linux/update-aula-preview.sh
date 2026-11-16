#!/usr/bin/env bash
# Actualiza el aula privada YA INSTALADA (proyecto Compose globalt-aula-piloto) a un commit concreto.
# Conserva cuentas, inscripciones, credenciales, redes y proxy. Solo reconstruye la API y sincroniza
# los archivos web. No borra volúmenes, no cambia puertos ni toca otros proyectos.
#
# Uso (desde una copia del repositorio en ese commit):
#   sudo bash deploy/linux/update-aula-preview.sh <commit de 40 caracteres>
#
# Pasos: 1) verifica la instalación y se detiene ante diferencias; 2) respaldo comprobado de PostgreSQL
# y de la configuración; 3) exporta el commit, construye la imagen de la API y sincroniza la web;
# 4) la API aplica las migraciones pendientes al arrancar (mecanismo existente, con suma de control);
# 5) comprueba página, salud, borradores y una compilación real con una cuenta ficticia propia que luego elimina.
# Compilación: la API del aula usa el compilador EXISTENTE (contenedor globalt-arduino-compiler, sin red) por su
# socket Unix. Se monta solo la carpeta del socket, en solo lectura, y la API recibe el grupo que ya tiene el
# socket. No se cambian el compilador, sus permisos ni los laboratorios 8094/8097; no se monta el socket de Docker.
# Si algo falla tras el cambio, vuelve automáticamente a la API y web anteriores. La base de datos
# NUNCA se restaura automáticamente. Recuperación: RECUPERACION.txt dentro de cada respaldo.
# Se puede repetir: no duplica migraciones ni pierde datos.
set -Eeuo pipefail
umask 077
export LC_ALL=C

STATE=/var/lib/globalt-robotics-aula-preview
NAME=globalt-aula-piloto
PORT=8100
NETBIRD=100.117.79.42
BASE="http://127.0.0.1:$PORT"
DB_C="$NAME-db"; API_C="$NAME-api"; WEB_C="$NAME-web"
COMP_C=globalt-arduino-compiler
SOCKET_DIR=/var/lib/globalt-robotics-lab/run
SOCKET_API=/compilador            # destino del montaje dentro de la API

falla() { echo "ERROR: $*" >&2; exit 1; }
paso() { printf '\n== %s\n' "$*"; }

[[ $EUID -eq 0 ]] || falla 'Ejecuta con sudo bash.'
REV=${1:-}
[[ $REV =~ ^[0-9a-f]{40}$ ]] || falla 'Indica el commit completo (40 caracteres hexadecimales).'
REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SELF=$(readlink -f -- "${BASH_SOURCE[0]}")
GIT=(git -c safe.directory="$REPO" -C "$REPO")
for tool in docker git python3 curl tar sha256sum flock df; do command -v "$tool" >/dev/null || falla "Falta $tool"; done
docker info >/dev/null 2>&1 || falla 'Docker no responde.'
docker compose version >/dev/null 2>&1 || falla 'Falta docker compose.'

[[ -d $STATE ]] || falla "No existe $STATE: este script solo actualiza una instalación existente."
cd "$STATE"
exec 9>"$STATE/.actualizacion.lock"
flock -n 9 || falla 'Ya hay otra actualización en curso.'
TS=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$STATE/registros"
LOG="$STATE/registros/actualizacion-$TS.log"
exec > >(tee -a "$LOG") 2>&1
echo "Actualización del aula privada · $TS · destino $REV"
DC=(docker compose -f "$STATE/compose.json")

# Base de datos: se usan las variables del propio contenedor; nunca se imprimen credenciales.
sql() { docker exec -i "$DB_C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}"' sh "${1:-}"; }

# ---------------------------------------------------------------- 1. Verificación
paso '1/5 Verificación de la instalación y del commit'
trap 'echo "Detenido durante la verificación: no se modificó nada. Revisa $LOG" >&2' ERR
"${GIT[@]}" cat-file -e "$REV^{commit}" 2>/dev/null || falla "El commit $REV no está en $REPO (ejecuta git fetch)."
"${GIT[@]}" show "$REV:deploy/linux/update-aula-preview.sh" | cmp -s - "$SELF" \
  || falla 'Este script no coincide con el del commit indicado. Ejecuta la copia de ese mismo commit.'
for f in services/aula-api/Dockerfile services/aula-api/app/main.py services/aula-api/app/migraciones.py \
         services/aula-api/app/compilador.py aula/index.html games/laboratorio-arduino/index.html \
         games/laboratorio-arduino/src/cuenta.js; do
  "${GIT[@]}" cat-file -e "$REV:$f" 2>/dev/null || falla "El commit no contiene $f."
done
for f in compose.json api.env db.env nginx.conf revision.txt; do [[ -f $f ]] || falla "Falta $STATE/$f."; done
for d in site source; do [[ -d $d ]] || falla "Falta $STATE/$d/."; done
OLD=$(tr -d '[:space:]' < revision.txt)
[[ $OLD =~ ^[0-9a-f]{40}$ ]] || falla 'revision.txt no contiene un commit válido.'
echo "Versión instalada: $OLD"

for dir in "$STATE" "$(docker info -f '{{.DockerRootDir}}')"; do
  libre=$(df -Pk "$dir" | awk 'NR==2 {print $4}')
  (( libre > 2 * 1024 * 1024 )) || falla "Menos de 2 GB libres en $dir."
done

# Compilador existente: solo se comprueba; no se modifica.
[[ -d $SOCKET_DIR && ! -L $SOCKET_DIR ]] || falla "No existe la carpeta del socket $SOCKET_DIR."
[[ -S $SOCKET_DIR/compilador.sock && ! -L $SOCKET_DIR/compilador.sock ]] || falla 'No existe el socket del compilador.'
read -r SOCK_UID SOCK_GID SOCK_MODO < <(stat -c '%u %g %a' "$SOCKET_DIR/compilador.sock")
read -r DIR_UID DIR_GID DIR_MODO < <(stat -c '%u %g %a' "$SOCKET_DIR")
[[ $SOCK_UID == 10001 && $SOCK_MODO == 660 && $DIR_UID == 10001 && $DIR_GID == "$SOCK_GID" && $DIR_MODO == 770 ]] \
  || falla "Permisos del socket inesperados ($SOCK_UID:$SOCK_GID $SOCK_MODO, carpeta $DIR_UID:$DIR_GID $DIR_MODO)."
[[ $SOCK_GID =~ ^[0-9]+$ && $SOCK_GID != 0 ]] || falla 'El grupo del socket no es válido.'
python3 - "$COMP_C" "$SOCKET_DIR" <<'PY' || falla 'El contenedor del compilador no coincide con lo esperado; no se modificó nada.'
import json, subprocess, sys
nombre, carpeta = sys.argv[1:]
c = json.loads(subprocess.run(['docker', 'inspect', nombre], capture_output=True, check=True).stdout)[0]
assert c['State']['Running'], 'el compilador no está en ejecución'
assert c['HostConfig']['NetworkMode'] == 'none', 'el compilador debe seguir sin red'
assert c['HostConfig']['ReadonlyRootfs'] and 'ALL' in (c['HostConfig']['CapDrop'] or []), 'aislamiento del compilador'
assert not any(m['Source'] == '/var/run/docker.sock' or m['Source'] == '/run/docker.sock' for m in c['Mounts'])
assert any(m['Source'] == carpeta for m in c['Mounts']), 'el compilador no usa la carpeta del socket'
print('Compilador existente (sin red, solo lectura, socket propio): OK')
PY
salud_comp=$(curl -fsS --max-time 5 --unix-socket "$SOCKET_DIR/compilador.sock" http://localhost/api/arduino/salud || true)
[[ $salud_comp == *'"ok": true'* || $salud_comp == *'"ok":true'* ]] || falla 'El compilador existente no responde sano; no se modificó nada.'

python3 - "$STATE" "$OLD" "$NAME" "$PORT" "$NETBIRD" "$SOCKET_DIR" "$SOCKET_API" "$SOCK_GID" <<'PY' || falla 'compose.json no coincide con la instalación esperada; no se modificó nada.'
import json, pathlib, sys
state, old, name, port, netbird, sdir, sapi, sgid = sys.argv[1:]
c = json.loads(pathlib.Path(state, 'compose.json').read_text())
s = c['services']
assert c['name'] == name and set(s) == {'db', 'api', 'web'}, 'proyecto o servicios'
for r in s: assert s[r]['container_name'] == f'{name}-{r}', r
assert c['networks'] == {'aislada': {'internal': True}, 'entrada': {}}, 'redes'
assert s['web']['networks'] == ['aislada', 'entrada'], 'redes web'
assert s['api']['networks'] == ['aislada'] and s['db']['networks'] == ['aislada'], 'redes api/db'
assert s['web']['ports'] == [f'127.0.0.1:{port}:80', f'{netbird}:{port}:80'], 'puertos web'
assert 'ports' not in s['api'] and 'ports' not in s['db'], 'puertos api/db'
assert s['web']['volumes'] == ['./nginx.conf:/etc/nginx/conf.d/default.conf:ro', './site:/srv/sitio:ro'], 'montajes web'
assert s['db']['volumes'] == ['datos:/var/lib/postgresql/data'], 'volumen db'
assert s['api']['build'] == {'context': 'source/services/aula-api'}, 'build api'
assert s['api']['image'] == f'globalt-aula-api:{old}', 'imagen api distinta de revision.txt'
assert s['api']['env_file'] == ['api.env'] and s['db']['env_file'] == ['db.env'], 'env_file'
# Antes de integrar el compilador la API no tiene montajes; después, solo la carpeta del socket.
conocidas = {'read_only', 'tmpfs', 'cap_drop', 'security_opt', 'init', 'restart', 'logging', 'networks', 'build',
             'image', 'container_name', 'env_file', 'mem_limit', 'cpus', 'pids_limit', 'depends_on'}
compilador = {'volumes': [f'{sdir}:{sapi}:ro'], 'group_add': [sgid],
              'environment': {'AULA_COMPILADOR_SOCKET': f'{sapi}/compilador.sock'}}
extra = {k: v for k, v in s['api'].items() if k not in conocidas}
assert extra in ({}, compilador), f'opciones inesperadas en la API: {sorted(extra)}'
assert s['api']['read_only'] is True and s['api']['cap_drop'] == ['ALL'], 'aislamiento de la API'
print('compose.json: OK' + (' (compilador ya integrado)' if extra else ''))
PY
"${DC[@]}" config --quiet || falla 'docker compose no acepta compose.json.'

# Comprueba los contenedores reales. Con «después» exige además que web y db no se hayan recreado.
comprobar_contenedores() {
  docker inspect "$WEB_C" "$API_C" "$DB_C" > "$STATE/.inspeccion.json" || return 1
  docker network inspect "${NAME}_aislada" "${NAME}_entrada" > "$STATE/.redes.json" || return 1
  python3 - "$STATE" "$NAME" "$PORT" "$NETBIRD" "${1:-}" <<'PY'
import json, pathlib, sys
state, name, port, netbird, momento = sys.argv[1:]
st = pathlib.Path(state)
ins = {c['Name'].lstrip('/'): c for c in json.loads((st / '.inspeccion.json').read_text())}
redes = {n['Name']: n for n in json.loads((st / '.redes.json').read_text())}
assert redes[f'{name}_aislada']['Internal'] is True, 'la red aislada debe ser interna'
compose = json.loads((st / 'compose.json').read_text())
esperado = {'web': {f'{name}_aislada', f'{name}_entrada'}, 'api': {f'{name}_aislada'}, 'db': {f'{name}_aislada'}}
for rol, redes_rol in esperado.items():
    c = ins[f'{name}-{rol}']
    assert c['State']['Running'], f'{rol} no está en ejecución'
    etiquetas = c['Config']['Labels'] or {}
    assert etiquetas.get('com.docker.compose.project') == name, f'{rol}: otro proyecto'
    assert etiquetas.get('com.docker.compose.service') == rol, f'{rol}: otro servicio'
    assert set(c['NetworkSettings']['Networks']) == redes_rol, f'{rol}: redes {sorted(c["NetworkSettings"]["Networks"])}'
    if rol != 'web':
        assert not any(c['HostConfig'].get('PortBindings') or {}), f'{rol} publica puertos'
api_montajes = [(m['Type'], m['Source'], m['Destination'], m['RW']) for m in ins[f'{name}-api']['Mounts']]
assert api_montajes in ([], [('bind', '/var/lib/globalt-robotics-lab/run', '/compilador', False)]), f'montajes API {api_montajes}'
web = ins[f'{name}-web']
pub = {(b['HostIp'], b['HostPort']) for b in web['HostConfig']['PortBindings']['80/tcp']}
assert pub == {('127.0.0.1', port), (netbird, port)}, f'puertos web {pub}'
montajes = {m['Destination']: m['Source'] for m in web['Mounts']}
assert montajes.get('/srv/sitio') == str(st / 'site'), 'montaje del sitio'
assert montajes.get('/etc/nginx/conf.d/default.conf') == str(st / 'nginx.conf'), 'montaje de nginx.conf'
db = ins[f'{name}-db']
assert (db['State'].get('Health') or {}).get('Status') == 'healthy', 'PostgreSQL no está sano'
assert ins[f'{name}-api']['Config']['Image'] == compose['services']['api']['image'], 'la API no usa la imagen de compose.json'
ip_web = web['NetworkSettings']['Networks'][f'{name}_aislada']['IPAddress']
confiable = [l.split('=', 1)[1] for l in (st / 'api.env').read_text().splitlines() if l.startswith('FORWARDED_ALLOW_IPS=')]
assert confiable == [ip_web], 'FORWARDED_ALLOW_IPS no coincide con la IP de nginx'
huella = {r: ins[f'{name}-{r}']['Id'] for r in ('web', 'db')}
ref = st / '.contenedores-antes.json'
if momento == 'despues':
    assert json.loads(ref.read_text()) == huella, 'web o db se recrearon'
else:
    ref.write_text(json.dumps(huella))
print('Contenedores, redes, puertos y proxy: OK')
PY
}
comprobar_contenedores || falla 'Los contenedores no coinciden con la instalación esperada; no se modificó nada.'
salud=$(curl -fsS --max-time 5 "$BASE/api/aula/salud" || true)
[[ $salud == *'"ok":true'* ]] || falla 'La API instalada no responde sana.'
curl -fsS --max-time 5 -o /dev/null "$BASE/aula/" || falla 'La página del aula no responde.'
docker image inspect "globalt-aula-api:$OLD" >/dev/null 2>&1 || falla "No existe la imagen anterior globalt-aula-api:$OLD."

# Migraciones: las ya aplicadas deben existir sin cambios en el commit destino.
"${GIT[@]}" ls-tree --name-only "$REV" services/aula-api/migrations/ | grep -E '\.sql$' | sort > "$STATE/.migraciones-destino"
: > "$STATE/.migraciones-destino.sumas"
while read -r f; do
  printf '%s %s\n' "$(basename "$f" .sql)" "$("${GIT[@]}" show "$REV:$f" | sha256sum | cut -d' ' -f1)" >> "$STATE/.migraciones-destino.sumas"
done < "$STATE/.migraciones-destino"
grep -q '_borradores ' "$STATE/.migraciones-destino.sumas" || falla 'El commit no incluye la migración de borradores.'
echo 'SELECT version, suma FROM esquema_migraciones ORDER BY version' | sql | tr '|' ' ' > "$STATE/.migraciones-aplicadas"
[[ -s $STATE/.migraciones-aplicadas ]] || falla 'No se pudo leer esquema_migraciones.'
while read -r version suma; do
  grep -qx "$version $suma" "$STATE/.migraciones-destino.sumas" \
    || falla "La migración aplicada $version no existe o cambió en el commit destino; la API no arrancaría."
done < "$STATE/.migraciones-aplicadas"
PENDIENTES=$(cut -d' ' -f1 "$STATE/.migraciones-destino.sumas" | grep -vxF -f <(cut -d' ' -f1 "$STATE/.migraciones-aplicadas") || true)
echo "Migraciones aplicadas: $(cut -d' ' -f1 "$STATE/.migraciones-aplicadas" | tr '\n' ' ')"
echo "Migraciones pendientes: ${PENDIENTES:-ninguna}"

# ---------------------------------------------------------------- 2. Respaldo comprobado
paso '2/5 Respaldo comprobado de PostgreSQL y de la configuración'
BK="$STATE/respaldos/$TS-${OLD:0:12}-a-${REV:0:12}"
install -d -m 700 "$STATE/respaldos" "$BK"
ANT="$STATE/anteriores/$TS-${OLD:0:12}"   # copia de source/ y site/ anteriores
VERIF="aula_verificacion_$$"
limpiar_verificacion() { docker exec "$DB_C" sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' sh "$VERIF" >/dev/null 2>&1 || true; }
trap 'limpiar_verificacion; echo "Respaldo fallido: NO se modificó la instalación. Revisa $LOG" >&2; touch "$BK/INCOMPLETO"' ERR

CONTEO="SELECT 'usuarios', count(*) FROM usuarios UNION ALL SELECT 'inscripciones', count(*) FROM inscripciones
UNION ALL SELECT 'cursos', count(*) FROM cursos UNION ALL SELECT 'esquema_migraciones', count(*) FROM esquema_migraciones"
CONTEO_B="$CONTEO UNION ALL SELECT 'borradores', count(*) FROM borradores"
[[ $(echo "SELECT to_regclass('public.borradores') IS NOT NULL" | sql) == t ]] && CONTEO=$CONTEO_B
echo "$CONTEO" | sql > "$BK/conteo-antes.txt"
docker exec "$DB_C" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BK/aula.dump"
echo "$CONTEO" | sql > "$BK/conteo-despues.txt"
[[ -s $BK/aula.dump ]]
docker exec -i "$DB_C" sh -c 'pg_restore -l' < "$BK/aula.dump" > "$BK/aula.dump.indice"
for tabla in usuarios sesiones inscripciones cursos esquema_migraciones; do
  grep -q "TABLE DATA public $tabla " "$BK/aula.dump.indice" || { echo "El respaldo no contiene $tabla" >&2; false; }
done
# Restauración de prueba en una base temporal del mismo servidor (no toca la base «aula»).
limpiar_verificacion
docker exec "$DB_C" sh -c 'createdb -U "$POSTGRES_USER" "$1"' sh "$VERIF"
docker exec -i "$DB_C" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error' sh "$VERIF" < "$BK/aula.dump"
echo "$CONTEO" | sql "$VERIF" > "$BK/conteo-restaurado.txt"
limpiar_verificacion
python3 - "$BK" <<'PY'
import pathlib, sys
bk = pathlib.Path(sys.argv[1])
leer = lambda n: dict((k, int(v)) for k, v in (l.split('|') for l in (bk / n).read_text().split()))
antes, despues, rest = leer('conteo-antes.txt'), leer('conteo-despues.txt'), leer('conteo-restaurado.txt')
for tabla in antes:
    assert antes[tabla] <= rest[tabla] <= despues[tabla], f'{tabla}: {antes[tabla]} <= {rest[tabla]} <= {despues[tabla]}'
print('Restauración de prueba: ' + ', '.join(f'{k}={v}' for k, v in rest.items()))
PY
tar -C "$STATE" -cf "$BK/configuracion.tar" compose.json api.env db.env nginx.conf revision.txt site
tar -tf "$BK/configuracion.tar" > "$BK/configuracion.indice"
for f in compose.json api.env db.env nginx.conf revision.txt site/aula/index.html; do
  grep -qx "$f" "$BK/configuracion.indice" || { echo "Falta $f en el respaldo" >&2; false; }
done
docker image inspect "globalt-aula-api:$OLD" -f '{{.Id}}' > "$BK/imagen-api-anterior.txt"
docker tag "globalt-aula-api:$OLD" "globalt-aula-api:anterior-${OLD:0:12}"
printf '%s\n' "$OLD" > "$BK/revision-anterior.txt"
(cd "$BK" && sha256sum aula.dump configuracion.tar > SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
cat > "$BK/RECUPERACION.txt" <<EOF
Respaldo previo a actualizar el aula de ${OLD} a ${REV} (${TS}).
Contenido: aula.dump (pg_dump -Fc, comprobado restaurándolo en una base temporal), configuracion.tar
(compose.json, api.env, db.env, nginx.conf, revision.txt y site/; contiene credenciales: no copiar fuera
de este servidor), imagen anterior de la API: globalt-aula-api:${OLD} (también anterior-${OLD:0:12}).

A) Volver a la API y web anteriores SIN tocar la base (lo que hace el script si falla una comprobación):
   cd ${STATE}
   sudo tar -xf ${BK}/configuracion.tar compose.json revision.txt
   # Solo si existe ${ANT}/source (no existe cuando se repitió la misma versión):
   sudo mv source source-fallida-\$(date +%s) && sudo mv ${ANT}/source source
   sudo tar -xf ${BK}/configuracion.tar site     # sobrescribe los archivos web en su sitio
   sudo docker compose -f compose.json up -d --no-deps api
   Las migraciones nuevas quedan aplicadas: la API anterior las ignora y sus datos se conservan.

B) Restaurar la base: NUNCA automático. Sustituye TODOS los datos posteriores al respaldo
   (cuentas, inscripciones y borradores nuevos). Primero inspeccionar en una base aparte:
   sudo docker exec $DB_C sh -c 'createdb -U "\$POSTGRES_USER" aula_inspeccion'
   sudo docker exec -i $DB_C sh -c 'pg_restore -U "\$POSTGRES_USER" -d aula_inspeccion --no-owner' < ${BK}/aula.dump
   Solo con decisión expresa del responsable, con la API detenida (compose stop api), restaurar sobre «aula»
   con pg_restore --clean --if-exists y volver a arrancar la API. No borrar el volumen.
EOF
trap - ERR
echo "Respaldo comprobado: $BK"

# ---------------------------------------------------------------- 3. Exportación y construcción
paso '3/5 Exportación del commit y construcción de la API'
STAGE="$STATE/preparacion-$REV"
rm -rf -- "$STAGE"
install -d -m 700 "$STAGE/source" "$STAGE/site"
trap 'echo "Fallo antes del cambio: la instalación sigue intacta. Revisa $LOG" >&2' ERR
"${GIT[@]}" archive "$REV" | tar -x -C "$STAGE/source"
python3 - "$STAGE" "$REV" <<'PY'
import pathlib, shutil, sys
stage, rev = pathlib.Path(sys.argv[1]), sys.argv[2]
src, site = stage / 'source', stage / 'site'
for name in ('assets', 'styles', 'src', 'games', 'data', 'aula'):        # mismos archivos que el instalador
    if (src / name).is_dir(): shutil.copytree(src / name, site / name)
for name in ('index.html', 'favicon.ico', 'robots.txt'):
    if (src / name).is_file(): shutil.copy2(src / name, site / name)
(site / 'revision.txt').write_text(rev + '\n')
for p in site.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
site.chmod(0o755)
PY
docker build -q -t "globalt-aula-api:$REV" "$STAGE/source/services/aula-api" >/dev/null
echo "Imagen construida: globalt-aula-api:$REV"

# ---------------------------------------------------------------- Cambio (con vuelta atrás automática)
install -d -m 700 "$STATE/anteriores" "$ANT"
cp -a "$STATE/site" "$ANT/site"
SOURCE_MOVIDO=0
sincronizar_sitio() {   # copia los archivos de $1 dentro de site/ sin cambiar la carpeta montada
  python3 - "$1" "$STATE/site" <<'PY'
import filecmp, os, pathlib, shutil, sys
origen, destino = map(pathlib.Path, sys.argv[1:])
for d, dirs, files in os.walk(origen):
    rel = pathlib.Path(d).relative_to(origen)
    (destino / rel).mkdir(mode=0o755, exist_ok=True)
    for f in files:
        a, b = pathlib.Path(d, f), destino / rel / f
        if not b.exists() or not filecmp.cmp(a, b, shallow=False):
            tmp = b.with_name(f'.{f}.nuevo'); shutil.copy2(a, tmp); os.replace(tmp, b)
for d, dirs, files in os.walk(destino, topdown=False):
    rel = pathlib.Path(d).relative_to(destino)
    for f in files:
        if not (origen / rel / f).exists(): (pathlib.Path(d) / f).unlink()
    if rel != pathlib.Path('.') and not (origen / rel).exists(): pathlib.Path(d).rmdir()
for p in destino.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
destino.chmod(0o755)
PY
}
volver_atras() {
  trap - ERR
  echo '!! Comprobación fallida: se vuelve a la API y web anteriores. La base de datos NO se restaura.' >&2
  set +e
  tar -C "$STATE" -xf "$BK/configuracion.tar" compose.json revision.txt
  if [[ $SOURCE_MOVIDO == 1 ]]; then mv "$STATE/source" "$STAGE/source-fallida" && mv "$ANT/source" "$STATE/source"; fi
  sincronizar_sitio "$ANT/site"
  "${DC[@]}" up -d --no-deps api
  for _ in $(seq 1 60); do curl -fsS --max-time 3 "$BASE/api/aula/salud" >/dev/null 2>&1 && break; sleep 2; done
  if curl -fsS --max-time 3 "$BASE/api/aula/salud" >/dev/null 2>&1; then
    echo "Restablecida la versión $OLD (API y web). Datos conservados. Registro: $LOG" >&2
  else
    echo "La API anterior tampoco responde: NO reintentar; enviar $LOG. Guía: $BK/RECUPERACION.txt" >&2
  fi
  exit 1
}
trap volver_atras ERR

paso 'Aplicando el cambio'
if [[ $OLD != "$REV" ]]; then
  mv "$STATE/source" "$ANT/source"; SOURCE_MOVIDO=1
  mv "$STAGE/source" "$STATE/source"
else
  echo 'Misma versión ya instalada: se conservan source/ y la imagen; se repiten las comprobaciones.'
fi
sincronizar_sitio "$STAGE/site"
python3 - "$STATE/compose.json" "$REV" "$SOCKET_DIR" "$SOCKET_API" "$SOCK_GID" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]); c = json.loads(p.read_text())
rev, sdir, sapi, sgid = sys.argv[2:]
api = c['services']['api']
api['image'] = 'globalt-aula-api:' + rev
# Compilador existente: solo la carpeta del socket, en solo lectura, con el grupo que ya tiene el socket.
api['volumes'] = [f'{sdir}:{sapi}:ro']
api['group_add'] = [sgid]
api['environment'] = {'AULA_COMPILADOR_SOCKET': f'{sapi}/compilador.sock'}
tmp = p.with_name('.compose.json.nuevo'); tmp.write_text(json.dumps(c, indent=2)); tmp.chmod(0o600); tmp.replace(p)
PY
"${DC[@]}" config --quiet
"${DC[@]}" up -d --no-deps api

# ---------------------------------------------------------------- 4. Migraciones
paso '4/5 Arranque de la API y migraciones'
sano=false
for _ in $(seq 1 60); do
  salud=$(curl -fsS --max-time 3 "$BASE/api/aula/salud" 2>/dev/null || true)
  if [[ $salud == *'"ok":true'* ]]; then sano=true; break; fi
  sleep 2
done
if [[ $sano != true ]]; then docker logs --tail 30 "$API_C" >&2 || true; false; fi
comprobar_contenedores despues
salud_comp=$(curl -fsS --max-time 5 --unix-socket "$SOCKET_DIR/compilador.sock" http://localhost/api/arduino/salud || true)
[[ $salud_comp == *'"ok"'* ]] || { echo 'El compilador existente dejó de responder.' >&2; false; }
[[ $(stat -c '%u %g %a' "$SOCKET_DIR/compilador.sock") == "10001 $SOCK_GID 660" ]] || { echo 'Cambiaron los permisos del socket.' >&2; false; }
echo 'SELECT version, suma FROM esquema_migraciones ORDER BY version' | sql | tr '|' ' ' > "$STATE/.migraciones-aplicadas"
diff <(sort "$STATE/.migraciones-destino.sumas") <(sort "$STATE/.migraciones-aplicadas") \
  || { echo 'Las migraciones aplicadas no coinciden con las del commit.' >&2; false; }
echo "Migraciones al día: $(cut -d' ' -f1 "$STATE/.migraciones-aplicadas" | tr '\n' ' ')"

# ---------------------------------------------------------------- 5. Comprobación funcional
paso '5/5 Página, salud y guardado con una cuenta ficticia propia'
CORREO="verificacion-aula-$(date +%s)-$RANDOM@example.com"
borrar_ficticia() {   # elimina SOLO la cuenta creada por esta ejecución (y sus datos por cascada)
  printf "DELETE FROM usuarios WHERE correo = '%s' AND correo LIKE 'verificacion-aula-%%@example.com'\n" "$CORREO" | sql >/dev/null
}
prueba_ok=true
python3 - "$BASE" "$CORREO" "$REV" <<'PY' || prueba_ok=false
import http.cookiejar, json, secrets, sys, urllib.error, urllib.request
base, correo, rev = sys.argv[1:]
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def pedir(metodo, ruta, datos=None, csrf=None):
    h = {'Origin': base, 'Accept': 'application/json'}
    if datos is not None: h['Content-Type'] = 'application/json'
    if csrf: h['X-CSRF-Token'] = csrf
    req = urllib.request.Request(base + ruta, method=metodo, headers=h,
                                 data=None if datos is None else json.dumps(datos).encode())
    try:
        with op.open(req, timeout=10) as r: return r.status, r.headers.get('content-type', ''), r.read()
    except urllib.error.HTTPError as e: return e.code, e.headers.get('content-type', ''), e.read()
def j(r): return json.loads(r[2]) if r[2] else None
for ruta, marca in (('/aula/', b'<html'), ('/games/laboratorio-arduino/index.html', b'id="cuenta"'),
                    ('/games/laboratorio-arduino/src/cuenta.js', b'/borradores/')):
    r = pedir('GET', ruta); assert r[0] == 200 and marca in r[2], f'página {ruta}: {r[0]}'
r = pedir('GET', '/revision.txt'); assert r[2].decode().strip() == rev, 'revision.txt publicada'
clave = secrets.token_urlsafe(18)
r = pedir('POST', '/api/aula/registro', {'nombre': 'Verificación automática', 'correo': correo, 'clave': clave})
assert r[0] == 201, f'registro ficticio: {r[0]} {r[2][:200]!r}'
csrf = j(r)['csrf']
assert pedir('POST', '/api/aula/inscripciones', {'curso_id': 'course-arduino'}, csrf)[0] == 201, 'inscripción'
B = '/api/aula/borradores/arduino-led-serie'
assert j(pedir('GET', B)) == {'borrador': None}, 'la cuenta nueva no debe ver borradores ajenos'
codigo = '// verificación automática\nvoid setup() {}\nvoid loop() {}\n'
assert pedir('PUT', B, {'codigo': codigo}, None)[0] == 403, 'PUT sin CSRF debe rechazarse'
r = pedir('PUT', B, {'codigo': codigo}, csrf); assert r[0] == 200 and j(r)['borrador']['version'] == 1, f'guardar: {r[0]}'
assert pedir('PUT', B, {'codigo': 'otro'}, csrf)[0] == 409, 'no debe sobrescribir sin versión'
assert pedir('DELETE', '/api/aula/sesion', None, csrf)[0] == 204, 'cerrar sesión'
assert pedir('GET', B)[0] == 401, 'sin sesión debe rechazarse'
r = pedir('POST', '/api/aula/sesion', {'correo': correo, 'clave': clave}); assert r[0] == 200, 'volver a entrar'
r = pedir('GET', B); assert j(r)['borrador']['codigo'] == codigo, 'recuperar borrador'
csrf = j(pedir('GET', '/api/aula/sesion'))['csrf']
assert pedir('GET', '/api/aula/compilador/salud')[0] == 200, 'salud del compilador vía aula'
blink = 'void setup() { pinMode(13, OUTPUT); }\nvoid loop() { digitalWrite(13, HIGH); delay(200); digitalWrite(13, LOW); delay(800); }\n'
assert pedir('POST', '/api/aula/compilar', {'codigo': blink}, None)[0] == 403, 'compilar sin CSRF debe rechazarse'
r = pedir('POST', '/api/aula/compilar', {'codigo': blink}, csrf)
assert r[0] == 200 and j(r)['ok'] is True and j(r)['hex'].startswith(':'), f'compilación real: {r[0]} {r[2][:200]!r}'
r = pedir('POST', '/api/aula/compilar', {'codigo': 'void setup() { x }\nvoid loop() {}\n'}, csrf)
assert r[0] == 200 and j(r)['ok'] is False and j(r)['diagnosticos'], 'errores del código'
anon = urllib.request.build_opener()
try:
    anon.open(urllib.request.Request(base + '/api/aula/compilar', data=b'{"codigo":"x"}', method='POST',
              headers={'Origin': base, 'Content-Type': 'application/json'}), timeout=10)
    raise AssertionError('compilar sin sesión debe rechazarse')
except urllib.error.HTTPError as e:
    assert e.code in (401, 403), e.code
print('Página, salud, registro, inscripción, borrador y compilación real (con y sin errores, sin sesión, sin CSRF): OK')
PY
borrar_ficticia || { echo "No se pudo eliminar la cuenta ficticia $CORREO; eliminarla a mano." >&2; prueba_ok=false; }
[[ $prueba_ok == true ]]
echo "$CONTEO_B" | sql > "$BK/conteo-final.txt"
python3 - "$BK" <<'PY'
import pathlib, sys
bk = pathlib.Path(sys.argv[1])
leer = lambda n: dict((k, int(v)) for k, v in (l.split('|') for l in (bk / n).read_text().split()))
antes, final = leer('conteo-despues.txt'), leer('conteo-final.txt')
for t in ('usuarios', 'inscripciones', 'cursos'):
    assert final[t] >= antes[t], f'{t} disminuyó: {antes[t]} -> {final[t]}'
print('Datos existentes conservados: ' + ', '.join(f'{t}={final[t]}' for t in ('usuarios', 'inscripciones', 'borradores')))
PY

trap - ERR
printf '%s\n' "$REV" > "$STATE/revision.txt"
rm -rf -- "$STAGE"
rm -f "$STATE/.inspeccion.json" "$STATE/.redes.json"
printf '\nAula actualizada a %s.\n' "$REV"
printf 'Respaldo comprobado y guía de recuperación: %s\n' "$BK"
printf 'Versión anterior conservada: imagen globalt-aula-api:%s y %s\n' "$OLD" "$ANT"
printf 'Aula privada: http://%s:%s/aula/ · Registro: %s\n' "$NETBIRD" "$PORT" "$LOG"
