#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
[[ $EUID -eq 0 ]] || { echo 'Ejecuta con sudo bash deploy/linux/install-public.sh'; exit 1; }
for tool in docker curl ss install; do command -v "$tool" >/dev/null || { echo "Falta: $tool"; exit 1; }; done
docker info >/dev/null
[[ -f /srv/globalt-robotics/current/index.html ]] || { echo 'Primero debe existir la instalación privada de Robotics.'; exit 1; }
if docker container inspect globalt-robotics-public >/dev/null 2>&1; then
  echo 'Ya existe globalt-robotics-public. No se reemplazó.'; exit 1
fi
if ss -H -ltn 'sport = :8096' | read -r _; then
  echo 'Puerto 8096 ocupado. No se cambió ningún servicio.'; exit 1
fi
# Reutiliza exactamente la imagen Nginx de la web privada, sin actualizarla.
IMAGE=$(docker container inspect globalt-robotics-web --format '{{.Image}}')
install -d -m 755 /etc/globalt-robotics
install -m 644 nginx-public.conf /etc/globalt-robotics/nginx-public.conf
OPTIONS=(--read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp
  --mount type=bind,src=/srv/globalt-robotics,dst=/srv/globalt-robotics,readonly
  --mount type=bind,src=/etc/globalt-robotics/nginx-public.conf,dst=/etc/nginx/conf.d/default.conf,readonly)
docker run --rm --network none "${OPTIONS[@]}" "$IMAGE" nginx -t
created=false
cleanup() { if [[ "$created" == true ]]; then docker rm -f globalt-robotics-public >/dev/null 2>&1 || true; fi; }
trap cleanup ERR
docker run -d --name globalt-robotics-public --restart unless-stopped \
  --memory 64m --cpus 0.25 --pids-limit 64 \
  --log-opt max-size=5m --log-opt max-file=2 \
  --publish 127.0.0.1:8096:80 "${OPTIONS[@]}" "$IMAGE"
created=true
for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:8096/revision.txt; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:8096/ >/dev/null
for path in admin admin/ admin.html src/admin/admin.js api/arduino/salud; do
  status=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8096/$path")
  [[ "$status" == 403 ]] || { echo "Comprobación fallida: /$path devolvió $status"; false; }
done
created=false
trap - ERR
printf '\nEntrada para el túnel lista: http://127.0.0.1:8096\n'
printf 'Administración privada conservada: http://100.117.79.42:8094/admin\n'
printf 'El dominio todavía necesita conectar su túnel en Cloudflare.\n'
