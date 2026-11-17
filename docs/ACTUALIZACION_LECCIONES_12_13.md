# Actualización: lecciones 12 y 13 (servo) y compilador con la librería Servo

Procedimiento para llevar al servidor Linux la entrega 3.1–3.2 de `docs/RUTA_CURSO_ARDUINO.md`, cumpliendo `docs/PLAN_DESPLIEGUE_SERVO.md`. **No se ha ejecutado nada en el servidor.** Lo ejecuta Edwin con la coordinación de ChatGPT; se comparte solo el resultado final o los errores, nunca contraseñas ni secretos.

## Qué cambia

| Parte | Cambio | Migración | Cómo llega |
|---|---|---|---|
| Compilador | Librería oficial Servo 1.3.0 (commit `2862ad9864d0dda5669b264857deafbba624940d`, LGPL-2.1) compilada y enlazada; solo `Servo.h` y `avr/ServoTimers.h` incluibles; `version.servo` en `/salud`; parada ordenada con SIGTERM. Núcleo 1.8.6, avr-gcc 7.3.0 e imagen base sin cambios | — | `deploy/linux/compilador-produccion.sh` (imagen nueva) |
| API del aula | `LECCIONES` admite `arduino-servo-posiciones` y `arduino-servo-barrido` | **No** | `aula-produccion.sh actualizar` (mecanismo y respaldo existentes) |
| Laboratorio (estático) | `servo.js`, Worker y simulación, circuito SG90 con fuente externa y GND común, `lessons/servo-eval.js`, lecciones 12–13 | — | publicador automático de `main` al fusionar |
| Portada, tarjeta pública, buscador, registro | **ninguno** (la tarjeta sigue en once prácticas hasta el último paso del plan; el registro sigue cerrado) | — | — |

Compatibilidad: los programas sin `Servo` producen el mismo HEX con la imagen nueva (135 programas comprobados byte a byte); la web nueva con el compilador anterior mostraría «Servo.h: No such file» en las lecciones 12–13 y la web nueva con la API anterior guardaría esos borradores solo en el navegador. Por eso el orden es **compilador → API → fusión**.

## Qué hace `deploy/linux/compilador-produccion.sh`

| Orden | Producción | Qué hace |
|---|---|---|
| `comprobar` | sin cambios | Contenedor, aislamiento, permisos del socket, `/salud` por HTTP, consumidores del socket (aula y laboratorios privados) y estado guardado. |
| `preparar <commit>` | sin cambios | Verifica que el script es el del commit; guarda `docker inspect` del contenedor e imagen actuales y etiqueta la imagen actual `globalt-compilador-arduino:respaldo-<fecha>`; exporta el commit (`git archive`) y construye `globalt-compilador-arduino:<commit>`; comprueba Servo, licencias y avr-gcc 7.3.0 dentro de la imagen. |
| `ensayar <commit>` | sin cambios | Pruebas del servicio dentro de la imagen (sin red); candidato `globalt-arduino-compiler-candidato` con **el mismo aislamiento** (leído del contenedor actual) y **socket propio** `/var/lib/globalt-robotics-lab/compilador/candidato-run/`; prueba completa por ese socket (todos los programas de prueba con HEX idéntico, Servo, diagnósticos, rechazos de lectura de archivos, 413/415/400); comprueba que producción no se reinició; retira siempre el candidato. |
| `promover <commit>` | cambia el compilador | Exige el ensayo superado con **la misma imagen** (ID). Guarda la versión actual, mide qué ve cada consumidor, detiene el anterior (`docker stop --time 30`), lo renombra `globalt-arduino-compiler-anterior-<fecha>` y crea el nuevo con las mismas opciones, usuario/grupo, variables, registro y política de reinicio. Verifica HTTP 200 con Servo, aislamiento, permisos 660/770, compilación real por el socket y que el aula y los laboratorios que veían 200 siguen viendo 200. **Ante cualquier fallo vuelve solo al anterior** e informa qué quedó restaurado. |
| `recuperar` | vuelve atrás | Detiene y conserva el nuevo (`…-retirado-<fecha>`), arranca el anterior guardado (o lo recrea con su imagen y configuración si se hubiera borrado) y verifica salud, aislamiento, socket, compilación y consumidores. Si el anterior no queda sano, vuelve a poner el que estaba. |

