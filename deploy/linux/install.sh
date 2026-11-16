#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ $EUID -ne 0 ]]; then echo 'Ejecuta con sudo bash deploy/linux/install.sh'; exit 1; fi
for command in git python3 docker systemctl curl ip ss runuser; do
    command -v "$command" >/dev/null || { echo "Falta instalar: $command"; exit 1; }
done
docker info >/dev/null
if docker container inspect globalt-robotics-web >/dev/null 2>&1; then
    echo 'Ya existe globalt-robotics-web. No se reemplazó. Consulta README_LINUX.md.'; exit 1
fi
if ss -H -ltn 'sport = :8093' | read -r _; then
    echo 'El puerto 8093 está ocupado. No se modificó ningún servicio.'; exit 1
fi
NETBIRD_IP=100.117.79.42
if ! ip -4 -o addr show | awk '{print $4}' | cut -d/ -f1 | python3 -c 'import sys; sys.exit(0 if "100.117.79.42" in sys.stdin.read().splitlines() else 1)'; then
    echo 'No aparece la IP NetBird 100.117.79.42. Comprueba NetBird antes de instalar.'; exit 1
fi
getent passwd globalt-robotics >/dev/null || useradd --system --home-dir /var/lib/globalt-robotics --shell /usr/sbin/nologin globalt-robotics
install -d -o globalt-robotics -g globalt-robotics -m 755 /var/lib/globalt-robotics /srv/globalt-robotics
install -d -m 755 /usr/local/lib/globalt-robotics /etc/globalt-robotics
install -m 644 update.py /usr/local/lib/globalt-robotics/update.py
install -m 644 nginx.conf /etc/globalt-robotics/nginx.conf
runuser -u globalt-robotics -- python3 /usr/local/lib/globalt-robotics/update.py --prepare-only
# Resolve the image to a digest on installation; future code updates do not pull images.
docker pull nginx:stable-alpine
IMAGE=$(docker image inspect nginx:stable-alpine --format '{{index .RepoDigests 0}}')
printf '%s\n' "$IMAGE" > /etc/globalt-robotics/nginx-image.txt
docker run -d --name globalt-robotics-web --restart unless-stopped \
    --memory 128m --cpus 0.50 --pids-limit 100 \
    --read-only --tmpfs /var/cache/nginx --tmpfs /var/run --tmpfs /tmp \
    --log-opt max-size=5m --log-opt max-file=2 \
    --publish 127.0.0.1:8093:80 --publish "$NETBIRD_IP":8093:80 \
    --mount type=bind,src=/srv/globalt-robotics,dst=/srv/globalt-robotics,readonly \
    --mount type=bind,src=/etc/globalt-robotics/nginx.conf,dst=/etc/nginx/conf.d/default.conf,readonly \
    "$IMAGE"
for attempt in {1..10}; do
    if curl -fsS http://127.0.0.1:8093/revision.txt; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:8093/ >/dev/null
curl -fsS http://127.0.0.1:8093/admin >/dev/null
curl -fsS http://127.0.0.1:8093/games/robolab-arduino/ >/dev/null
install -m 644 globalt-robotics-sync.service globalt-robotics-sync.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now globalt-robotics-sync.timer
printf '\nInstalado: http://%s:8093\n' "$NETBIRD_IP"
systemctl list-timers globalt-robotics-sync.timer --no-pager
