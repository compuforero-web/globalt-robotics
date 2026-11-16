# Radar Ultrasónico

Integrado desde el ZIP aportado por Edwin, sin modificar sus seis archivos. Ruta: `/games/radar-ultrasonico/index.html`. Tarjeta del catálogo: Radar Ultrasónico, Sensores, nivel Intermedio. Reemplaza el anuncio anterior de Próximamente y conserva el identificador `game-sensor-ultrasonico`.

Cinco retos: física del eco; calibración y cono; reversa progresiva; barrido SG90 + HC-SR04; robot evasor. Se sirve por HTTP dentro del modal de juegos o en una pestaña independiente. Su progreso usa `radarUltrasonico.v1`, separado de RoboLab y CodiCamp, en el navegador actual.

## Alcance del simulador según las indicaciones recibidas

El cono de detección es una aproximación: el HC-SR04 no identifica el ángulo de un eco. El código Arduino aproxima el filtrado mediante tres lecturas consecutivas coincidentes. El robot del nivel 5 corrige automáticamente el rumbo hacia la meta en la simulación; esa corrección no está incluida en el C++ generado. El código no está compilado ni validado en hardware Arduino real.

La entrega original reporta cinco niveles completados en Chromium, sin errores de consola y sin desbordamiento horizontal a 380 px; esa prueba fue informada por el creador. Para esta integración se verificaron sintaxis, imports, enlaces, entrega HTTP de los archivos y actualización del catálogo local. Queda por comprobar su ejecución en el navegador del usuario tras la publicación en Linux.
