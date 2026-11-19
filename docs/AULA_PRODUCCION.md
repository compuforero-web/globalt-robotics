# Aula en https://globalt-robotics.com

Despliegue por etapas con `deploy/linux/aula-produccion.sh`. El piloto privado (puerto 8100, `/var/lib/globalt-robotics-aula-preview`) sigue independiente: sus cuentas ficticias no se copian a producción.

## Qué se instala y qué no cambia

| Pieza | Producción |
|---|---|
| Proyecto Compose | `globalt-aula` en `/var/lib/globalt-robotics-aula` (solo root). Contenedores `globalt-aula-db` y `globalt-aula-api`. **Sin puertos publicados.** |
| Redes | `globalt-aula_aislada` (interna: base + API) y `globalt-aula_frontal` (interna: API + web pública). La base solo es accesible desde la API. |
| Credenciales | Generadas en el servidor (`db.env`, `api.env`, modo 600). Nunca en GitHub ni en la salida. |
| Compilador | El existente (`globalt-arduino-compiler`, sin red). La API monta solo la carpeta del socket en solo lectura con el grupo del socket. No se modifica. |
| Web pública | El mismo contenedor `globalt-robotics-public` (127.0.0.1:8096). Al activar se le conecta la red `frontal` y se sustituye su configuración nginx. |
| Publicador | `update.py` añade `aula/` a las carpetas publicadas. Sigue sin desplegar backend ni migraciones. |
| Cloudflare | Sin cambios: el túnel ya apunta a `http://127.0.0.1:8096`. |
| Sin cambios | Laboratorios 8094/8097, piloto 8100, otros proyectos y el temporizador de publicación. |

## Seguridad

- Rutas públicas de la API: solo `salud`, `config`, `cursos`, `mis-cursos`, `sesion`, `registro`, `inscripciones`, `borradores/<lección>`, `compilador/salud`, `compilar`, `cuenta/(verificar|reenviar|recuperar|restablecer|autorizar)` y `documentos/(terminos|datos)/<versión>`. El resto de `/api/` (incluido `/api/arduino`, el compilador directo) y la administración devuelven 403.
- Sesión: cookie `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/aula`; CSRF en peticiones que modifican datos; orígenes exactos `https://globalt-robotics.com` y `https://www.globalt-robotics.com`. Por HTTP sin cifrar, la API responde 403 y `/aula/` redirige a HTTPS.
- IP del visitante: nginx acepta `CF-Connecting-IP` solo en conexiones que llegan por el puerto local del túnel (puerta de enlace de la red de 8096 y 127.0.0.1) y **sustituye** `X-Forwarded-For` al reenviar. La API solo confía en la IP de esa nginx (`FORWARDED_ALLOW_IPS`). Un contenedor que envíe cabeceras falsas conserva su propia IP. Cualquier proceso del propio servidor con acceso a 127.0.0.1:8096 podría declarar otra IP: el servidor se considera de confianza.
- Límites: los de la API (intentos de acceso por correo e IP, registros por IP, compilaciones por estudiante y concurrencia) y, en nginx, 300 peticiones/min por IP con ráfaga de 150 (una clase detrás de una sola IP no se bloquea).
- **Registro público cerrado por defecto.** Las cuentas las crea GLOBALT con `crear-cuenta`. Registro de adultos: ver [AULA_REGISTRO_ADULTOS.md](AULA_REGISTRO_ADULTOS.md).

### Registro de adultos: requisitos y comandos

`registro abrir` **se niega** si `registro estado` no está en verde: faltan versiones **aprobadas** y vigentes de los dos documentos, el correo de producción (SMTP con STARTTLS/SSL, remitente, `AULA_URL_PUBLICA` https) o si `api.env` admite textos de prueba. Después pide escribir `ABRIR`.

```bash
sudo bash deploy/linux/aula-produccion.sh registro estado
sudo bash deploy/linux/aula-produccion.sh correo configurar               # datos SMTP; la clave se pide oculta
sudo bash deploy/linux/aula-produccion.sh correo probar --a CORREO        # envía UN correo de prueba real
sudo bash deploy/linux/aula-produccion.sh documentos cargar --tipo terminos --version V --titulo "…" --finalidad "…" --archivo terminos.md
sudo bash deploy/linux/aula-produccion.sh documentos cargar --tipo datos --version V --titulo "…" --finalidad "…" --archivo datos.md
sudo bash deploy/linux/aula-produccion.sh documentos activar --tipo terminos --version V
sudo bash deploy/linux/aula-produccion.sh documentos activar --tipo datos --version V
sudo bash deploy/linux/aula-produccion.sh registro abrir
```

Al **activar** documentos, las cuentas existentes deben aceptarlos en su siguiente acceso antes de seguir usando cursos, borradores, progreso y compilación (no se les atribuyen autorizaciones históricas). Activarlos antes de abrir el registro es posible y conviene avisarlo a esas personas. `correo desactivar` cierra también el registro. Los menores de edad no pueden registrarse: practican sin cuenta.

Pendiente fuera de este paquete: textos definitivos aprobados (Ley 1581 de 2012 y decretos), proveedor SMTP y registros SPF/DKIM/DMARC del remitente, revocación de la autorización y eliminación de cuentas.

## Orden de instalación

