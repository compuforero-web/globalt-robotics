#!/usr/bin/env bash
# Piloto privado de cuentas: recursos propios, sin cambiar main ni los proxies existentes.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecuta este archivo con sudo bash.'; exit 1; }
REPO=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
STATE=/var/lib/globalt-robotics-aula-preview
NAME=globalt-aula-piloto
PORT=8100
for tool in docker git python3 curl ss; do command -v "$tool" >/dev/null || { echo "Falta $tool"; exit 1; }; done
docker info >/dev/null
docker compose version >/dev/null
REV=$(git -c safe.directory="$REPO" -C "$REPO" rev-parse HEAD)
if [[ -d "$STATE" ]]; then
  echo "Ya existe $STATE. Se conserva para revisar; no se reemplazan cuentas ni contenedores."
  exit 1
fi
if ss -H -ltn "sport = :$PORT" | read -r _; then echo "Puerto $PORT ocupado; no se modificó ningún servicio."; exit 1; fi
for container in "$NAME-db" "$NAME-api" "$NAME-web"; do
  if docker inspect "$container" >/dev/null 2>&1; then echo "Ya existe $container; se conserva."; exit 1; fi
done
# Usa la misma imagen nginx ya instalada, sin cambiarla ni actualizar otros servicios.
WEB_IMAGE=$(docker inspect globalt-robotics-web --format '{{.Image}}')
umask 077
install -d -m 700 "$STATE" "$STATE/source" "$STATE/site"
trap 'echo "Instalación interrumpida. Se conservaron los recursos del piloto en $STATE para diagnóstico; los servicios existentes no se modificaron."' ERR
git -c safe.directory="$REPO" -C "$REPO" archive "$REV" | tar -x -C "$STATE/source"
printf '%s\n' "$REV" > "$STATE/revision.txt"
python3 - "$STATE" "$WEB_IMAGE" "$PORT" <<'PY'
import json,pathlib,secrets,shutil,sys
s=pathlib.Path(sys.argv[1]); src=s/'source'; site=s/'site'
for name in ('assets','styles','src','games','data','aula'):
    if (src/name).is_dir(): shutil.copytree(src/name,site/name)
for name in ('index.html','favicon.ico','robots.txt'):
    if (src/name).is_file(): shutil.copy2(src/name,site/name)
(site/'revision.txt').write_text((s/'revision.txt').read_text())
# Los archivos estáticos deben ser legibles por nginx, no por otros usuarios del host.
for p in site.rglob('*'): p.chmod(0o755 if p.is_dir() else 0o644)
site.chmod(0o755)
clave=secrets.token_hex(32)
(s/'db.env').write_text(f'POSTGRES_DB=aula\nPOSTGRES_USER=aula\nPOSTGRES_PASSWORD={clave}\n')
(s/'api.env').write_text(f'AULA_DATABASE_URL=postgresql://aula:{clave}@db:5432/aula\n'
    'AULA_ORIGENES=http://127.0.0.1:8100,http://100.117.79.42:8100\n'
    'AULA_COOKIE_SEGURA=false\nFORWARDED_ALLOW_IPS=\n')
hard={'read_only':True,'tmpfs':['/tmp'],'cap_drop':['ALL'],
      'security_opt':['no-new-privileges:true'],'init':True,
      'restart':'unless-stopped','logging':{'driver':'json-file','options':{'max-size':'5m','max-file':'2'}},
      'networks':['aislada']}
compose={'name':'globalt-aula-piloto','services':{
    'db':{'image':'postgres:16.6-alpine@sha256:1d04b9ba1d4996401f2552b51beda8187f175c0645c091e4781134fc9c9a3eef',
          'container_name':'globalt-aula-piloto-db','env_file':['db.env'],
          'volumes':['datos:/var/lib/postgresql/data'],'networks':['aislada'],
          'restart':'unless-stopped','mem_limit':'512m','cpus':0.5,
          'healthcheck':{'test':['CMD-SHELL','pg_isready -U aula -d aula'],'interval':'2s','timeout':'3s','retries':30}},
    'api':{**hard,'build':{'context':'source/services/aula-api'},
           'image':'globalt-aula-api:'+ (s/'revision.txt').read_text().strip(),
           'container_name':'globalt-aula-piloto-api','env_file':['api.env'],
           'mem_limit':'512m','cpus':1,'pids_limit':128,
           'depends_on':{'db':{'condition':'service_healthy'}}},
    'web':{'image':sys.argv[2],'container_name':'globalt-aula-piloto-web',
           'ports':[f'127.0.0.1:{sys.argv[3]}:80',f'100.117.79.42:{sys.argv[3]}:80'],
           'volumes':['./nginx.conf:/etc/nginx/conf.d/default.conf:ro','./site:/srv/sitio:ro'],
           'read_only':True,'tmpfs':['/var/cache/nginx','/var/run','/tmp'],
           'networks':['aislada','entrada'],'restart':'unless-stopped','mem_limit':'128m','cpus':0.5,'pids_limit':100}},
    'networks':{'aislada':{'internal':True},'entrada':{}},'volumes':{'datos':{}}}
(s/'compose.json').write_text(json.dumps(compose,indent=2))
PY
cat > "$STATE/nginx.conf" <<'NGINX'
server {
    listen 80;
    server_tokens off;
    root /srv/sitio;
    index index.html;
    resolver 127.0.0.11 valid=5s;
    location ~ /\. { deny all; }
    location ^~ /api/aula/ {
        client_max_body_size 16k;
        set $aula_backend http://api:8000;
        proxy_pass $aula_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/ { return 403; }
    location /admin { return 403; }
    location / { try_files $uri $uri/ =404; }
}
NGINX
chmod 644 "$STATE/nginx.conf"
cd "$STATE"
DC=(docker compose -f compose.json)
"${DC[@]}" build api
"${DC[@]}" up -d db web
# Confía únicamente en la IP de este proxy aislado. No acepta X-Forwarded-For del navegador.
WEB_IP=$(docker inspect "$NAME-web" --format '{{(index .NetworkSettings.Networks "globalt-aula-piloto_aislada").IPAddress}}')
[[ "$WEB_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
sed -i '/^FORWARDED_ALLOW_IPS=/d' api.env
printf 'FORWARDED_ALLOW_IPS=%s\n' "$WEB_IP" >> api.env
"${DC[@]}" up -d api
healthy=false
for attempt in {1..40}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/aula/salud" > health.json 2> health.err; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  "${DC[@]}" logs --tail 25 api web
  cat health.err >&2
  false
fi
curl -fsS --max-time 5 "http://127.0.0.1:$PORT/aula/" -o /dev/null
python3 - <<'PY'
import json,urllib.request
base='http://127.0.0.1:8100'
with urllib.request.urlopen(base+'/api/aula/cursos',timeout=5) as r: datos=json.load(r)
assert any(c['id']=='course-arduino' for c in datos['cursos']),datos
print('API, base de datos, catálogo Arduino y página del aula: OK')
PY
trap - ERR
printf '\nAula privada: http://100.117.79.42:8100/aula/\n'
printf 'Usa solamente cuentas ficticias. El compilador no se publica en este piloto.\n'
printf 'El dominio público, los laboratorios de 8094/8097 y los otros proyectos se conservaron.\n'
printf 'Diagnóstico: sudo docker compose -f %s/compose.json logs --tail 30\n' "$STATE"
