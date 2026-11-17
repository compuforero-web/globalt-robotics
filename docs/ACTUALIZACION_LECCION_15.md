# Lección 15 · Robot evasor en pista

## Alcance

`arduino-evasor-pista` integra el HC-SR04, los dos motores y un mundo 2D en lazo cerrado. Solo el HEX mueve los pines: el L298N calcula las velocidades con inercia y zona muerta, el mundo integra tracción diferencial y el sensor genera ECHO según la posición real del robot.

Tres pistas fijas: Patio, Columnas y Pasillos. En cada una se requieren 60 s, recorrido acumulado >=6 m, ninguna colisión y ninguna pausa sin desplazamiento mayor de 3 s. Girar sobre sí mismo no suma metros. Se considera pausa a una velocidad de traslación inferior a 1 cm/s.

El HC-SR04 debe seguir activo: medidas válidas cada 60–500 ms, mínimo 100 disparos y ecos por pista. Se mantienen los pines del banco: TRIG D7/ECHO D8, IN1 D2/IN2 D4/IN3 D10/IN4 D11, ENA D5/ENB D6; D9 reservado.

## Modelo y límites

- Robot circular rígido de radio 10 cm; ruedas de radio 3,25 cm separadas 16 cm; 200 rpm máximas en el modelo del motor.
- Coordenadas cartesianas en metros. Integración exacta del arco diferencial, con pasos de hasta 5 ms (en el Worker avanza con el tick del motor, aproximadamente 1 ms).
- Los contactos con círculos/rectángulos y límites bloquean traslación y cuentan como colisión. No se simulan empujes, derrape, carga, corriente ni tensión.
- Sensor frontal a 10 cm del centro: nueve rayos en un cono ideal de 15°, máximo 4 m, sin ruido o ecos múltiples. La geometría se consulta al iniciar el ECHO; no se modifica la lógica eléctrica previa.
- Es un reto de circulación: no hay meta ni ruta concreta y repetir un tramo suma recorrido. La evaluación comprueba comportamiento medido, no que el programa utilice un algoritmo específico.
- La práctica seleccionada se reinicia al cambiar de pista. El reto ejecuta las tres desde RESET, pausa antes el Worker de práctica y muestra progreso. Límite de 90 s de reloj por pista.
- Trayectoria visual limitada a 1200 puntos; la traza rápida de pista no guarda ventanas PWM innecesarias. Las lecciones anteriores mantienen sus ventanas y evaluadores.
- La cuenta guarda código por lección; aprobar sigue siendo un registro local, no un certificado validado en servidor.

## Verificación

El entorno local ejecutó dos referencias compiladas con avr-gcc 7.3.0/ArduinoCore-avr 1.8.6: ambas completaron las tres pistas sin colisiones y con 12,6–13,1 m por pista. Pasaron las pruebas de geometría y seis pruebas de integración de pista. El entorno de trabajo se desconectó durante la comprobación del navegador.

El código se conserva en GitHub y la entrega debe completar el workflow **Comprobar evasor en pista** antes de salir del estado de borrador. Ese workflow reconstruye el compilador existente en Docker, genera los ocho HEX de prueba desde sus fuentes, ejecuta regresiones y realiza pruebas Chromium y PostgreSQL. Los HEX se generan en el runner, no se publican ni requieren instalar nada en el servidor del usuario. Las cuatro pruebas unitarias que los necesitan se omiten en el workflow básico; el workflow completo los genera y sí las ejecuta.

Comandos:
- `python3 scripts/check.py`
- `python3 -m unittest discover -s tests -v`
- `node --test tests/*.test.mjs`
- Con compilador de pruebas: `LAB_URL=http://127.0.0.1:8080/games/laboratorio-arduino/index.html node tests/e2e/evasor-pista.e2e.mjs`

La prueba nueva evalúa las tres pistas en escritorio. En Pixel 7 emulado comprueba controles, compilación, movimiento, pausa, cambio de pista y borrador local. También se repite la e2e del banco en ambos tamaños. Las pruebas de API con PostgreSQL verifican el nuevo identificador mediante el aislamiento por lección. No se prueba Cloudflare, NetBird o el Linux real.

## Despliegue: API antes que web

No fusionar hasta terminar CI y actualizar la API de producción con el SHA exacto de la PR:

```bash
cd ~/globalt-robotics-aula-piloto &&
git fetch origin feature/leccion-evasor-pista &&
git checkout --detach <SHA_COMPLETO_PR> &&
sudo bash deploy/linux/aula-produccion.sh comprobar &&
sudo bash deploy/linux/aula-produccion.sh actualizar <SHA_COMPLETO_PR> &&
sudo bash deploy/linux/aula-produccion.sh comprobar
```

No requiere reconstruir el compilador ni migración de base de datos. Registro cerrado y scripts de infraestructura sin cambios. La actualización existente respalda y comprueba la base antes de cambiar la API.

Tras el resultado correcto del servidor: fusionar la PR y esperar el publicador automático. Abrir la lección desde una cuenta inscrita, guardar y recuperar su borrador, y comprobar que las anteriores siguen disponibles. Actualizar la tarjeta pública a 15 solo después de publicar.

Recuperación: situarse en la API anterior `4eaf9c3f62e70db91295a5fe934227139771df02` y ejecutar su `aula-produccion.sh actualizar`. Si la web se hubiera fusionado, revertir esa fusión por PR. Nunca restaurar PostgreSQL ni borrar borradores para deshacer esta entrega.
