# Laboratorio Arduino en la entrada privada estable

El laboratorio de PR #1 se integra en main con su corrección del LED. El compilador validado en Linux continúa en su contenedor existente, sin red y conectado por socket Unix. La entrada pública sigue bloqueando `/api/`.

## Aplicar en Linux

```bash
cd ~/globalt-robotics
git pull --ff-only
sudo bash deploy/linux/promote-lab-stable.sh
```

El script actualiza los archivos mediante el publicador ya instalado, valida Nginx, crea una copia candidata local en 8098 y prueba portada, administración, laboratorio y compilación real. Comprueba el bloqueo de la API pública. Después sustituye únicamente `globalt-robotics-web`, conservando la entrada privada en localhost y NetBird, puerto 8094. Puede haber una interrupción breve de esa entrada privada durante el cambio. La entrada pública del puerto 8096 y su túnel permanecen funcionando en su contenedor separado.

Si las comprobaciones posteriores al cambio fallan, intenta restaurar automáticamente el contenedor anterior. El diagnóstico indicará si necesita intervención. El compilador, el piloto 8097 y los proyectos Origen, Restaurante e ISP no se reemplazan.

La sintaxis y la lógica de recuperación se comprobaron en el entorno de edición. La creación de contenedores, comprobación por el proxy estable y recuperación real dependen de ejecutar el script en Linux.

## Uso estable

Con NetBird: `http://100.117.79.42:8094/games/laboratorio-arduino/index.html`.

En el dominio público pueden consultarse los archivos y la lección, pero el compilador permanece bloqueado. No anunciar el laboratorio como ejecutable públicamente hasta integrar cuentas, permisos y límites de uso. El progreso del piloto no se migra automáticamente a otra dirección: localStorage distingue puerto y dominio. Abrir 8094 crea un almacenamiento local independiente de 8097; conservar el código del piloto antes de cambiar de dirección si se necesita.

## Verificación

```bash
curl -fsS http://127.0.0.1:8094/api/arduino/salud
sudo docker ps --filter name=globalt-robotics-web
sudo docker ps --filter name=globalt-arduino-compiler
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8096/api/arduino/salud
```

La última comprobación debe responder 403. La salud privada debe devolver `ok: true`. Ejecutar un ejemplo en el navegador debe encender el LED y producir salida serie.

## Recuperación manual de la entrada privada

Solo si se completó la promoción y existe `globalt-robotics-web-before-lab`:

```bash
sudo docker stop globalt-robotics-web
sudo docker rename globalt-robotics-web globalt-robotics-web-lab-disabled
sudo docker rename globalt-robotics-web-before-lab globalt-robotics-web
sudo docker start globalt-robotics-web
sudo rm -f /etc/globalt-robotics/stable-lab/installed
```

Esto restaura el servidor web privado anterior; no revierte el código de main ni cambia la entrada pública. El piloto del puerto 8097 continúa siendo una vía de prueba. No ejecutar borrados de volúmenes ni eliminar la copia de recuperación.
