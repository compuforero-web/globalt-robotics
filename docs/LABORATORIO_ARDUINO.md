# Laboratorio Arduino (lección piloto)

Ruta: `games/laboratorio-arduino/index.html` (enlazada desde el curso «Electrónica y C++ con Arduino»). Se ubica en `games/` porque es una de las carpetas que publica el despliegue actual; no se cambió el despliegue.

## Qué funciona realmente

| Parte | Cómo | Requiere |
|---|---|---|
| Lección, editor, guardado local, guía | HTML/CSS/ES Modules estáticos | nada |
| Compilación C++ | `avr-gcc` 7.3 + ArduinoCore-avr 1.8.6 en `services/compilador-arduino` | **servicio instalado** (pendiente en Linux) |
| Ejecución | el HEX real se emula instrucción a instrucción en un ATmega328P (avr8js 0.21.1) dentro de un Web Worker | navegador moderno |
| Evaluación del reto | ejecuta 5 s simulados y mide los flancos de D13 y los bytes del USART | programa compilado |

Sin el servicio, la página muestra «Servicio de compilación pendiente» y no simula ni aprueba nada. No hay salidas pregrabadas ni análisis de palabras del código: el evaluador solo mira el comportamiento medido.

Funciones soportadas en la emulación: GPIO digital, temporizadores 0–2 (`delay`, `millis`, `micros`), USART0 (`Serial.begin/print/println/write`). No soportado aún: entradas externas, ADC (`analogRead`), servos, librerías adicionales, entrada desde el monitor serie. Circuito fijo: LED + 220 Ω en D13.

## Archivos

- `src/main.js` orquesta; `lesson.js` contenido; `editor.js` + `cpp-highlight.js` editor; `compiler.js` cliente HTTP; `compiler-help.js` explicaciones de errores; `nano-runner.js` emulación; `sim-worker.js` + `simulation.js` Workers (tiempo real y evaluación); `challenge.js` evaluación; `circuit.js` ilustración; `guide.js` guía «Chispa»; `progress.js` almacenamiento local.
- `vendor/avr8js-0.21.1.js`: paquete npm `avr8js@0.21.1` (MIT, © Uri Shaked) empaquetado en un único ES Module con esbuild 0.24.2 (`--bundle --format=esm --minify`); licencia en `vendor/LICENSE-avr8js.txt`. Es una biblioteca; no usa el servicio ni cuentas de Wokwi.

## Guía «Chispa»

Mensajes preparados y deterministas, identificados como «Ayuda preparada». Pistas progresivas (5 niveles, sin entregar el código completo), explicación del primer error del compilador, celebración solo tras compilación correcta o reto comprobado. Se puede minimizar y silenciar (preferencia local), está en el flujo de la página (no flota sobre editor, controles ni circuito) y respeta `prefers-reduced-motion`.

Para añadir IA más adelante: crear un proveedor `{ id, label, respond(event, context) }` (puede ser asíncrono) y pasarlo a `createGuide(root, { providers: [proveedorIA, preparedHelp] })`. Los eventos son `welcome`, `hint`, `service-pending`, `compile-error`, `compile-ok`, `run-started`, `eval-fail`, `eval-pass`.

## Progreso

`localStorage` clave `globalt.laboratorio.arduino.v1`: código guardado, intentos y fecha del reto superado. Solo en este navegador; no hay cuentas ni inscripciones. «Restaurar ejemplo» pide confirmación y conserva el registro del reto.

## Pruebas

```bash
python3 scripts/check.py
python3 -m unittest discover -s tests -v
# Extremo a extremo (Chromium + compilador local, ver services/compilador-arduino/README.md):
LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html \
LAB_PENDIENTE_URL=http://localhost:8081/games/laboratorio-arduino/index.html \
node tests/e2e/laboratorio.e2e.mjs
```

`tests/fixtures/laboratorio/*.hex` son compilaciones reales de los `.ino` contiguos (generadas con el servicio) para probar emulación y evaluación en CI sin compilador.
