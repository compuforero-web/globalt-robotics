#!/usr/bin/env bash
# Respaldo de la base del aula de producción (contenedor globalt-aula-db), independiente de GitHub.
# Lo ejecuta el temporizador globalt-aula-respaldo.timer (diario) o «aula-produccion.sh respaldo».
# Cada copia se comprueba restaurándola en una base temporal del mismo servidor y comparando conteos.
# Retención: las AULA_RESPALDOS_CONSERVAR copias más recientes (14 por defecto). Permisos: solo root.
# IMPORTANTE: estas copias están en el mismo disco del servidor y NO protegen ante su pérdida.
# Falta definir una copia externa cifrada (ver docs/AULA_PRODUCCION.md).
set -Eeuo pipefail
umask 077
export LC_ALL=C
[[ $EUID -eq 0 ]] || { echo 'Ejecuta como root.' >&2; exit 1; }
DB_C=globalt-aula-db
DEST=${AULA_RESPALDOS_DIR:-/var/backups/globalt-aula}
CONSERVAR=${AULA_RESPALDOS_CONSERVAR:-14}
[[ $CONSERVAR =~ ^[0-9]+$ && $CONSERVAR -ge 2 ]] || { echo 'AULA_RESPALDOS_CONSERVAR no válido.' >&2; exit 1; }
install -d -m 700 "$DEST"
exec 9>"$DEST/.respaldo.lock"
flock -n 9 || { echo 'Ya hay un respaldo en curso.' >&2; exit 1; }
TS=$(date -u +%Y%m%dT%H%M%SZ)
PARCIAL="$DEST/.aula-$TS.dump.parcial"
VERIF="aula_verificacion_respaldo_$$"
sql() { docker exec -i "$DB_C" sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${1:-$POSTGRES_DB}"' sh "${1:-}"; }
limpiar() {
  docker exec "$DB_C" sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1"' sh "$VERIF" >/dev/null 2>&1 || true
  rm -f -- "$PARCIAL"
}
trap 'limpiar; echo "Respaldo FALLIDO ($TS). No se borró ninguna copia anterior." >&2' ERR

CONTEO="SELECT 'usuarios', count(*) FROM usuarios UNION ALL SELECT 'inscripciones', count(*) FROM inscripciones
UNION ALL SELECT 'borradores', count(*) FROM borradores UNION ALL SELECT 'esquema_migraciones', count(*) FROM esquema_migraciones"
antes=$(echo "$CONTEO" | sql)
docker exec "$DB_C" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$PARCIAL"
despues=$(echo "$CONTEO" | sql)
[[ -s $PARCIAL ]]
docker exec -i "$DB_C" sh -c 'pg_restore -l' < "$PARCIAL" > /dev/null
docker exec "$DB_C" sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$1" 2>/dev/null; createdb -U "$POSTGRES_USER" "$1"' sh "$VERIF"
docker exec -i "$DB_C" sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --exit-on-error' sh "$VERIF" < "$PARCIAL"
restaurado=$(echo "$CONTEO" | sql "$VERIF")
docker exec "$DB_C" sh -c 'dropdb -U "$POSTGRES_USER" "$1"' sh "$VERIF"
python3 - "$antes" "$restaurado" "$despues" <<'PY'
import sys
leer = lambda t: dict((k, int(v)) for k, v in (l.split('|') for l in t.split()))
a, r, d = map(leer, sys.argv[1:])
for tabla in a:
    assert a[tabla] <= r[tabla] <= d[tabla], f'{tabla}: {a[tabla]} <= {r[tabla]} <= {d[tabla]}'
PY
FINAL="$DEST/aula-$TS.dump"
mv -- "$PARCIAL" "$FINAL"
chmod 600 "$FINAL"
(cd "$DEST" && sha256sum "aula-$TS.dump" > "aula-$TS.dump.sha256" && chmod 600 "aula-$TS.dump.sha256")
printf '%s %s\n' "$TS" "$(echo "$restaurado" | tr '\n' ' ')" > "$DEST/ultimo-correcto.txt"
# Retención: solo se borran copias comprobadas antiguas, nunca la recién creada.
mapfile -t copias < <(find "$DEST" -maxdepth 1 -name 'aula-*.dump' -printf '%f\n' | sort -r)
for viejo in "${copias[@]:$CONSERVAR}"; do rm -f -- "$DEST/$viejo" "$DEST/$viejo.sha256"; done
trap - ERR
echo "Respaldo comprobado: $FINAL ($(echo "$restaurado" | tr '\n' ' '))"
