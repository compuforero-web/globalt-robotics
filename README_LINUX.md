# Instalar GLOBALT Robotics en globalt-server

## Estado de esta entrega

Se prepararon y probaron localmente los archivos de instalación y sincronización. **Esto no significa que estén instalados en tu servidor.** Hace falta ejecutar la instalación allí y comprobarla. No se modifican el POS, ISP Controller, ACS, Origen, NetBird ni sus contenedores.

## Primera instalación

Desde PowerShell del equipo que tiene NetBird conectado:

```powershell
ssh edwin@100.117.79.42
```

Ya dentro de Linux:

```bash
git clone https://github.com/compuforero-web/globalt-robotics.git ~/globalt-robotics
cd ~/globalt-robotics
sudo bash deploy/linux/install.sh
```

Si `~/globalt-robotics` ya existe, no lo borres: comprueba primero qué contiene. El instalador se detiene si el puerto 8093 o el contenedor están ocupados, o si no encuentra la IP NetBird documentada. Requiere Git, Python 3, Docker activo, curl y systemd. No instala paquetes del sistema ni cambia reglas de red. Descarga la imagen oficial Nginx y fija su digest para esta instalación.

Abrir desde un equipo con NetBird: **http://100.117.79.42:8093**. En el propio servidor: `http://127.0.0.1:8093`. No se expone en todas las interfaces ni se crea un acceso público. El dominio y HTTPS público se configuran después de conectar y verificar el almacenamiento compartido. NetBird debe conservar la IP indicada para la publicación privada.

## Funcionamiento

- Fuente: rama `main` de GitHub. El repositorio debe seguir siendo público para esta configuración sin credenciales. Para hacerlo privado, configurar primero acceso de lectura con clave de despliegue.
- Código e historial en Linux: repositorio Git bare en `/var/lib/globalt-robotics/repository.git`.
- Sitio activo: `/srv/globalt-robotics/current` apunta a una carpeta de `releases/` identificada por commit.
- Se conservan cinco versiones recientes, además de la activa y la anterior cuando corresponda; Git conserva el historial descargado.
- Comprobación de cambios: temporizador `globalt-robotics-sync.timer`, aproximadamente cada 60–65 segundos después de la consulta anterior. Una descarga o fallo de red puede aumentar el tiempo; al volver Internet se reintenta.
- Nginx: contenedor independiente `globalt-robotics-web`, puerto 8093, reinicio automático con Docker.
- Sincronización: usuario `globalt-robotics`, sin sudo ni acceso al socket Docker. No ejecuta archivos del repositorio.
- Las herramientas de despliegue quedan instaladas fuera de la web. Cambiarlas en GitHub **no** las ejecuta ni sustituye automáticamente: requieren revisión e instalación manual.
- La publicación copia solo `index.html`, `admin.html`, `robots.txt`, `favicon.ico` y las carpetas `assets`, `styles`, `src`, `games`, `data`. El repositorio, SQL, guías, scripts y pruebas no se sirven por HTTP. No colocar secretos en las carpetas públicas.

La copia `~/globalt-robotics` usada para instalar no se modifica con cada publicación. Para trabajar en ella: `git pull --ff-only`. La copia operativa que se actualiza automáticamente es el repositorio bare y el sitio de `/srv`.

## Comprobar instalación y actualización

```bash
sudo docker ps --filter name=globalt-robotics-web
systemctl status globalt-robotics-sync.timer --no-pager
sudo systemctl start globalt-robotics-sync.service
sudo journalctl -u globalt-robotics-sync.service -n 30 --no-pager
curl -fsS http://127.0.0.1:8093/revision.txt
```

Para verificar sincronización real, hacer un cambio pequeño visible en GitHub sobre `main`, esperar el temporizador y comparar `revision.txt` con el SHA del commit; recargar y comprobar el cambio. Esto queda pendiente hasta tener acceso al servidor.

El estado `inactive (dead)` del servicio de sincronización entre consultas es normal: es un servicio de una sola ejecución. El temporizador debe permanecer activo.

## Volver a la versión anterior

Detener primero las actualizaciones para que no vuelvan a aplicar el commit problemático:

```bash
sudo systemctl stop globalt-robotics-sync.timer
sudo -u globalt-robotics python3 /usr/local/lib/globalt-robotics/update.py --rollback
```

Comprobar la web, revertir el cambio problemático en GitHub y reactivar:

```bash
sudo systemctl start globalt-robotics-sync.timer
```

## Diagnóstico

```bash
sudo docker logs --tail 50 globalt-robotics-web
sudo journalctl -u globalt-robotics-sync.service -n 50 --no-pager
sudo docker exec globalt-robotics-web nginx -t
```

El instalador evita reemplazar un contenedor existente. Si se interrumpió antes de completarse, revisar estos registros y el estado del temporizador antes de hacer cambios; no usar borrado de volúmenes.

## Datos y respaldo

GitHub y las versiones Linux respaldan el código y el catálogo incluido. Las ediciones del panel en modo local viven en el navegador: exportarlas desde Respaldo JSON antes de cambiar de equipo/dirección o limpiar datos. La instalación no migra ese almacenamiento ni crea una base de datos. Supabase está pendiente de configuración y verificación, no instalado dentro de Linux.

## Referencias técnicas

- https://www.freedesktop.org/software/systemd/man/255/systemd.timer.html
- https://hub.docker.com/_/nginx
- https://docs.docker.com/engine/storage/bind-mounts/
