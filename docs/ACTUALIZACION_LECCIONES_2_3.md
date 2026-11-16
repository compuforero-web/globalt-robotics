# Actualización: lecciones 2 (semáforo) y 3 (PWM)

Procedimiento para llevar al servidor Linux la entrega de `docs/RUTA_CURSO_ARDUINO.md` §5. **No se ha ejecutado nada en el servidor**: este documento solo prepara los pasos con las herramientas existentes.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| API del aula | `LECCIONES` admite `arduino-protoboard-semaforo` y `arduino-pwm-brillo` (`services/aula-api/app/main.py`) | **No** (la tabla `borradores` ya usa `(usuario_id, leccion_id)`) | `aula-produccion.sh actualizar` / `update-aula-preview.sh` |
| Laboratorio (estático) | manifiesto de lecciones, `?leccion=`, medición PWM, lecciones 2 y 3 | — | publicador automático de `main` |
| Compilador | ninguno | — | — |

Compatibilidad en los dos sentidos:

- **API nueva + web anterior:** la web anterior solo usa `arduino-led-serie`; la API la sigue admitiendo igual.
- **Web nueva + API anterior:** las lecciones 2 y 3 reciben 404 en `/borradores/<id>` y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», guardando solo en el navegador. La lección 1 funciona igual.

Por eso el orden es **primero la API, después la fusión** (la web se publica sola desde `main`). Los borradores de la lección 1, las cuentas y las inscripciones no se tocan.

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
   fetch('/api/aula/borradores/arduino-pwm-brillo', { credentials: 'same-origin' }).then((r) => r.status)   // 200 (antes: 404)
   ```

3. Fusionar la PR en `main`. El publicador automático lleva el laboratorio nuevo a la web en su siguiente ciclo.
4. Comprobación final (navegador, escritorio y móvil, con la cuenta de prueba): las tres lecciones abren desde el selector; en las lecciones 2 y 3 el estado de la cuenta dice «aún no tiene copia» o «Sincronizado» (no «todavía no se guarda»); guardar crea su borrador; la lección 1 conserva su borrador. Opcional: `AULA_SITIO=https://globalt-robotics.com LAB_URL=https://globalt-robotics.com/games/laboratorio-arduino/index.html node tests/e2e/lecciones.e2e.mjs` solo si el registro está abierto para pruebas (crea cuentas @example.com); con el registro cerrado, usar la comprobación manual anterior.
5. `sudo bash deploy/linux/aula-produccion.sh comprobar`.

## Recuperación

- **Fallo durante `actualizar`:** vuelta automática a la API anterior; nada que hacer salvo revisar el registro.
- **Volver a la API anterior más tarde:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit. Es seguro: no hay migración que deshacer. Los borradores de las lecciones 2 y 3 que ya existan quedan en la base sin usarse (la API anterior responde 404 y el laboratorio sigue guardando en el navegador).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` (por PR); el publicador lo lleva a la web. Las claves de `localStorage` no cambiaron, así que el código guardado de la lección 1 sigue ahí; el de las lecciones 2 y 3 queda guardado en el navegador para cuando vuelvan.
- **Datos:** nunca restaurar la base para revertir esta entrega. Si hiciera falta por otro motivo, seguir `RECUPERACION.txt` del respaldo, en una base aparte primero.
- **No ejecutar** `docker compose … down -v` ni borrar volúmenes o redes (ver `docs/AULA_PRODUCCION.md`).

## Pruebas realizadas antes de la PR (equipo de desarrollo, no el servidor)

PostgreSQL 16 local, API con `uvicorn` y el compilador real (avr-gcc 7.3.0 + ArduinoCore-avr 1.8.6) por socket Unix, detrás de un proxy en el mismo origen: `pytest` de la API (23), pruebas unitarias del repositorio, y en Chromium `laboratorio.e2e.mjs`, `aula.e2e.mjs`, `aula-borrador.e2e.mjs`, `aula-compilar.e2e.mjs` (regresión) y `lecciones.e2e.mjs` con cuenta y con la prueba larga de 60 s. `aula-produccion.e2e.mjs` necesita el dominio público y no se ejecutó.
