# Piloto privado de cuentas e inscripción

La rama `feature/aula-cuentas-inscripcion` incluye el aula y un instalador independiente. No hace falta fusionarla ni cambiar la copia de trabajo de producción para probarla.

Desde la cuenta `edwin`, clonar la rama en una carpeta nueva y ejecutar:

```bash
git clone --branch feature/aula-cuentas-inscripcion --single-branch https://github.com/compuforero-web/globalt-robotics.git ~/globalt-robotics-aula-piloto
cd ~/globalt-robotics-aula-piloto
sudo bash deploy/linux/install-aula-preview.sh
```

Abrir `http://100.117.79.42:8100/aula/` mediante NetBird. Usar solo datos ficticios, por ejemplo un nombre de prueba y un correo `alumno@example.com`. No hay envío de correos. Comprobar registro, inscripción Arduino, cierre de sesión e inicio de sesión de nuevo. La inscripción debe mantenerse. La simulación y el progreso del laboratorio siguen siendo locales al navegador; esta entrega no los asocia a la cuenta. La compilación se conserva en los laboratorios privados existentes (8094 y 8097), sin habilitarla en este piloto ni en el dominio público.

El instalador crea exclusivamente el proyecto Compose `globalt-aula-piloto`, con tres contenedores, red interna y volumen de PostgreSQL propios. Conserva una exportación del commit, credenciales aleatorias y configuración en `/var/lib/globalt-robotics-aula-preview`, accesible solo por root. Los puertos publicados son localhost y NetBird 8100. No modifica el temporizador de actualización, los contenedores existentes ni Cloudflare. El nginx nuevo reutiliza la imagen ya instalada. Las cookies sin `Secure` se usan solo para este piloto privado HTTP; publicar cuentas por HTTPS exige otro despliegue con `Secure=true` y orígenes del dominio.

Si el puerto, los contenedores o la carpeta ya existen, se detiene y conserva los datos. Una instalación interrumpida también conserva sus recursos para diagnóstico; no volver a ejecutarla ni borrar volúmenes sin revisar la salida. El proxy solo confía en la IP concreta de su nginx. Si se recrea manualmente el contenedor web y cambia de IP, actualizar `FORWARDED_ALLOW_IPS` en `api.env` y recrear la API.

Diagnóstico:

```bash
sudo docker compose -f /var/lib/globalt-robotics-aula-preview/compose.json ps
sudo docker compose -f /var/lib/globalt-robotics-aula-preview/compose.json logs --tail 30
```

Si el primer instalador dejó los tres contenedores activos pero el puerto 8100 no aparece publicado, actualizar esta rama y ejecutar `sudo bash deploy/linux/fix-aula-preview-network.sh`. La reparación añade una red de entrada únicamente a nginx; API y PostgreSQL conservan la red interna. Guarda las configuraciones anteriores y recrea solo web y API para aplicar la red y la IP de proxy confiable. No recrea la base ni elimina su volumen. No volver a ejecutar el instalador inicial.

## Actualizar el piloto ya instalado

`deploy/linux/update-aula-preview.sh <commit>` actualiza la instalación existente a un commit concreto (40 caracteres) y debe ejecutarse desde una copia del repositorio en ese mismo commit. No sirve para instalar desde cero ni toca otros proyectos, puertos, volúmenes, el compilador (8094/8097) o el dominio público.

1. **Verifica** commit, `compose.json`, contenedores, proyecto Compose, redes (web: aislada+entrada; API y PostgreSQL: solo aislada), puertos `127.0.0.1:8100` y `100.117.79.42:8100`, montajes, IP de proxy confiable, salud, espacio libre y que las migraciones ya aplicadas existan sin cambios en el commit. Ante cualquier diferencia se detiene sin modificar nada.
2. **Respalda** en `respaldos/<fecha>-<anterior>-a-<nuevo>/`: `pg_dump` comprobado restaurándolo en una base temporal (se compara el número de usuarios, inscripciones, cursos y migraciones), `configuracion.tar` (incluye credenciales; solo root), sumas SHA-256 y `RECUPERACION.txt`. Si falla, aborta.
3. **Exporta** el commit, construye `globalt-aula-api:<commit>` y solo entonces cambia: mueve `source/` anterior a `anteriores/`, sincroniza los archivos web dentro de `site/` (sin recrear nginx) y cambia únicamente la imagen de la API en `compose.json`. Recrea solo la API.
4. La API aplica las **migraciones pendientes** al arrancar con el mecanismo existente (una vez, con suma de control). El script comprueba que queden exactamente las del commit.
5. **Comprueba** página, revisión publicada, salud y borradores con una cuenta ficticia `verificacion-aula-…@example.com` creada en esa ejecución (guardar, conflicto, CSRF, cierre de sesión y recuperación), que después elimina. Comprueba que web y PostgreSQL no se recrearon y que los datos existentes no disminuyeron. Consume 1 de los 10 registros por IP cada 15 minutos.

Si falla algo después del cambio, vuelve automáticamente a la imagen, `source/`, `site/` y `compose.json` anteriores. **La base nunca se restaura automáticamente**: las migraciones nuevas quedan aplicadas y la API anterior las ignora. Restaurar la base sustituye los datos posteriores al respaldo y requiere decisión expresa (ver `RECUPERACION.txt`). Se puede repetir con el mismo commit: no duplica migraciones ni recrea contenedores si nada cambió. Los respaldos y `anteriores/` se conservan; se pueden archivar manualmente cuando ya no hagan falta. Registro de cada ejecución: `registros/`.

Detener el piloto conservando las cuentas:

```bash
sudo docker compose -f /var/lib/globalt-robotics-aula-preview/compose.json stop
```

La base requiere un respaldo independiente de GitHub antes de utilizar datos persistentes de valor. No se trasladan cuentas ni datos reales hasta definir ese respaldo y las condiciones de uso. Este instalador se comprobó con `bash -n` y generando su configuración; las pruebas reales de Docker y navegador en este servidor quedan pendientes de su ejecución.
