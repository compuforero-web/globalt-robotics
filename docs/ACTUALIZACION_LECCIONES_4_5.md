# Actualización: lecciones 4 (leer un pulsador) y 5 (flancos y antirrebote)

Procedimiento para llevar al servidor Linux la entrega 2.2 + 2.3 de `docs/RUTA_CURSO_ARDUINO.md` (entradas programadas). **No se ha ejecutado nada en el servidor**: este documento solo prepara los pasos con las herramientas existentes. Es el mismo mecanismo que `docs/ACTUALIZACION_LECCIONES_2_3.md`.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| API del aula | `LECCIONES` admite `arduino-boton-entrada` y `arduino-boton-flanco` (`services/aula-api/app/main.py`) | **No** (la tabla `borradores` ya usa `(usuario_id, leccion_id)`) | `aula-produccion.sh actualizar` / `update-aula-preview.sh` |
| Laboratorio (estático) | entradas programadas en la emulación (`button.js`, `nano-runner.js`, `sim-worker.js`), circuito con pulsador, lecciones 4 y 5 | — | publicador automático de `main` |
| Compilador | ninguno (`digitalRead`, `INPUT_PULLUP` y `millis` ya están en el núcleo) | — | — |
| Catálogo, portada, SEO, buscador, registro | ninguno | — | — |

Compatibilidad en los dos sentidos:

- **API nueva + web anterior:** la web anterior solo usa las lecciones 1–3; la API las sigue admitiendo igual.
- **Web nueva + API anterior:** las lecciones 4 y 5 reciben 404 en `/borradores/<id>` y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», guardando solo en el navegador. Las lecciones 1–3 funcionan igual.

Por eso el orden es **primero la API, después la fusión** (la web se publica sola desde `main`). Cuentas, inscripciones y los borradores de las lecciones 1–3 no se tocan.

## Antes

1. CI de la PR en verde.
2. En el servidor, `git fetch` del repositorio y anotar el commit completo de la PR (`<PR>`, 40 caracteres) y el actual de la API: `sudo cat /var/lib/globalt-robotics-aula/revision.txt` (producción) o el que indique el piloto.
3. Comprobación de solo lectura: `sudo bash deploy/linux/aula-produccion.sh comprobar` (debe mostrar un respaldo de menos de 30 h).

## Piloto privado (8100), opcional como ensayo

Desde una copia del repositorio en `<PR>`:

```bash
sudo bash deploy/linux/update-aula-preview.sh <PR>
```

Respalda PostgreSQL y la configuración, construye la API, sincroniza la web del piloto, comprueba página, salud, borradores y una compilación real con una cuenta ficticia que luego elimina. Si algo falla, vuelve sola a la API y la web anteriores (la base nunca se restaura automáticamente; ver `RECUPERACION.txt` del respaldo).

## Producción

1. Desde una copia del repositorio en `<PR>` (el script exige ejecutar la copia de ese commit):

   ```bash
   sudo bash deploy/linux/aula-produccion.sh actualizar <PR>
   ```

   Hace un respaldo comprobado, construye la imagen, cambia solo el contenedor de la API, verifica migraciones (no hay nuevas) y ejecuta la prueba funcional. Ante cualquier fallo vuelve sola a la imagen anterior (`anteriores/`).
2. Verificación de la API nueva (la web pública sigue siendo la anterior hasta fusionar): con una cuenta de prueba ya creada (`crear-cuenta`) e inscrita, iniciar sesión en el aula y, en la consola del navegador:

   ```js
   fetch('/api/aula/borradores/arduino-boton-flanco', { credentials: 'same-origin' }).then((r) => r.status)   // 200 (antes: 404)
   ```

3. Fusionar la PR en `main`. El publicador automático lleva el laboratorio nuevo a la web en su siguiente ciclo.
4. Comprobación final (navegador, escritorio y móvil, con la cuenta de prueba): las cinco lecciones abren desde el selector; en las lecciones 4 y 5 el estado de la cuenta dice «aún no tiene copia» o «Sincronizado» (no «todavía no se guarda»); con «Ejecutar», mantener «Pulsador (D2)» enciende el LED con el código de la solución (y con el dedo en el móvil); «Comprobar reto» funciona; guardar crea el borrador de esa lección; las lecciones 1–3 conservan su borrador. Opcional: `AULA_SITIO=https://globalt-robotics.com LAB_URL=https://globalt-robotics.com/games/laboratorio-arduino/index.html node tests/e2e/botones.e2e.mjs` solo si el registro está abierto para pruebas (crea cuentas @example.com); con el registro cerrado, usar la comprobación manual anterior.
5. `sudo bash deploy/linux/aula-produccion.sh comprobar`.

## Recuperación

- **Fallo durante `actualizar`:** vuelta automática a la API anterior; nada que hacer salvo revisar el registro.
- **Volver a la API anterior más tarde:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit. Es seguro: no hay migración que deshacer. Los borradores de las lecciones 4 y 5 que ya existan quedan en la base sin usarse (la API anterior responde 404 y el laboratorio sigue guardando en el navegador).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` (por PR); el publicador lo lleva a la web. Las claves de `localStorage` no cambiaron, así que el código guardado de las lecciones 1–3 sigue ahí; el de las lecciones 4 y 5 queda guardado en el navegador para cuando vuelvan.
- **Datos:** nunca restaurar la base para revertir esta entrega. Si hiciera falta por otro motivo, seguir `RECUPERACION.txt` del respaldo, en una base aparte primero.
- **No ejecutar** `docker compose … down -v` ni borrar volúmenes o redes (ver `docs/AULA_PRODUCCION.md`).

## Pruebas realizadas antes de la PR (equipo de desarrollo, no el servidor)

PostgreSQL 16 local, API con `uvicorn` y el compilador real (avr-gcc 7.3.0 + ArduinoCore-avr 1.8.6) por socket Unix y por HTTP, detrás de un proxy en el mismo origen:

- `python3 scripts/check.py`; `python3 -m unittest discover -s tests` con `COMPILADOR_NUCLEO` (incluye las pruebas del compilador real); `pytest` de la API (23, con borradores aislados por estudiante y lección para los cinco identificadores y 404 para los no listados).
- 22 fixtures nuevos compilados con el compilador real (`tests/fixtures/laboratorio/boton-*`, `flanco-*`): 2 soluciones de la lección 4 y 4 de la lección 5 aprueban; sin pull-up, lógica sin invertir, LED lento, mensajes repetidos, anterior sin actualizar, sin antirrebote, al soltar, espera larga, sin LED, código inicial y ejemplos suspenden con su comprobación.
- Chromium: `botones.e2e.mjs` (ratón, teclado, toque mantenido en Pixel 7 e iPhone 13, pin flotante, guion en tiempo real, reto, borradores locales, cambio de lección y cuenta con `AULA_SITIO`) y regresión `laboratorio.e2e.mjs`, `lecciones.e2e.mjs` (con cuenta), `aula.e2e.mjs` y `aula-borrador.e2e.mjs`. La compilación a través de la API del aula se probó dentro de `botones.e2e.mjs`. **No se ejecutaron:** `aula-compilar.e2e.mjs` (consulta la base del piloto con `docker exec`; aquí no hay Docker) ni `aula-produccion.e2e.mjs` (necesita el dominio público); tampoco se probó en Safari/Firefox reales ni en dispositivos físicos (solo emulación de Chromium).
