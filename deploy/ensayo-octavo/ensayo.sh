#!/usr/bin/env bash
# Réplica de ensayo de octavo. Ejecutar como el usuario que utiliza Docker, en la copia dedicada a la muestra.
#   ensayo.sh iniciar [DIRECCION]   arranca (o reanuda) la réplica; DIRECCION es la IP del servidor que alcanza el celular
#   ensayo.sh detener               detiene los contenedores y conserva cuentas y progreso
#   ensayo.sh limpiar               borra la base, el buzón y las claves de ESTA réplica para empezar de cero
#   ensayo.sh correo DIRECCION      imprime el último enlace de verificación enviado a ese correo ficticio
# No toca la instalación de producción: proyecto Docker, puerto, base y buzón propios.
set -euo pipefail
cd "$(dirname "$0")/../.."
base="$PWD/services/aula-api"
datos="$PWD/.ensayo-octavo"
puerto=18180
umask 077
dc=(docker compose -p globalt-ensayo-octavo -f "$base/compose.yaml" -f "$PWD/deploy/ensayo-octavo/compose.yaml")

accion="${1:-iniciar}"
case "$accion" in
  correo)
    python3 - "$datos/buzon" "${2:?Indica el correo ficticio}" <<'PY'
import email, email.policy, pathlib, re, sys
for p in sorted(pathlib.Path(sys.argv[1]).glob('*.eml'), reverse=True):
    m = email.message_from_bytes(p.read_bytes(), policy=email.policy.default)
    if str(m['To']).lower() != sys.argv[2].lower():
        continue
    cuerpo = m.get_body(preferencelist=('plain',))
    enlace = re.search(r'http://[\w.:-]+/\S+#verificar=[\w-]+', cuerpo.get_content()) if cuerpo else None
    if enlace:
        print(enlace.group())
        break
else:
    sys.exit('Todavía no hay enlace para ese correo.')
PY
    exit ;;
  limpiar)
    if [[ "${2:-}" != "--si" ]]; then
      read -r -p 'Se borrarán las cuentas, el progreso y el buzón de la réplica de ensayo (no producción). Escribe LIMPIAR: ' ok
      [[ "$ok" == LIMPIAR ]] || { echo 'Cancelado.'; exit 1; }
    fi
    # Variables mínimas para que compose interprete los archivos; no se crea nada nuevo.
    ENSAYO_GID=0 ENSAYO_UID=0 ENSAYO_SOCKET_DIR=/nonexistent ENSAYO_BUZON=/nonexistent AULA_DB_CLAVE=x \
      ENSAYO_ORIGENES=x ENSAYO_URL=x "${dc[@]}" down -v --remove-orphans
    rm -rf -- "$datos"
    echo 'Réplica de ensayo borrada. Vuelve a empezar con: ensayo.sh iniciar DIRECCION'
    exit ;;
  iniciar|detener) ;;
  *) echo 'Uso: ensayo.sh iniciar [DIRECCION] | detener | limpiar | correo CORREO' >&2; exit 2 ;;
esac

mkdir -p "$datos" "$datos/socket" "$datos/buzon"
chmod 0770 "$datos/socket"
# Creación exclusiva: un reinicio conserva las claves y la base de esta réplica.
python3 - "$datos" <<'PY'
import pathlib, secrets, sys
for nombre in ('db', 'profesor'):
    ruta = pathlib.Path(sys.argv[1]) / nombre
    try:
        with ruta.open('x') as f:
            f.write(secrets.token_hex(20))
    except FileExistsError:
        pass
PY

# Dirección para el celular: la indicada ahora, o la guardada en el arranque anterior, o solo este equipo.
if [[ "$accion" == iniciar && -n "${2:-}" ]]; then
  if ! python3 -c 'import ipaddress,sys; a=ipaddress.IPv4Address(sys.argv[1]); assert not a.is_unspecified and not a.is_multicast' "$2" 2>/dev/null; then
    echo "«$2» no es una IPv4 concreta del servidor (no se admite 0.0.0.0)." >&2; exit 2
  fi
  echo "$2" > "$datos/direccion"
