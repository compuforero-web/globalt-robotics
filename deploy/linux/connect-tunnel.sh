#!/usr/bin/env bash
set -euo pipefail
set +x
[[ $EUID -eq 0 ]] || { echo 'Ejecuta con sudo bash deploy/linux/connect-tunnel.sh'; exit 1; }
for command in docker curl install; do command -v "$command" >/dev/null || { echo "Falta: $command"; exit 1; }; done
docker info >/dev/null
if docker container inspect globalt-robotics-tunnel >/dev/null 2>&1; then
  echo 'Ya existe globalt-robotics-tunnel. No se reemplazó.'; exit 1
fi
curl -fsS --max-time 10 http://127.0.0.1:8096/ >/dev/null || { echo 'La entrada pública 8096 no responde.'; exit 1; }
# Descarga antes de pedir el secreto. Fija la imagen instalada por digest.
docker pull cloudflare/cloudflared:latest
IMAGE=$(docker image inspect cloudflare/cloudflared:latest --format '{{index .RepoDigests 0}}')
printf '\nCopia el comando Docker de Cloudflare. Pégalo aquí cuando se solicite.\n'
printf 'Se tratará únicamente como texto: NO se ejecutará ese comando.\n'
IFS= read -r -s -p 'Pega el comando completo o solo el token (entrada oculta): ' pasted </dev/tty
printf '\n'
# El comando que entrega Cloudflare termina en --token VALOR; también acepta el valor solo.
if [[ "$pasted" == *'--token '* ]]; then
  secret="${pasted##*--token }"
elif [[ "$pasted" == *'--token='* ]]; then
  secret="${pasted##*--token=}"
else
  secret="$pasted"
fi
secret="${secret#\"}"; secret="${secret%\"}"
secret="${secret#\'}"; secret="${secret%\'}"
if [[ ! "$secret" =~ ^[A-Za-z0-9_+/=-]{40,}$ ]]; then
  unset pasted secret
  echo 'No se reconoció el token. Vuelve a ejecutar y pega el comando de una sola línea o solo el token.'; exit 1
fi
install -d -m 755 /etc/globalt-robotics
umask 077
TOKEN_FILE=/etc/globalt-robotics/cloudflare-tunnel.token
if [[ -e "$TOKEN_FILE" ]]; then
  unset pasted secret
  echo 'Ya existe un token guardado. No se reemplazó; revisaremos la instalación anterior.'; exit 1
fi
printf '%s' "$secret" > "$TOKEN_FILE"
unset pasted secret
chown 65532:65532 "$TOKEN_FILE"
chmod 400 "$TOKEN_FILE"
printf '%s\n' "$IMAGE" > /etc/globalt-robotics/cloudflared-image.txt
# Red del host para alcanzar 127.0.0.1:8096. No publica puertos; métricas solo en localhost.
docker run -d --name globalt-robotics-tunnel --restart unless-stopped \
  --network host --user 65532:65532 --read-only --cap-drop ALL \
  --security-opt no-new-privileges:true --pids-limit 64 --memory 192m --cpus 0.5 \
  --tmpfs /tmp:size=16m,noexec,nosuid,nodev \
  --log-opt max-size=5m --log-opt max-file=2 \
  --mount type=bind,src="$TOKEN_FILE",dst=/run/tunnel-token,readonly \
  "$IMAGE" tunnel --no-autoupdate --metrics 127.0.0.1:0 run --token-file /run/tunnel-token
printf '\nConector creado. Esto todavía no confirma conexión con Cloudflare.\n'
printf 'Espera unos segundos y revisa el estado en el panel de Cloudflare.\n'
printf 'Después configura el dominio hacia HTTP 127.0.0.1:8096.\n'
printf 'Los túneles de Origen y Restaurante no se modificaron.\n'
