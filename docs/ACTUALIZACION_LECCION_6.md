# Actualización: lección 6 (potenciómetro y PWM)

Procedimiento para llevar al servidor Linux la entrega 2.4 de `docs/RUTA_CURSO_ARDUINO.md` (ADC en la emulación). **No se ha ejecutado nada en el servidor**: este documento solo prepara los pasos con las herramientas existentes, igual que `docs/ACTUALIZACION_LECCIONES_4_5.md`.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| API del aula | `LECCIONES` admite `arduino-potenciometro-pwm` (`services/aula-api/app/main.py`) | **No** (la tabla `borradores` ya usa `(usuario_id, leccion_id)`) | `aula-produccion.sh actualizar` / `update-aula-preview.sh` |
| Laboratorio (estático) | bundle `avr8js@0.21.1` regenerado con `AVRADC`/`adcConfig`; ADC en `nano-runner.js`; `pot.js`; circuito con potenciómetro; lección 6 | — | publicador automático de `main` |
| Compilador | ninguno (`analogRead` y `map` ya están en el núcleo) | — | — |
| Portada, tarjeta pública, SEO, buscador, registro | ninguno | — | — |

Compatibilidad en los dos sentidos:

- **API nueva + web anterior:** la web anterior usa las lecciones 1–5; la API las sigue admitiendo igual.
- **Web nueva + API anterior:** la lección 6 recibe 404 en `/borradores/arduino-potenciometro-pwm` y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», guardando solo en el navegador. Las lecciones 1–5 funcionan igual.

Por eso el orden es **primero la API, después la fusión** (la web se publica sola desde `main`). Cuentas, inscripciones y los borradores de las lecciones 1–5 no se tocan.

## Antes

1. CI de la PR en verde.
2. En el servidor, `git fetch` del repositorio y anotar el commit completo de la PR (`<PR>`, 40 caracteres) y el actual de la API: `sudo cat /var/lib/globalt-robotics-aula/revision.txt` (producción) o el que indique el piloto.
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
   fetch('/api/aula/borradores/arduino-potenciometro-pwm', { credentials: 'same-origin' }).then((r) => r.status)   // 200 (antes: 404)
   ```

3. Fusionar la PR en `main`. El publicador automático lleva el laboratorio nuevo a la web en su siguiente ciclo.
4. Comprobación final (escritorio y móvil, con la cuenta de prueba): las seis lecciones abren desde el selector; en la lección 6 el estado de la cuenta dice «aún no tiene copia» o «Sincronizado» (no «todavía no se guarda»); con «Ejecutar» y el código inicial, mover «Potenciómetro (A0)» cambia «Última lectura de analogRead» (0 a 1023); «Comprobar reto» funciona; guardar crea el borrador de la lección 6; las lecciones 1–5 conservan los suyos; la lección 3 (PWM) y la 5 (pulsador) siguen funcionando. Opcional, solo con el registro abierto para pruebas (crea cuentas @example.com): `AULA_SITIO=https://globalt-robotics.com LAB_URL=https://globalt-robotics.com/games/laboratorio-arduino/index.html node tests/e2e/potenciometro.e2e.mjs`.
5. `sudo bash deploy/linux/aula-produccion.sh comprobar`.

## Recuperación

- **Fallo durante `actualizar`:** vuelta automática a la API anterior; nada que hacer salvo revisar el registro.
- **Volver a la API anterior más tarde:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit. Es seguro: no hay migración que deshacer. Los borradores de la lección 6 que ya existan quedan en la base sin usarse (la API anterior responde 404 y el laboratorio guarda en el navegador).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` (por PR); el publicador lo lleva a la web. Revierte también el bundle con ADC; las lecciones 1–5 no lo usan. Las claves de `localStorage` no cambiaron: el código de la lección 6 queda guardado en el navegador para cuando vuelva.
- **Datos:** nunca restaurar la base para revertir esta entrega. Si hiciera falta por otro motivo, seguir `RECUPERACION.txt` del respaldo, en una base aparte primero.
- **No ejecutar** `docker compose … down -v` ni borrar volúmenes o redes (ver `docs/AULA_PRODUCCION.md`).

## Pruebas realizadas antes de la PR (equipo de desarrollo, no el servidor)

PostgreSQL 16 local, API con `uvicorn` y el compilador real (avr-gcc 7.3.0 + ArduinoCore-avr 1.8.6) por socket Unix y HTTP, detrás de un proxy en el mismo origen:

- Bundle: la receta reproduce byte a byte el bundle anterior; el nuevo solo añade exportaciones.
- `python3 scripts/check.py`; `python3 -m unittest discover -s tests` con `COMPILADOR_NUCLEO`; `pytest` de la API (borrador propio de la lección 6, versiones y aislamiento de las cinco anteriores, 404 para identificadores no listados).
- ADC con el programa compilado en 0; 0,004; 0,005; 0,6; 1,25; 2,5; 3,3; 3,75; 4,995 y 5 V, y fuera de rango (7 V y −1 V): lecturas exactas y PWM de D9 según `map`.
- 15 programas compilados (`tests/fixtures/laboratorio/pot-*`): 2 soluciones aprueban; sin escala, invertido, otro canal, otro pin, pin sin PWM, umbral digital, ritmo de 100 ms, sin serie, voltios en lugar de lectura, `delay(250)`, código inicial y ejemplos suspenden, cada uno con su comprobación.
- Chromium: `potenciometro.e2e.mjs` (teclado, ratón, arrastre táctil en Pixel 7 e iPhone 13, guion, reto, borradores locales, cuenta con `AULA_SITIO`) y regresión `laboratorio`, `lecciones` (con cuenta), `botones` (con cuenta), `aula` y `aula-borrador`. **No ejecutadas:** `aula-compilar.e2e.mjs` (usa `docker exec` del piloto; aquí no hay Docker) y `aula-produccion.e2e.mjs` (dominio público). Sin Safari/Firefox reales ni dispositivos físicos (solo emulación de Chromium).
