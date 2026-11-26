#!/usr/bin/env bash
# Entrada temporal de rectoría. Ejecutar desde el servidor del ensayo.
set -euo pipefail
umask 077
cd "$(git rev-parse --show-toplevel)"
state="$PWD/.ensayo-octavo/rectoria"
gateway=globalt-octavo-rectoria-web
tunnel=globalt-octavo-rectoria-tunel
if [[ ${1:-} == detener ]]; then
  for name in "$tunnel" "$gateway"; do
    if docker inspect "$name" >/dev/null 2>&1; then docker rm -f "$name" >/dev/null; fi
  done
  exit
fi
mkdir -p "$state"
exec 9>"$state/lock"
flock -n 9 || { echo 'La activación ya está en marcha.'; exit 1; }
uid_api=$(docker ps -q --filter label=com.docker.compose.project=globalt-ensayo-octavo --filter label=com.docker.compose.service=api)
uid_web=$(docker ps -q --filter label=com.docker.compose.project=globalt-ensayo-octavo --filter label=com.docker.compose.service=web)
test -n "$uid_api" && test -n "$uid_web" || { echo 'Enciende primero el ensayo de octavo.'; exit 1; }
# La clave queda únicamente en el servidor. Se conserva al volver a ejecutar.
if [[ ! -s "$state/clave" ]]; then python3 -c 'import os,secrets;print(os.environ.get("CLAVE_INICIAL") or secrets.token_urlsafe(16))' > "$state/clave.tmp"; mv "$state/clave.tmp" "$state/clave"; fi
export CLAVE_FAMILIA="$(cat "$state/clave")"
docker exec -i -e CLAVE_FAMILIA "$uid_api" python - <<'PY'
import os, psycopg
from app import seguridad
correo="familia.sol@example.com"
with psycopg.connect(os.environ["AULA_DATABASE_URL"]) as db:
    alumnos=db.execute("SELECT id FROM alumnos WHERE nombre='Estudiante Sol' AND grado=8").fetchall()
    if len(alumnos)!=1: raise SystemExit("Revisar alumno ficticio del ensayo.")
    alumno=alumnos[0][0]
    user=db.execute("SELECT id,rol,hash_clave FROM usuarios WHERE correo=%s FOR UPDATE",(correo,)).fetchone()
    clave=os.environ["CLAVE_FAMILIA"]
    if user:
        ident,rol,actual=user
        if rol!="estudiante" or db.execute("SELECT 1 FROM familias WHERE usuario_id=%s AND alumno_id<>%s",(ident,alumno)).fetchone():
            raise SystemExit("La cuenta existente no corresponde a la familia de demostración.")
        if not seguridad.verificar_clave(actual,clave):
            db.execute("UPDATE usuarios SET hash_clave=%s WHERE id=%s",(seguridad.hash_clave(clave),ident))
            db.execute("UPDATE sesiones SET revocada_en=now() WHERE usuario_id=%s AND revocada_en IS NULL",(ident,))
    else:
        ident=db.execute("INSERT INTO usuarios(correo,nombre,rol,hash_clave) VALUES (%s,'Familia Sol','estudiante',%s) RETURNING id",(correo,seguridad.hash_clave(clave))).fetchone()[0]
    db.execute("UPDATE usuarios SET correo_verificado_en=coalesce(correo_verificado_en,now()) WHERE id=%s",(ident,))
    db.execute("INSERT INTO familias(usuario_id,alumno_id) VALUES (%s,%s) ON CONFLICT DO NOTHING",(ident,alumno))
    db.execute("INSERT INTO inscripciones(usuario_id,curso_id) VALUES (%s,'course-arduino') ON CONFLICT DO NOTHING",(ident,))
    db.execute("INSERT INTO actividades_alumno(alumno_id,fecha,titulo,resultado,observacion) VALUES (%s,'2026-11-30','¿Cuándo debe frenar el robot?','Muestra de octavo','Ejemplo de clase: el equipo compara las lecturas de 19, 20 y 21 cm.') ON CONFLICT DO NOTHING",(alumno,))
