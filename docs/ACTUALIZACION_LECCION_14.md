# Lección 14 · Evasor en banco

## Alcance

`arduino-evasor-decision` integra el HC-SR04 y ambos canales del L298N. Reutiliza los modelos eléctricos existentes: solo reaccionan a los pines del programa compilado; el evaluador no examina el código fuente. No modifica el compilador, el Worker, las otras lecciones ni los datos existentes. La cuenta admite el nuevo identificador, sin migración.

Mapa: TRIG D7, ECHO D8; izquierdo IN1 D2, IN2 D4, ENA D5; derecho IN3 D10, IN4 D11, ENB D6. D9 queda reservado.

Las dos ilustraciones son vistas del mismo Nano. Los controles del sensor cambian la distancia; las ruedas están al aire. **No hay pista ni desplazamiento del robot en esta entrega.** La pista será la lección 15, con un mundo en lazo cerrado.

## Evaluación

7,9 s simulados: 100 → 18 → 32 → 75 → 24 → 38 → 90 cm → sin eco → 80 cm. Los cambios no coinciden con periodos redondos.

- Avanza con el camino libre, también después de cada despeje (>40 cm), en ≤150 ms.
- Ante ≤25 cm: orden de parada para ambos motores en ≤150 ms, mantenida ≥20 ms (tolerancia 1 ms por la resolución del puente H).
- Retroceso de 300–500 ms, iniciado en los primeros 300 ms desde la aparición del obstáculo; giro en ≤50 ms tras terminarlo.
- Giro sobre sí mismo hasta superar 40 cm; 32 y 38 cm no autorizan avanzar.
- Sin eco: orden de parada en ≤150 ms y permanencia parado hasta recuperar una lectura.
- Disparos TRIG válidos, separados 60–150 ms incluso durante las maniobras. Lectura `pulseIn` con timeout, sin pausas largas.
- Ambos ejes deben moverse, superando la zona muerta del 30 %. La parada evaluada es la orden eléctrica; la velocidad conserva la inercia del modelo.

Los mensajes serie son ayuda para depuración, no un criterio del reto. El avance del reto sigue guardándose solo en el navegador; la cuenta guarda el código.

## Despliegue

Antes de fusionar la PR, desde `~/globalt-robotics-aula-piloto`, obtener la rama `feature/leccion-evasor-decision`, situarse en el **SHA completo de la PR** y ejecutar:

```bash
sudo bash deploy/linux/aula-produccion.sh comprobar &&
sudo bash deploy/linux/aula-produccion.sh actualizar <SHA_COMPLETO_PR> &&
sudo bash deploy/linux/aula-produccion.sh comprobar
```

La actualización existente respalda y comprueba PostgreSQL, conserva la configuración y vuelve a la API anterior ante fallo. No hace falta reconstruir ni promover el compilador. Registro cerrado y demás proyectos intactos.

Con éxito en Linux: fusionar la PR, esperar la publicación automática y abrir desde el aula `games/laboratorio-arduino/index.html?leccion=arduino-evasor-decision`. Comprobar sensor interactivo, compilación, reto y guardado/recuperación de su borrador. Después añadir la lección a la tarjeta pública (cambio separado).

## Recuperación

Si hay un problema con la API, actualizarla desde una copia situada en el commit anterior `3e06490ab95f497f739db4ae5c4475b66485ddf6`, con el mismo script. Si se hubiera fusionado la web, revertir la fusión mediante PR. No restaurar PostgreSQL ni borrar borradores, volúmenes, imágenes o respaldos para deshacer esta entrega.

## Verificación reproducible

- `python3 scripts/check.py`
- `python3 -m unittest discover -s tests -v`
- `node --test tests/*.test.mjs`
- Con compilación real disponible: `LAB_URL=http://127.0.0.1:8080/games/laboratorio-arduino/index.html node tests/e2e/evasor-decision.e2e.mjs`
- Las pruebas de API existentes incluyen el nuevo identificador en el aislamiento por lección; requieren PostgreSQL de pruebas, nunca la base real.

Los fixtures `.ino` y `.hex` de `evasor-*` se construyen con avr-gcc 7.3.0 y ArduinoCore-avr 1.8.6. Se prueban dos soluciones (giro en ambos sentidos), once programas que deben suspender y distancias/instantes alternativos, incluidos los umbrales 25/40/41 cm. Ningún ejemplo entregado al estudiante aprueba el reto.

### Evidencia de esta entrega

Los programas nuevos se compilaron con avr-gcc 7.3.0 y el núcleo 1.8.6. Las soluciones y fallos se ejecutaron en avr8js; también se probaron los umbrales 25/40/41 cm con otros instantes. Pasó el recorrido nuevo de navegador en escritorio y Pixel 7 emulado: sensor interactivo, compilación real, aprobación/rechazo, parada sin eco, borrador local por lección e interfaz sin desbordamiento horizontal ni errores JavaScript. Se inspeccionaron sus capturas.

El navegador de pruebas fue Chromium headless en proceso único por restricciones del entorno. El compilador local usa una copia temporal de `server.py` con la ruta de sus ejecutables adaptada; el archivo del repositorio no cambia. No se ejecutaron Docker, la batería de API contra PostgreSQL ni las e2e de cuentas/producción en este entorno. La revisión de regresión de los programas anteriores es unitaria (HEX reales), no una repetición de todas las e2e anteriores. No se ha ejecutado nada en Linux, Cloudflare, Safari/Firefox o dispositivos físicos.
