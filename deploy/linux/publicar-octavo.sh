#!/usr/bin/env bash
# Ejecutar desde un worktree de la revisión de producción, en el servidor GLOBALT.
set -euo pipefail
umask 077
cd "$(dirname "$0")/../.."
[[ $EUID == 0 && -f /var/lib/globalt-robotics-aula/activado ]]
git_local=(git -c safe.directory="$PWD")
rev=$("${git_local[@]}" rev-parse HEAD)
estado=/var/lib/globalt-robotics-aula
# Evita retroceder la API de una instalación más reciente.
"${git_local[@]}" merge-base --is-ancestor "$(cat "$estado/revision.txt")" "$rev"
read -rsp 'Clave elegida para familia.sol@example.com: ' CLAVE_FAMILIA
echo
[[ ${#CLAVE_FAMILIA} -ge 12 ]] || { echo 'Usa 12 caracteres o más.'; exit 1; }
export CLAVE_FAMILIA
if [[ "$(cat "$estado/revision.txt")" != "$rev" ]]; then
  bash deploy/linux/aula-produccion.sh actualizar "$rev"
fi
# Comprobar la identidad antes de cambiar o crear la cuenta ficticia.
docker exec -ie CLAVE_FAMILIA globalt-aula-api python - <<'PY'
import os, psycopg
from app import seguridad
email='familia.sol@example.com'
with psycopg.connect(os.environ['AULA_DATABASE_URL']) as db:
    db.execute("SELECT pg_advisory_xact_lock(80968180)")
    row=db.execute("SELECT id,nombre,rol,origen,hash_clave FROM usuarios WHERE correo=%s FOR UPDATE",(email,)).fetchone()
    if row and (row[1:4] != ('Familia Sol','estudiante','consola') or db.execute("SELECT 1 FROM familias f JOIN alumnos a ON a.id=f.alumno_id WHERE usuario_id=%s AND (nombre<>'Estudiante Sol' OR grado<>8)",(row[0],)).fetchone()):
        raise SystemExit('La identidad existente requiere revisión del administrador.')
    clave=os.environ['CLAVE_FAMILIA']
    if row:
        uid=row[0]
        if not seguridad.verificar_clave(row[4],clave):
            db.execute("UPDATE usuarios SET hash_clave=%s WHERE id=%s",(seguridad.hash_clave(clave),uid))
            db.execute("UPDATE sesiones SET revocada_en=now() WHERE usuario_id=%s AND revocada_en IS NULL",(uid,))
    else:
        uid=db.execute("INSERT INTO usuarios(correo,nombre,rol,origen,hash_clave) VALUES (%s,'Familia Sol','estudiante','consola',%s) RETURNING id",(email,seguridad.hash_clave(clave))).fetchone()[0]
    links=db.execute("SELECT alumno_id FROM familias WHERE usuario_id=%s",(uid,)).fetchall()
    if len(links)>1: raise SystemExit('Revisar las vinculaciones de la muestra.')
    if links: alumno=links[0][0]
    else:
        alumno=db.execute("INSERT INTO alumnos(nombre,grado) VALUES ('Estudiante Sol',8) RETURNING id").fetchone()[0]
        db.execute("INSERT INTO familias(usuario_id,alumno_id) VALUES (%s,%s)",(uid,alumno))
    db.execute("INSERT INTO inscripciones(usuario_id,curso_id) VALUES (%s,'course-arduino') ON CONFLICT DO NOTHING",(uid,))
    db.execute("INSERT INTO actividades_alumno(alumno_id,fecha,titulo,resultado,observacion) VALUES (%s,'2026-11-30','¿Cuándo debe frenar el robot?','Ejemplo de octavo','Actividad de muestra con mediciones de 19, 20 y 21 cm.') ON CONFLICT DO NOTHING",(alumno,))
PY
install -m 644 deploy/linux/update.py /usr/local/lib/globalt-robotics/update.py
(umask 022; runuser -u globalt-robotics -- python3 /usr/local/lib/globalt-robotics/update.py --force)
python3 - <<'PY'
import urllib.request as u, json, http.cookiejar, os
base='https://globalt-robotics.com'
c=u.build_opener(u.HTTPCookieProcessor(http.cookiejar.CookieJar()))
for path, marker in [('/aula/','familias.html'),('/programa/octavo.html','reto-distancia.html'),('/aula/familias.html','Seguimiento'),('/programa/reto-distancia.html','20')]:
    with c.open(base+path,timeout=25) as r: assert marker in r.read().decode(), path
email='familia.sol@example.com'
req=u.Request(base+'/api/aula/sesion',data=json.dumps(dict(correo=email,clave=os.environ['CLAVE_FAMILIA'])).encode(),headers={'Origin':base,'Content-Type':'application/json'})
with c.open(req,timeout=25) as r: login=json.load(r)
with c.open(base+'/api/aula/sesion',timeout=25) as r: assert json.load(r)['usuario']['correo']==email
if login['pendientes']: print('Primer ingreso: revisar y aceptar los documentos del aula.')
else:
    with c.open(base+'/api/aula/familias',timeout=25) as r: alumnos=json.load(r)
    assert len(alumnos)==1 and alumnos[0]['nombre']=='Estudiante Sol' and alumnos[0]['actividades']
print('Acceso comprobado en https://globalt-robotics.com/aula/ · familia.sol@example.com')
PY