PY
# Servir solo las pantallas de demostración y su API. El buzón, los registros,
# la recuperación y la administración del ensayo permanecen en la red privada.
cat >"$state/rectoria.conf" <<'NGINX'
server {
 listen 127.0.0.1:18181;
 server_name _;
 client_max_body_size 16k;
 proxy_pass_request_headers on;
 proxy_set_header Host 127.0.0.1;
 proxy_set_header Origin http://127.0.0.1:18180;
 proxy_cookie_flags ~ secure httponly samesite=strict;
 set $mutar "";
 if ($request_method !~ ^(GET|HEAD|OPTIONS)$) { set $mutar 1; }
 if ($http_origin != "https://$host") { set $mutar "${mutar}x"; }
 if ($mutar = 1x) { return 403; }
 absolute_redirect off;
 location = / { return 302 /aula/; }
 location ~ /\. { return 404; }
 location = /index.html { return 302 /aula/; }
 location ~ ^/api/aula/(sesion|cuenta/autorizar)$ { proxy_pass http://127.0.0.1:18180; }
 location = /_cuenta { internal; proxy_pass http://127.0.0.1:18180/api/aula/sesion; proxy_method GET; proxy_pass_request_body off; proxy_set_header Content-Length ""; }
 location ~ ^/api/aula/(compilar|compilador/salud|borradores/[a-z0-9-]+|mis-cursos)$ { auth_request /_cuenta; proxy_pass http://127.0.0.1:18180; }
 location ~ ^/api/aula/(config|documentos/[^/]+/[^/]+|familias|cursos|progreso|practicas)$ { limit_except GET { deny all; } proxy_pass http://127.0.0.1:18180; }
 location ~ ^/(aula|programa|assets|styles|data|scripts|games/laboratorio-arduino)/ { limit_except GET { deny all; } proxy_pass http://127.0.0.1:18180; }
 location / { return 404; }
}
NGINX
# nginx lee la configuración al arrancar con el usuario raíz del contenedor.
if ! docker inspect "$gateway" >/dev/null 2>&1; then
  docker run -d --name "$gateway" --network host --entrypoint nginx -v "$state/rectoria.conf:/etc/nginx/conf.d/default.conf:ro" "$(docker inspect -f '{{.Image}}' "$uid_web")" -g 'daemon off;' >/dev/null
else docker start "$gateway" >/dev/null; docker exec "$gateway" nginx -s reload; fi
curl -fsS --retry 5 --retry-connrefused http://127.0.0.1:18181/api/aula/config >/dev/null
if ! docker inspect "$tunnel" >/dev/null 2>&1; then
  docker run -d --name "$tunnel" --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:18181 >/dev/null
else docker start "$tunnel" >/dev/null; fi
start=$(docker inspect -f '{{.State.StartedAt}}' "$tunnel")
for i in {1..60}; do
  url=$(docker logs --since "$start" "$tunnel" 2>&1 | grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
  if [[ -n "$url" ]] && curl -fsS --max-time 5 "$url/aula/" >/dev/null 2>&1; then break; fi
  sleep 2
done
: "${url:?El túnel no entregó enlace}"
DEMO_URL="$url" python3 - <<'PY'
import json,os,urllib.request,http.cookiejar
url=os.environ["DEMO_URL"]
client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
req=urllib.request.Request(url+"/api/aula/sesion",data=json.dumps({"correo":"familia.sol@example.com","clave":os.environ["CLAVE_FAMILIA"]}).encode(),headers={"Origin":url,"Content-Type":"application/json"})
with client.open(req,timeout=15) as res: sesion=json.load(res)
assert sesion["usuario"]["correo"]=="familia.sol@example.com" and sesion["usuario"]["rol"]!="administrador"
with client.open(url+"/api/aula/sesion",timeout=15) as res: assert json.load(res)["usuario"]["correo"]=="familia.sol@example.com"
if sesion.get("pendientes"):
    print("En el primer ingreso lee y acepta los documentos de ensayo que muestra Aula.")
else:
    with client.open(url+"/api/aula/familias",timeout=15) as res: alumnos=json.load(res)
    assert [a["nombre"] for a in alumnos]==["Estudiante Sol"] and alumnos[0]["actividades"]
with client.open(url+"/programa/reto-distancia.html",timeout=15) as res: assert res.status==200
print("Acceso HTTPS comprobado. Aula:",url+"/aula/")
print("Clase de octavo:",url+"/programa/octavo.html")
print("Correo: familia.sol@example.com")
print("Clave:",os.environ["CLAVE_FAMILIA"])
PY
