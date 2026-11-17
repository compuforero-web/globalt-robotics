# Actualización: lecciones 9, 10 y 11 (puente H L298N y motores)

Procedimiento para llevar al servidor Linux la entrega 5.1–5.3 de `docs/RUTA_CURSO_ARDUINO.md` (modelo L298N + motores). **No se ha ejecutado nada en el servidor**: este documento solo prepara los pasos con las herramientas existentes, igual que `docs/ACTUALIZACION_LECCIONES_7_8.md`.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| API del aula | `LECCIONES` admite `arduino-l298n-direccion`, `arduino-l298n-velocidad` y `arduino-l298n-dos-motores` (`services/aula-api/app/main.py`) | **No** (la tabla `borradores` ya usa `(usuario_id, leccion_id)`) | `aula-produccion.sh actualizar` / `update-aula-preview.sh` |
| Laboratorio (estático) | `motor.js` (modelo L298N + motores configurable por pines), Worker y simulación con el modelo, circuito con L298N, batería y GND común, evaluadores `lessons/motor-eval.js`, lecciones 9–11 | — | publicador automático de `main` |
| Compilador | ninguno (`digitalWrite`/`analogWrite` del núcleo) | — | — |
| Bundle avr8js | ninguno | — | — |
| Portada, tarjeta pública, SEO, buscador, registro | ninguno (la tarjeta del curso sigue anunciando ocho lecciones hasta que se decida cambiarla) | — | — |

Compatibilidad en los dos sentidos:

- **API nueva + web anterior:** la web anterior usa las lecciones 1–8; la API las sigue admitiendo igual.
- **Web nueva + API anterior:** las lecciones 9–11 reciben 404 en `/borradores/arduino-l298n-…` y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», guardando solo en el navegador. Las lecciones 1–8 funcionan igual.

Por eso el orden es **primero la API, después la fusión** (la web se publica sola desde `main`). Cuentas, inscripciones y los borradores de las lecciones 1–8 no se tocan.

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
   Promise.all(['arduino-l298n-direccion', 'arduino-l298n-velocidad', 'arduino-l298n-dos-motores', 'arduino-ultrasonico-alerta']
     .map((id) => fetch('/api/aula/borradores/' + id, { credentials: 'same-origin' }).then((r) => r.status)))   // [200, 200, 200, 200] (antes: [404, 404, 404, 200])
   ```

3. Fusionar la PR en `main`. El publicador automático lleva el laboratorio nuevo a la web en su siguiente ciclo.
4. Comprobación final (escritorio y móvil, con la cuenta de prueba): el selector muestra 11 lecciones; en las lecciones 9–11 el estado de la cuenta dice «aún no tiene copia» o «Sincronizado» (no «todavía no se guarda»); en la 9, con «Ejecutar» y el código inicial, «Orden del puente H» pasa de «adelante» a «freno» y «Motor» muestra «deteniéndose (freno)» antes de «parado»; en la 10, con el código inicial, ENA 24 % deja el motor parado (zona muerta) y ENA 47 % lo hace girar; en la 11, el código inicial mueve los dos motores; «Comprobar reto» funciona en las tres; guardar crea el borrador de cada una sin tocar los demás; las lecciones 1–8 conservan los suyos y la 8 (alerta) sigue funcionando. Opcional, solo con el registro abierto para pruebas (crea cuentas @example.com): `AULA_SITIO=https://globalt-robotics.com LAB_URL=https://globalt-robotics.com/games/laboratorio-arduino/index.html node tests/e2e/motores.e2e.mjs`.
5. `sudo bash deploy/linux/aula-produccion.sh comprobar`.

## Recuperación

- **Fallo durante `actualizar`:** vuelta automática a la API anterior; nada que hacer salvo revisar el registro.
- **Volver a la API anterior más tarde:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit. Es seguro: no hay migración que deshacer. Los borradores de las lecciones 9–11 que ya existan quedan en la base sin usarse (la API anterior responde 404 y el laboratorio guarda en el navegador).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` (por PR); el publicador lo lleva a la web. Las lecciones 1–8 no dependen del modelo de motores (los cambios comunes —`motors` opcional en `sim-worker.js`/`simulation.js` y `onMotor` en `lab.js`— solo actúan si la lección declara motores). Las claves de `localStorage` no cambiaron: el código de las lecciones 9–11 queda guardado en el navegador para cuando vuelvan.
- **Datos:** nunca restaurar la base para revertir esta entrega. Si hiciera falta por otro motivo, seguir `RECUPERACION.txt` del respaldo, en una base aparte primero.
- **No ejecutar** `docker compose … down -v` ni borrar volúmenes o redes (ver `docs/AULA_PRODUCCION.md`).

## Pruebas realizadas antes de la PR (equipo de desarrollo, no el servidor)

PostgreSQL 16 local, API con `uvicorn` y el compilador real (avr-gcc 7.3.0 + ArduinoCore-avr 1.8.6, commit `42fa4a1e…`, HEX idénticos byte a byte a los fixtures existentes) por socket Unix y HTTP, detrás de un proxy en el mismo origen:

- `python3 scripts/check.py`; `python3 -m unittest discover -s tests` con `COMPILADOR_NUCLEO` (64 pruebas); `node --test tests/*.test.mjs`; `pytest` de la API (23: borradores propios de las lecciones 9–11, versiones, conflicto 409, aislamiento de las ocho anteriores, 404 para identificadores no listados).
- Modelo con programas compilados: ENA a 60/120/255 medido a ±0,3 puntos (23,5 %, 47,1 %, 100 %); a 60 el motor no gira, a 120 alcanza la velocidad teórica ±1 %; freno ~160 ms, rueda libre ~1 s; la integración coincide con la solución exacta del primer orden; el mismo HEX con IN1/IN2 cableados al revés invierte las órdenes (responde a los pines, no al texto); IN sin `pinMode` → «pullup», sin orden; inversión sin parada registrada al 100 %; trazas idénticas al repetir; mapa del robot sin colisiones con TRIG/ECHO/servo y probado con un programa real.
- 39 programas compilados (`tests/fixtures/laboratorio/dir-*`, `vel-*`, `dos-*`, `motor-mapa-robot`): 2 soluciones por lección aprueban; sentido incorrecto, inversión sin parada, parada corta, pin sin configurar, otros pines, tiempos, PWM en otro pin (habilitación desactivada), solo `digitalWrite`, sentido atrás, freno, rampa brusca, rampa rápida, giro a la izquierda, giro sobre una rueda, ENB sin activar, zona muerta, IN3/IN4 cambiados, giro largo, anuncio tardío, sin anuncios, recorrido repetido, códigos iniciales y ejemplos suspenden, cada uno con su comprobación y explicación.
- Chromium: `motores.e2e.mjs` (circuito y descripción accesible, programa vacío sin movimiento, órdenes frente a inercia, aviso de inversión, «sin configurar», zona muerta, rueda libre, retos, borradores locales, Pixel 7 e iPhone 13, cuenta con `AULA_SITIO`) y regresión `laboratorio`, `lecciones`, `botones`, `potenciometro`, `ultrasonico` (con cuenta) y `aula-borrador`. **No ejecutadas:** `aula-compilar.e2e.mjs` (usa `docker exec` del piloto) y `aula-produccion.e2e.mjs` (dominio público). Sin Safari/Firefox reales ni dispositivos físicos (solo emulación de Chromium).