fi
direccion="$(cat "$datos/direccion" 2>/dev/null || echo 127.0.0.1)"
origen="http://$direccion:$puerto"
origenes="http://127.0.0.1:$puerto"
red=()
if [[ "$direccion" != 127.0.0.1 ]]; then
  origenes+=",$origen"
  red=(-f "$PWD/deploy/ensayo-octavo/red.yaml")
fi
export ENSAYO_GID="$(id -g)" ENSAYO_UID="$(id -u)" ENSAYO_SOCKET_DIR="$datos/socket" ENSAYO_BUZON="$datos/buzon" \
       AULA_PUERTO_LOCAL=$puerto ENSAYO_DIRECCION="$direccion" ENSAYO_ORIGENES="$origenes" ENSAYO_URL="$origen"
export AULA_DB_CLAVE="$(cat "$datos/db")"
dc+=("${red[@]}")

if [[ "$accion" == detener ]]; then
  "${dc[@]}" stop
  echo 'Réplica detenida. Cuentas y progreso se conservan; para borrarlos: ensayo.sh limpiar'
  exit
fi

"${dc[@]}" up -d --build --remove-orphans
listo=0
for intento in {1..90}; do
  if curl -fsS "http://127.0.0.1:$puerto/api/aula/config" 2>/dev/null | python3 -c 'import json,sys; assert json.load(sys.stdin)["registro_abierto"]' 2>/dev/null; then listo=1; break; fi
  sleep 2
done
if [[ $listo != 1 ]]; then "${dc[@]}" ps; exit 1; fi
"${dc[@]}" exec -T api python -c '
import os, sys, psycopg
from app import seguridad, compilador
clave=sys.stdin.read().strip()
with psycopg.connect(os.environ["AULA_DATABASE_URL"]) as db:
    correo="profesor.octavo@example.com"
    row=db.execute("SELECT id, rol, hash_clave FROM usuarios WHERE correo=%s",(correo,)).fetchone()
    if row:
        if row[1] != "administrador" or not seguridad.verificar_clave(row[2],clave):
            sys.exit("La cuenta existente no coincide con esta réplica.")
        ident=row[0]
    else:
        ident=db.execute("INSERT INTO usuarios(correo,nombre,rol,hash_clave) VALUES (%s,%s,%s,%s) RETURNING id",(correo,"Profesor de octavo","administrador",seguridad.hash_clave(clave))).fetchone()[0]
    db.execute("INSERT INTO inscripciones(usuario_id,curso_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",(ident,"course-arduino"))
    for nombre in ("Estudiante Sol","Estudiante Viento"):
        db.execute("INSERT INTO alumnos(nombre,grado) SELECT %s,8 WHERE NOT EXISTS (SELECT 1 FROM alumnos WHERE nombre=%s AND grado=8)",(nombre,nombre))
status,_=compilador.pedir(os.environ["AULA_COMPILADOR_SOCKET"],"GET","/salud")
assert status==200, "El compilador de la réplica aún no está listo"
' < "$datos/profesor"
curl -fsS "http://127.0.0.1:$puerto/buzon-ensayo/" > /dev/null
activos="$("${dc[@]}" ps --status running --services)"
for servicio in db api web buzon buzon-web compilador; do
  grep -qx "$servicio" <<< "$activos" || { echo "El servicio $servicio de la réplica no está en marcha." >&2; "${dc[@]}" ps -a; exit 1; }
done

cat <<FIN

Réplica de ensayo lista (datos ficticios; producción no se toca).
  En este equipo:  http://127.0.0.1:$puerto/programa/octavo.html
  En el celular:   $origen/aula/
  Buzón de ensayo: $origen/buzon-ensayo/
  Profesor:        profesor.octavo@example.com
  Clave:           $(cat "$datos/profesor")
FIN
if [[ "$direccion" == 127.0.0.1 ]]; then
  echo
  echo 'Aviso: solo este equipo puede abrirla. Para el celular, vuelve a iniciar con la IP del servidor, por ejemplo:'
  echo "  bash deploy/ensayo-octavo/ensayo.sh iniciar $(hostname -I 2>/dev/null | awk '{print $1}')"
fi
