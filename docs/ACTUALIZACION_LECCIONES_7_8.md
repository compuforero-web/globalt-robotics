# Actualización: lecciones 7 y 8 (sensor ultrasónico HC-SR04)

Procedimiento para llevar al servidor Linux la entrega 4.1 + 4.2 de `docs/RUTA_CURSO_ARDUINO.md` (modelo HC-SR04). **No se ha ejecutado nada en el servidor**: este documento solo prepara los pasos con las herramientas existentes, igual que `docs/ACTUALIZACION_LECCION_6.md`.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| API del aula | `LECCIONES` admite `arduino-ultrasonico-distancia` y `arduino-ultrasonico-alerta` (`services/aula-api/app/main.py`) | **No** (la tabla `borradores` ya usa `(usuario_id, leccion_id)`) | `aula-produccion.sh actualizar` / `update-aula-preview.sh` |
| Laboratorio (estático) | `sonar.js` (modelo HC-SR04), `pinListeners` en `nano-runner.js`, Worker y simulación con el obstáculo, circuito con sensor y obstáculo móvil, lecciones 7 y 8 | — | publicador automático de `main` |
| Compilador | ninguno (`pulseIn`, `micros` y `delayMicroseconds` ya están en el núcleo) | — | — |
| Bundle avr8js | ninguno | — | — |
| Portada, tarjeta pública, SEO, buscador, registro | ninguno | — | — |

Compatibilidad en los dos sentidos:

- **API nueva + web anterior:** la web anterior usa las lecciones 1–6; la API las sigue admitiendo igual.
- **Web nueva + API anterior:** las lecciones 7 y 8 reciben 404 en `/borradores/arduino-ultrasonico-…` y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», guardando solo en el navegador. Las lecciones 1–6 funcionan igual.

Por eso el orden es **primero la API, después la fusión** (la web se publica sola desde `main`). Cuentas, inscripciones y los borradores de las lecciones 1–6 no se tocan.

## Antes

1. CI de la PR en verde.
2. En el servidor, `git fetch` del repositorio y anotar el commit completo de la PR (`<PR>`, 40 caracteres) y el actual de la API: `sudo cat /var/lib/globalt-robotics-aula/revision.txt` (producción) o el que indique el piloto. Ese es el `<commit anterior>` de la recuperación.
3. Comprobación de solo lectura: `sudo bash deploy/linux/aula-produccion.sh comprobar` (debe mostrar un respaldo de menos de 30 h).

## Piloto privado (8100), opcional como ensayo

Desde una copia del repositorio en `<PR>`:

```bash
sudo bash deploy/linux/update-aula-preview.sh <PR>
```

Respalda PostgreSQL y la configuración, construye la API, sincroniza la web del piloto y comprueba página, salud, borradores y una compilación real con una cuenta ficticia que luego elimina. Ante un fallo vuelve sola a la API y la web anteriores (la base nunca se restaura automáticamente; ver `RECUPERACION.txt` del respaldo).

## Producción

1. Desde una copia del repositorio en `<PR>` (el script exige ejecutar la copia de ese commit):

   ```bash
   sudo bash deploy/linux/aula-produccion.sh actualizar <PR>
   ```

   Hace un respaldo comprobado, construye la imagen, cambia solo el contenedor de la API, verifica migraciones (no hay nuevas) y ejecuta la prueba funcional. Ante cualquier fallo vuelve sola a la imagen anterior (`anteriores/`).
2. Verificación de la API nueva (la web pública sigue siendo la anterior hasta fusionar): con una cuenta de prueba creada (`crear-cuenta`) e inscrita, iniciar sesión en el aula y, en la consola del navegador:

   ```js
   Promise.all(['arduino-ultrasonico-distancia', 'arduino-ultrasonico-alerta', 'arduino-potenciometro-pwm']
     .map((id) => fetch('/api/aula/borradores/' + id, { credentials: 'same-origin' }).then((r) => r.status)))   // [200, 200, 200] (antes: [404, 404, 200])
   ```

