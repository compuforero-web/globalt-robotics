#!/usr/bin/env bash
# Repara solamente la entrada HTTP del piloto. Conserva PostgreSQL y su volumen.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Ejecuta con sudo bash.'; exit 1; }
STATE=/var/lib/globalt-robotics-aula-preview
cd "$STATE"
[[ -f compose.json && -f api.env ]] || { echo 'No se encontró la configuración del piloto.'; exit 1; }
umask 077
trap 'echo "Reparación interrumpida; se conservaron los datos del piloto. Comparte la salida para revisar."' ERR
python3 - <<'PY'
import json,pathlib,shutil
p=pathlib.Path('compose.json'); c=json.loads(p.read_text())
assert c['name']=='globalt-aula-piloto'
for role in ('web','api','db'):
    assert c['services'][role]['container_name']=='globalt-aula-piloto-'+role
assert c['networks']['aislada']['internal'] is True
assert c['services']['api']['networks']==['aislada']
assert c['services']['db']['networks']==['aislada']
assert c['services']['web']['ports']==['127.0.0.1:8100:80','100.117.79.42:8100:80']
assert 'ports' not in c['services']['api'] and 'ports' not in c['services']['db']
if not pathlib.Path('compose.before-network-fix.json').exists():
    shutil.copy2(p,'compose.before-network-fix.json')
if not pathlib.Path('api.before-network-fix.env').exists():
    shutil.copy2('api.env','api.before-network-fix.env')
c['networks']['entrada']={}
c['services']['web']['networks']=['aislada','entrada']
p.write_text(json.dumps(c,indent=2))
PY
DC=(docker compose -f compose.json)
"${DC[@]}" config --quiet
"${DC[@]}" up -d --no-deps --force-recreate web
WEB_IP=$(docker inspect globalt-aula-piloto-web --format '{{(index .NetworkSettings.Networks "globalt-aula-piloto_aislada").IPAddress}}')
[[ "$WEB_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
python3 - "$WEB_IP" <<'PY'
import pathlib,sys
p=pathlib.Path('api.env')
lines=[line for line in p.read_text().splitlines() if not line.startswith('FORWARDED_ALLOW_IPS=')]
p.write_text('\n'.join(lines)+f'\nFORWARDED_ALLOW_IPS={sys.argv[1]}\n')
PY
"${DC[@]}" up -d --no-deps --force-recreate api
healthy=false
for attempt in {1..30}; do
  if curl -fsS --max-time 3 http://127.0.0.1:8100/api/aula/salud > health.json 2> health.err; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" != true ]]; then
  "${DC[@]}" ps
  "${DC[@]}" logs --tail 25 web api
  cat health.err >&2
  false
fi
curl -fsS --max-time 5 http://127.0.0.1:8100/aula/ -o /dev/null
python3 - <<'PY'
import json,urllib.request
with urllib.request.urlopen('http://127.0.0.1:8100/api/aula/cursos',timeout=5) as r: data=json.load(r)
assert any(c['id']=='course-arduino' for c in data['cursos']),data
print('Página, API y catálogo Arduino: OK')
PY
trap - ERR
printf '\nAula privada lista: http://100.117.79.42:8100/aula/\n'
printf 'Base de datos conservada. Los servicios existentes y el dominio público no se modificaron.\n'
