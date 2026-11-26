#!/usr/bin/env bash
# Ejecutar como el usuario que utiliza Docker, en la copia dedicada a la muestra.
set -euo pipefail
cd "$(dirname "$0")/../.."
base="$PWD/services/aula-api"
datos="$PWD/.ensayo-octavo"
umask 077
mkdir -p "$datos" "$datos/socket"
chmod 0770 "$datos/socket"
export ENSAYO_GID="$(id -g)" ENSAYO_SOCKET_DIR="$datos/socket" AULA_PUERTO_LOCAL=18180
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
export AULA_DB_CLAVE="$(cat "$datos/db")"
dc=(docker compose -p globalt-ensayo-octavo -f "$base/compose.yaml" -f "$PWD/deploy/ensayo-octavo/compose.yaml")
case "${1:-iniciar}" in
  detener) "${dc[@]}" stop; exit ;;
  correo)
    "${dc[@]}" exec -T buzon python - "${2:?Indica el correo ficticio}" <<'PY'
import email, email.policy, pathlib, re, sys
for p in sorted(pathlib.Path('/buzon').glob('*.eml'), reverse=True):
    m=email.message_from_bytes(p.read_bytes(),policy=email.policy.default)
    if str(m['To']).lower() != sys.argv[1].lower():
        continue
    body=m.get_body(preferencelist=('plain',))
    link=re.search(r'http://127\.0\.0\.1:18180/\S+#verificar=[\w-]+',body.get_content()) if body else None
    if link:
        print(link.group());break
else:
    sys.exit('Todavía no hay enlace para ese correo.')
PY
    exit ;;
  iniciar) ;;
  *) echo 'Uso: ensayo.sh iniciar | detener | correo direccion' >&2; exit 2 ;;
esac
"${dc[@]}" up -d --build
listo=0
for intento in {1..90}; do
  if curl -fsS http://127.0.0.1:18180/api/aula/config 2>/dev/null | python3 -c 'import json,sys; assert json.load(sys.stdin)["registro_abierto"]' 2>/dev/null; then listo=1; break; fi
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
echo "Muestra en http://127.0.0.1:18180/programa/octavo.html"
echo "Cuenta: profesor.octavo@example.com. Clave local: $datos/profesor"