3. Fusionar la PR en `main`. El publicador automático lleva el laboratorio nuevo a la web en su siguiente ciclo.
4. Comprobación final (escritorio y móvil, con la cuenta de prueba): las ocho lecciones abren desde el selector; en las lecciones 7 y 8 el estado de la cuenta dice «aún no tiene copia» o «Sincronizado» (no «todavía no se guarda»); en la 7, con «Ejecutar» y el código inicial, mover «Obstáculo» cambia la duración del eco en el monitor y «Último pulso TRIG» marca ✓; marcar «Sin obstáculo» da unos 37 800 µs; en la 8, con el código inicial y «Sin obstáculo», el monitor muestra `pulseIn = 0`; «Comprobar reto» funciona en ambas; guardar crea el borrador de cada una sin tocar el de la otra; las lecciones 1–6 conservan los suyos y la 6 (potenciómetro) sigue funcionando. Opcional, solo con el registro abierto para pruebas (crea cuentas @example.com): `AULA_SITIO=https://globalt-robotics.com LAB_URL=https://globalt-robotics.com/games/laboratorio-arduino/index.html node tests/e2e/ultrasonico.e2e.mjs`.
5. `sudo bash deploy/linux/aula-produccion.sh comprobar`.

## Recuperación

- **Fallo durante `actualizar`:** vuelta automática a la API anterior; nada que hacer salvo revisar el registro.
- **Volver a la API anterior más tarde:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit. Es seguro: no hay migración que deshacer. Los borradores de las lecciones 7 y 8 que ya existan quedan en la base sin usarse (la API anterior responde 404 y el laboratorio guarda en el navegador).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` (por PR); el publicador lo lleva a la web. Las lecciones 1–6 no dependen del modelo HC-SR04 (el único cambio común es `pinListeners` en `nano-runner.js`, que no usan). Las claves de `localStorage` no cambiaron: el código de las lecciones 7 y 8 queda guardado en el navegador para cuando vuelvan.
- **Datos:** nunca restaurar la base para revertir esta entrega. Si hiciera falta por otro motivo, seguir `RECUPERACION.txt` del respaldo, en una base aparte primero.
- **No ejecutar** `docker compose … down -v` ni borrar volúmenes o redes (ver `docs/AULA_PRODUCCION.md`).

## Pruebas realizadas antes de la PR (equipo de desarrollo, no el servidor)

PostgreSQL 16 local, API con `uvicorn` y el compilador real (avr-gcc 7.3.0 + ArduinoCore-avr 1.8.6) por socket Unix y HTTP, detrás de un proxy en el mismo origen:

- `python3 scripts/check.py`; `python3 -m unittest discover -s tests` con `COMPILADOR_NUCLEO`; `node --test tests/*.test.mjs`; `pytest` de la API (borradores propios de las lecciones 7 y 8, versiones, conflicto 409 y aislamiento de las seis anteriores, 404 para identificadores no listados).
- Modelo con el programa compilado: subida de ECHO 0–2 ciclos tarde y duración a ≤ 2,5 ciclos de la teórica (2, 10, 35, 80, 150, 400 cm y sin eco); `pulseIn` a ≤ 1 % (−0,6 % típico, por Timer0) de 2 a 400 cm; con límite de 30 000 y 5000 µs devuelve 0 y no espera más del límite; sin límite y sin eco, ~37 800 µs tras ~38,5 ms; TRIG de ~7 µs y TRIG sin `pinMode(OUTPUT)` ignorados; disparo mientras mide ignorado; cambio de distancia a mitad de una medida aplicado a la siguiente; trazas idénticas al repetir; ejecución nueva sin restos de la anterior.
- 29 programas compilados (`tests/fixtures/laboratorio/ultra-*`, `alerta-*`): 2 soluciones de la 7 y 3 de la 8 aprueban; TRIG corto, factor 29, microsegundos sin convertir, pines cambiados, sin `pinMode`, lento, 115200 baudios, disparos seguidos, valor fijo sin medir, 0 sin tratar, sin tiempo máximo, aviso tardío, «Fuera de rango» con eco, invertido, sin PWM, otro pin, ciclo de 400 ms, códigos iniciales y ejemplos suspenden, cada uno con su comprobación.
- Chromium: `ultrasonico.e2e.mjs` (teclado, ratón, casilla, arrastre táctil en Pixel 7 e iPhone 13, TRIG inválido, RESET con y sin guion, guion, retos, borradores locales, cuenta con `AULA_SITIO`) y regresión `laboratorio`, `lecciones` (con cuenta), `botones` (con cuenta), `potenciometro` (con cuenta), `aula` y `aula-borrador`. **No ejecutadas:** `aula-compilar.e2e.mjs` (usa `docker exec` del piloto; aquí no hay Docker) y `aula-produccion.e2e.mjs` (dominio público). Sin Safari/Firefox reales ni dispositivos físicos (solo emulación de Chromium).