1. **Preparar** (antes de fusionar la PR #2), con el commit de la PR: crea credenciales, base y API, aplica migraciones, prueba con una cuenta ficticia temporal (que borra), valida la configuración nginx con `nginx -t`, instala los respaldos y hace uno comprobado. **La web pública no cambia.** Puede repetirse con el mismo commit.
2. **Fusionar la PR #2** en `main` solo después de una preparación correcta. Desde ese momento el publicador automático lleva a la web los archivos nuevos; el enlace «Aula» permanece oculto mientras `/api/aula/salud` no responda (hasta activar), y el laboratorio público sigue como hoy (sin compilador).
3. **Activar** con el commit de `main` que contiene la fusión. Comprueba que la API de ese commit es idéntica a la preparada, guarda la configuración actual, respalda la base, instala el publicador con `aula/`, publica `main`, conecta la web a la red interna, instala la configuración nginx y comprueba a través de 8096 (rutas, bloqueos, HTTPS, cuenta temporal con compilación real). Si algo falla, restaura automáticamente web, nginx y publicador.
4. **Crear cuentas** con `crear-cuenta --correo … --nombre …` (contraseña por teclado, oculta).

## Respaldos

- `globalt-aula-respaldo.timer`: diario (03:17 ± 15 min, recupera ejecuciones perdidas). También antes de activar y de actualizar.
- Destino `/var/backups/globalt-aula` (700, archivos 600). Cada copia (`pg_dump -Fc`) se **restaura en una base temporal** y se comparan conteos antes de darla por buena. Se conservan las 14 más recientes (`AULA_RESPALDOS_CONSERVAR`). `ultimo-correcto.txt` indica la última.
- Estado: `systemctl status globalt-aula-respaldo.timer` y `journalctl -u globalt-aula-respaldo.service -n 30`.
- **Pendiente: copia externa.** Estas copias están en el mismo disco y no protegen ante la pérdida o el robo del servidor. Falta definir una copia cifrada fuera del servidor (por ejemplo, otro equipo por NetBird o un almacenamiento externo) y probar su restauración periódicamente. Sin ella, la pérdida del servidor implica la pérdida de las cuentas.

## Recuperación

- **Web/configuración:** `sudo bash deploy/linux/aula-produccion.sh revertir` restaura la configuración nginx, desconecta la red interna, restaura el publicador y retira `aula/` de la web. La API y la base siguen en ejecución sin acceso público; los datos se conservan.
- **API:** `actualizar` respalda, construye y cambia la API; con el aula activada también instala la lista de rutas nginx de esa versión (copia previa en `anteriores/<fecha>/nginx-public.conf`). Si falla el arranque, las migraciones, nginx o la prueba, vuelve sola a la imagen, archivos y nginx anteriores. La base no se restaura: las migraciones solo añaden, así que la API anterior funciona con la base migrada.
- **Actualizar a la versión con registro de adultos** (instalación existente): `actualizar <commit>` con el registro cerrado. Aplica `0006_registro_adultos.sql` (solo añade), conserva cuentas, inscripciones, borradores y avances, y no cambia `api.env` (registro cerrado, correo desactivado). Sin documentos activados todo funciona como antes. Volver atrás: `actualizar <commit anterior>` no es posible (la migración 0006 no está en ese commit); la vuelta automática del propio `actualizar` sí funciona, y una vuelta manual usa la imagen `globalt-aula-produccion-api:<commit anterior>` con `compose.json` de `anteriores/`.
- **Base:** nunca automática. Restaurar sustituye todos los datos posteriores al respaldo. Primero inspeccionar en una base aparte:

  ```bash
  sudo docker exec globalt-aula-db sh -c 'createdb -U "$POSTGRES_USER" aula_inspeccion'
  sudo docker exec -i globalt-aula-db sh -c 'pg_restore -U "$POSTGRES_USER" -d aula_inspeccion --no-owner' < /var/backups/globalt-aula/aula-AAAAMMDDTHHMMSSZ.dump
  ```

  Antes de promover una copia, detener la API y reconciliar en una base aislada las bajas confirmadas posteriores al respaldo según docs/AULA_INACTIVIDAD.md. Conservar la base anterior aparte. Solo con decisión expresa del responsable, promover la copia ya comprobada y reconciliada y volver a arrancar el servicio.
- No ejecutar `docker compose … down -v` (borra el volumen) ni eliminar la red `globalt-aula_frontal` mientras esté activado: el contenedor público está conectado a ella. Para retirar el aula, `revertir` primero.

## Probado y pendiente

Probado en una réplica con Docker (no en el servidor real): web pública 8096 con su instalador original, publicador con repositorio local, emulación de Cloudflare con TLS y cabeceras `CF-Connecting-IP`/`X-Forwarded-Proto`, compilador real por socket, preparación, activación, fallo de activación con vuelta atrás, `revertir` y reactivación, `actualizar` con API rota y con versión nueva, respaldos con retención y restauración en base aparte, alta de cuenta por consola, y navegador (escritorio y móvil) con portada, juegos, robot, aula, laboratorio, compilación, simulación y reto.

Pendiente en Linux y Cloudflare reales: ejecución de estos comandos en el servidor, que el túnel envíe `CF-Connecting-IP` y llegue por la red esperada, reglas de Cloudflare (por ejemplo, «Siempre usar HTTPS» y HSTS), la copia externa de respaldos y los textos legales.