Nunca publica puertos, nunca monta el socket de Docker, no usa permisos 777, no borra contenedores, imágenes, volúmenes ni carpetas, y no toca la API, la web ni PostgreSQL. Aborta ante cualquier diferencia no contemplada del contenedor actual (red, montajes, usuario, capacidades, límites, puertos). Registros: `/var/lib/globalt-robotics-lab/compilador/registros/`.

**Interrupción durante el cambio:** entre la parada del anterior y la respuesta del nuevo el socket no atiende (en el ensayo, ≈ 0,4 s medidos desde el laboratorio, más la parada ordenada). Una compilación que estuviera en curso en la versión **anterior** puede cortarse (esa versión no tiene parada ordenada): el aula responde «El compilador no está disponible…; tu código sigue guardado» y el estudiante reintenta. La versión nueva sí termina las compilaciones en curso al detenerse. Conviene hacerlo fuera del horario de clase.

---

## Bloque 1 · Preparar y ensayar (no cambia producción)

En el servidor, en una copia del repositorio con la rama de la PR y el commit completo de su cabeza (`<PR>`, 40 caracteres):

```bash
cd ~/globalt-robotics && git fetch origin feature/lecciones-servo && git checkout --detach <PR>
```

```bash
sudo bash deploy/linux/compilador-produccion.sh comprobar
```

```bash
sudo bash deploy/linux/compilador-produccion.sh preparar <PR>
```

```bash
sudo bash deploy/linux/compilador-produccion.sh ensayar <PR>
```

Resultado esperado: «Ensayo superado para `<PR>`» y «Compilador de producción sin cambios y respondiendo: OK». Si `comprobar` informa diferencias no contempladas, **detenerse** y compartir la salida. Opcional, piloto privado de la API (8100): `sudo bash deploy/linux/update-aula-preview.sh <PR>`.

## Bloque 2 · Promover el compilador, actualizar la API y publicar

Desde la misma copia en `<PR>`. Detener la secuencia ante cualquier fallo.

1. Compilador:

   ```bash
   sudo bash deploy/linux/compilador-produccion.sh promover <PR>
   ```

   Esperado: «ACTUALIZADO: compilador…», consumidores «antes 200, ahora 200». Si falla, el script ya habrá restaurado el anterior («RESTAURADO: …»): no seguir.

2. API del aula (mecanismo y respaldo comprobado existentes; registro sigue cerrado):

   ```bash
   sudo bash deploy/linux/aula-produccion.sh actualizar <PR>
   ```

3. Verificación antes de fusionar (cuenta de prueba inscrita, consola del navegador en el aula):

   ```js
   Promise.all(['arduino-servo-posiciones', 'arduino-servo-barrido', 'arduino-l298n-dos-motores']
     .map((id) => fetch('/api/aula/borradores/' + id, { credentials: 'same-origin' }).then((r) => r.status)))   // [200, 200, 200]
   ```

   ```bash
   sudo bash deploy/linux/aula-produccion.sh comprobar
   ```

4. Fusionar la PR en `main` (la fusión por sí sola no cambia compilador ni API). El publicador lleva el laboratorio a la web.
5. Recorrido final en escritorio y móvil: el selector muestra 13 lecciones; en la 12 el código inicial muestra «50,0 Hz · pulso de 544 µs → 0°» y el brazo gira a 90° y 180°; en la 13 el brazo barre mientras el LED de D13 parpadea; «Comprobar reto» funciona en ambas; guardar crea un borrador por lección; las lecciones 1–11 compilan y conservan sus borradores. Solo entonces actualizar la tarjeta pública a trece prácticas (cambio aparte, fuera de esta PR).

## Bloque 3 · Recuperación

- **Fallo durante `promover`:** vuelta automática; revisar el registro.
- **Volver al compilador anterior más tarde:**

  ```bash
  sudo bash deploy/linux/compilador-produccion.sh recuperar
  ```

  Restaura el contenedor e imagen guardados; el nuevo queda detenido como `globalt-arduino-compiler-retirado-<fecha>`. Las lecciones 12–13 dejarán de compilar (Servo.h no existe en la versión anterior); las demás no cambian.
