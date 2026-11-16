# Laboratorio Arduino: prueba privada en Linux

## Revisión

PR #1, commit revisado `e8234be551585c4ba80015d3794a4676d546c144`. Las regresiones reproducidas en la revisión anterior ahora se rechazan, se eliminaron los callbacks `preexec_fn`, se limita la captura de salida y la evaluación correlaciona cada mensaje con su encendido. En el entorno de revisión: 22 pruebas aprobadas y 2 omitidas por falta de AVR/core. También se probó el límite de archivo: una escritura de 17 MiB se detiene en 16 MiB. Las pruebas de Docker y Chromium reportadas por Claude no se repitieron en este entorno sin Docker.

## Instalación de prueba

Desde `~/globalt-robotics`, rama main:

```bash
git pull --ff-only
sudo bash deploy/linux/install-lab-preview.sh
```

El instalador:

1. Comprueba que 8097 y los nombres nuevos estén libres, detecta el grupo real de Nginx y verifica NetBird.
2. Descarga la rama de la PR sin cambiar la rama de trabajo; exige el SHA revisado. Si Claude añadió otro commit, se detiene para revisar ese cambio.
3. Exporta los archivos del commit a `/var/lib/globalt-robotics-lab/`, sin servir el repositorio ni ejecutar scripts de la rama en el host.
4. Construye la imagen de compilación, ejecuta las pruebas del servicio con AVR/core reales dentro de un contenedor limitado y verifica el límite efectivo de archivo de 16 MiB.
5. Inicia `globalt-arduino-compiler`: sin red, con init para recoger huérfanos, usuario sin privilegios, filesystem de solo lectura, tmpfs de 64 MiB, CPU 1, RAM 768 MiB y una compilación simultánea. Solo escucha en socket Unix compartido.
6. Inicia `globalt-arduino-preview`: sirve una copia fija del frontend de la PR y conecta `/api/arduino/` con el socket. Aplica tamaño máximo de petición y límite de frecuencia.
7. Comprueba salud, HTML, compilación correcta y diagnósticos de código erróneo por el proxy real.

Las pruebas y la construcción pueden tardar varios minutos. El script fue revisado sintácticamente; su ejecución real en Docker/Linux debe completarse en el servidor. Una interrupción conserva la exportación para diagnóstico. Si falla después de iniciar los contenedores nuevos, elimina únicamente los creados por esa ejecución; conserva los demás proyectos y las exportaciones.

## Dirección de prueba

Con NetBird conectado:

`http://100.117.79.42:8097/games/laboratorio-arduino/index.html`

También se publica en `127.0.0.1:8097` para comprobaciones del servidor. No se añade ruta Cloudflare. La web pública continúa en 8096; administración privada en 8094. No se modifican Origen, Restaurante ni ISP Controller. La PR sigue sin fusionarse durante esta fase. El acceso al piloto se confía a la red privada NetBird; no equivale a autenticación de estudiantes.

## Prueba del usuario

Ejecutar el ejemplo, modificar el parpadeo, introducir un error de sintaxis, detener/reiniciar, observar el monitor serie, guardar y recuperar el código, probar las pistas de Chispa y resolver el reto. El progreso sigue siendo local del navegador; no hay cuentas ni inscripciones reales.

## Diagnóstico

```bash
sudo docker ps --filter name=globalt-arduino
sudo docker logs --tail 50 globalt-arduino-compiler
sudo docker logs --tail 30 globalt-arduino-preview
curl -fsS http://127.0.0.1:8097/api/arduino/salud
```

Una vez comprobado el piloto, la IA principal podrá fusionar la PR y preparar su promoción a la entrada privada estable. El compilador público seguirá requiriendo una decisión separada sobre autenticación, cuotas y capacidad. La sincronización de main no actualiza por sí misma imágenes, configuraciones ni servicios de compilación.
