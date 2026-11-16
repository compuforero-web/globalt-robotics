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

Detener el piloto conservando las cuentas:

```bash
sudo docker compose -f /var/lib/globalt-robotics-aula-preview/compose.json stop
```

La base requiere un respaldo independiente de GitHub antes de utilizar datos persistentes de valor. No se trasladan cuentas ni datos reales hasta definir ese respaldo y las condiciones de uso. Este instalador se comprobó con `bash -n` y generando su configuración; las pruebas reales de Docker y navegador en este servidor quedan pendientes de su ejecución.