- **Volver a la API anterior:** `sudo bash deploy/linux/aula-produccion.sh actualizar <commit anterior>` desde una copia en ese commit (sin migración que deshacer; los borradores de las lecciones 12–13 quedan en la base sin usarse).
- **Volver a la web anterior:** `git revert -m 1 <commit de fusión>` en `main` por PR. Las claves de `localStorage` no cambian: el código de las lecciones 12–13 queda guardado en el navegador.
- **Recuperación manual del compilador** (si el script no pudiera ejecutarse): `docker ps -a --filter name=globalt-arduino-compiler` muestra el anterior conservado; `docker stop --time 30 globalt-arduino-compiler && docker rename globalt-arduino-compiler globalt-arduino-compiler-retirado-manual && docker rename <anterior> globalt-arduino-compiler && docker update --restart unless-stopped globalt-arduino-compiler && docker start globalt-arduino-compiler`, y comprobar con `comprobar`.
- **Datos:** nunca restaurar PostgreSQL para revertir esta entrega. No borrar volúmenes, imágenes `respaldo-*`, contenedores `…-anterior-*` ni carpetas de respaldo hasta confirmar la entrega.

---

## Evidencia (entorno de desarrollo, no el servidor)

Réplica local: Docker 29 real, avr-gcc 7.3.0, ArduinoCore-avr 1.8.6, Servo 1.3.0; PostgreSQL 16, API con uvicorn y proxy de mismo origen. **No es el servidor Linux ni Cloudflare.**

- **Compilador:** imagen construida con Docker real; `CompilerServiceTests` dentro de la imagen sin red (filtros, lecturas que saltan el filtro de texto, también las de los archivos de la librería `../VERSION`, `../servo.a`, licencia; solo dos carpetas de cabeceras propias; cabeceras de otras arquitecturas no disponibles; ISR propia de Timer1 + Servo = error de enlace con diagnóstico; límites de CPU/archivo/salida/tiempo; parada ordenada). Los 135 programas de las once lecciones anteriores dan HEX idéntico byte a byte.
- **Modelo y lecciones** (`ServoLessonTests`, 24 programas compilados): pulsos de 544/1472/2400 µs a 20,003 ms medidos con precisión de ciclo; posición por defecto 1500 µs ≈ 93° no aprueba; `analogWrite` en D9 rechazado por periodo; `write` sin `attach` sin pulsos; el mismo HEX leído en otro pin no mueve el servo; el eje tarda ≈ 157 ms en girar 90°. Convivencia de temporizadores: D5/D6 976,6 Hz, D3/D11 490,2 Hz, D10 sin PWM, `millis()` exacto; mapa del robot con servo, motores y TRIG. Soluciones que aprueban (2 + 2) y fallos que suspenden con su explicación: posición por defecto, pin equivocado, `analogWrite`, sin `attach` (servo inmóvil), orden, ángulo, tiempos, sin serie, mensaje tardío; barrido bloqueante, LED detenido, LED en otro pin, rápido, lento, medio recorrido, saltos, servo inmóvil; códigos iniciales y ejemplos no aprueban.
- **Ensayo Docker real** (`tests/docker/ensayo-compilador.sh <PR> e068dcb6…`): réplica con el compilador de `main`, consumidor tipo API y laboratorio nginx con `nginx-lab-preview.conf`. **39 comprobaciones superadas, 0 fallidas**: comprobar/preparar/ensayar sin tocar producción; promoción rechazada si la imagen cambió tras el ensayo; fallo simulado tras el cambio → vuelta automática con API y laboratorio en 200; promoción real (≈ 0,4 s sin servicio), Servo por el proxy con HEX idéntico, socket 10001:grupo 660/770, mismo aislamiento y variables; `recuperar` vuelve a la imagen anterior; nueva promoción; un candidato roto falla en el ensayo y no puede promoverse, producción intacta. Limitación: en el entorno de desarrollo `docker build` usa un envoltorio (`tests/docker/docker-ensayo`) que añade la CA del proxy de salida solo a la etapa de descarga; en el servidor no hace falta.
- **Navegador** (Chromium de Playwright): `servo.e2e.mjs` en escritorio, Pixel 7 e iPhone 13 (emulados) y con cuenta del aula (borradores propios de 12 y 13, aislados, compilación con Servo por la API, recuperación en móvil); regresión de las e2e anteriores con 13 lecciones. Sin Safari/Firefox reales ni dispositivos físicos.
