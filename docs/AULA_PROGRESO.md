# Progreso del curso sincronizado por estudiante

## Alcance

- **Aula**: el curso de Arduino muestra las 15 lecciones del manifiesto del laboratorio (`games/laboratorio-arduino/src/lessons/index.js`, cargado desde el aula) con «Sin comenzar», «En curso» o «Completada», el número de completadas y **Continuar** (la última lección visitada; si ya está completada, la siguiente sin completar).
- **Cuenta**: por estudiante y lección se guardan la última visita, el paso actual, los pasos vistos y la primera/última vez que se superó el reto. Se recupera desde cualquier navegador al iniciar sesión.
- **Finalización**: solo la registra el laboratorio después de superar el evaluador existente (`result.passed`). Abrir la lección, recorrer pasos, guardar código, compilar o pedir pistas solo la dejan «En curso».

## El resultado es declarativo

El evaluador se ejecuta en el navegador del estudiante; el servidor guarda lo que el laboratorio declara (`"evaluacion": "navegador"` en la API). **No es una evaluación verificada por el servidor**: cualquiera con su sesión puede declarar un reto superado. No debe usarse para certificados, notas, permisos ni requisitos. Así se indica en el aula, en el laboratorio, en la migración y en la API.

## Diseño

- API: `GET /api/aula/mis-cursos` añade `progreso` a cada curso con lecciones; `POST /api/aula/mis-cursos` registra avance de una lección. Se usa esa ruta porque `deploy/linux/nginx-public-aula.conf` solo deja pasar una lista cerrada de rutas: no hay que cambiar infraestructura y basta con `aula-produccion.sh actualizar`.
- Seguridad sin cambios: sesión de servidor, CSRF, origen, tamaño de cuerpo (16 KB), JSON estricto (`extra='forbid'`, enteros y booleanos estrictos), inscripción en el curso de la lección, límite de nginx. La identidad sale de la sesión; el cuerpo no puede indicar usuario ni fechas de finalización. Registro cerrado sin cambios.
- Fusión en el servidor: pasos vistos = unión; `completada_en` = primera; `superada_en` = última; el paso solo cambia con una visita más reciente (fecha del navegador acotada a [ahora − 30 días, ahora]). Reintentar o repetir no duplica ni hace retroceder nada; un pendiente antiguo no pisa un avance más nuevo de otro navegador.
- Migración nueva `0004_progreso.sql`: solo crea `progreso_lecciones` (con `ON DELETE CASCADE`). Las migraciones aplicadas no cambian; la API anterior ignora la tabla.

## Separación entre estudiantes (también en navegador compartido)

- Con cuenta activa, el laboratorio muestra solo el progreso de esa cuenta y **no escribe** en el registro local sin cuenta (`globalt.laboratorio.arduino.v1`), que se conserva tal cual. Ese registro previo **nunca se sube ni se atribuye** a una cuenta.
- El avance que no se pudo enviar va a una cola **por cuenta** (`globalt.aula.progreso-pendiente.v1.<huella SHA-256 del correo>`; sin correo ni credenciales). Antes de enviar se consulta la sesión: si pertenece a otra cuenta, no se envía nada.
- Al superar un reto con cuenta se comprueba primero la sesión: si cambió de cuenta o caducó, no se registra en ninguna; si no hay red, queda en la cola de la cuenta de la página.
- El CSRF en memoria de una pestaña no vale con la sesión de otra cuenta (403). Al cerrar sesión o entrar en el aula se avisa a las pestañas del laboratorio del mismo navegador (BroadcastChannel) y dejan de registrar para la cuenta anterior.
- Al cerrar sesión, el aula intenta enviar la cola (máx. 5 s); lo pendiente queda solo para esa cuenta y se envía cuando vuelva a entrar (aula o laboratorio). Botón «Reintentar» en ambos y reintento al recuperar la conexión.
- Borradores, copias de respaldo y conflictos de versión del código no cambian.

## Pruebas ejecutadas

- `python3 scripts/check.py` y `python3 -m unittest discover -s tests` (incluye `node --test tests/progreso-cuenta.test.mjs`: colas por cuenta, errores, idempotencia, «Continuar»).
- `services/aula-api/tests` con PostgreSQL 16 (`AULA_TEST_DATABASE_URL=… python -m pytest -q services/aula-api/tests`): aislamiento entre cuentas y lecciones, sesión/CSRF/origen/inscripción/validación/415/413, leer-guardar-compilar-recorrer no completa, idempotencia y no retroceso, otro navegador, borrado en cascada.
- Banco local (PostgreSQL, API, compilador avr-gcc 7.3.0 real y proxy con la misma lista de rutas que el nginx público), Chromium escritorio y Pixel 7:
  - `AULA_SITIO=http://127.0.0.1:8180 node tests/e2e/aula-progreso.e2e.mjs` (nueva)
  - `aula.e2e.mjs`, `aula-borrador.e2e.mjs`, `lecciones.e2e.mjs` (con `AULA_SITIO`) y `laboratorio.e2e.mjs`.
  - `deploy/linux/aula-prueba.py` contra la API con cookies Secure y registro cerrado.
  - API de `main` sobre la base con `0004` aplicada: arranca, ignora la tabla y responde 405 al POST (el cliente lo trata como «no disponible» y conserva la cola).
- No probado: Linux de producción, Cloudflare, nginx real (se simuló su lista de rutas) ni `aula-compilar.e2e.mjs` (detiene el compilador con Docker).

## Despliegue: API antes que web

Fijar el SHA completo de la PR y actualizar la API (respaldo comprobado, migración 0004, prueba funcional con progreso y vuelta automática a la API anterior si falla; no restaura PostgreSQL):

```bash
cd ~/globalt-robotics-aula-piloto &&
git fetch origin feature/progreso-curso &&
git checkout --detach <SHA_COMPLETO_PR> &&
sudo bash deploy/linux/aula-produccion.sh comprobar &&
sudo bash deploy/linux/aula-produccion.sh actualizar <SHA_COMPLETO_PR> &&
sudo bash deploy/linux/aula-produccion.sh comprobar
```

Después: fusionar la PR y esperar el publicador. Con una cuenta inscrita: abrir el aula (15 lecciones), entrar en una lección, superar un reto, comprobar «Completada» desde otro navegador y cerrar sesión. No hace falta tocar nginx, el compilador ni Cloudflare.

## Recuperación

- Si `actualizar` falla, el script vuelve solo a la API anterior; la tabla nueva queda y la API anterior la ignora.
- Para volver manualmente: situarse en el commit anterior de la API (`d89deec…`, main actual) y ejecutar su `aula-produccion.sh actualizar`. **Nota:** ese script comprueba que las migraciones aplicadas existan en el commit destino, y `0004` no existe en `main` anterior, así que lo rechazará; en ese caso usar la vuelta automática o publicar una revisión que conserve `0004_progreso.sql`. Nunca restaurar PostgreSQL ni borrar `progreso_lecciones` para deshacer esta entrega.
- Si la web ya se fusionó y la API vuelve atrás, el laboratorio y el aula siguen funcionando como antes (tarjeta «Abrir laboratorio», registro local) y la cola de cada cuenta se conserva hasta que la API vuelva a admitir progreso.
