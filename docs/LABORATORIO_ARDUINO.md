# Laboratorio Arduino

Ruta: `games/laboratorio-arduino/index.html` (enlazada desde el curso «Electrónica y C++ con Arduino»). Se ubica en `games/` porque es una de las carpetas que publica el despliegue actual; no se cambió el despliegue.

## Qué funciona realmente

| Parte | Cómo | Requiere |
|---|---|---|
| Lección, editor, guardado local, guía | HTML/CSS/ES Modules estáticos | nada |
| Compilación C++ | `avr-gcc` 7.3 + ArduinoCore-avr 1.8.6 en `services/compilador-arduino` | **servicio instalado** (pendiente en Linux) |
| Ejecución | el HEX real se emula instrucción a instrucción en un ATmega328P (avr8js 0.21.1) dentro de un Web Worker | navegador moderno |
| Evaluación del reto | ejecuta el programa compilado unos segundos simulados (5, 17 o 6 según la lección) y mide flancos, ventanas PWM y bytes del USART con su instante | programa compilado |

Criterios del reto de la lección 1: al menos 4 encendidos en 5 s; encendidos de 200 ms y apagados de 800 ms (±10 %); 9600 baudios (±3 %); y cada línea «Latido N» debe **empezar a transmitirse entre 100 ms antes y 250 ms después del N-ésimo encendido** (200 ms encendido + 50 ms de margen; con periodo de 1000 ms las ventanas no se solapan). Emitir todas las líneas al inicio o fuera del encendido no aprueba. Los encendidos de los últimos 250 ms pueden quedar sin línea.

Sin el servicio, la página muestra «Compilación próximamente», desactiva solo Compilar, Ejecutar y Comprobar reto, y no simula ni aprueba nada. No hay salidas pregrabadas ni análisis de palabras del código: el evaluador solo mira el comportamiento medido.

Funciones soportadas en la emulación: GPIO digital, PWM por hardware (`analogWrite` en D3, D5, D6, D9, D10, D11), temporizadores 0–2 (`delay`, `millis`, `micros`), USART0 (`Serial.begin/print/println/write`). No soportado aún: entradas externas, ADC (`analogRead`), servos, librerías adicionales, entrada desde el monitor serie. Cada lección tiene un circuito fijo (no hay editor de cableado).

## Lecciones

El manifiesto `src/lessons/index.js` define las lecciones; la URL elige una con `?leccion=<id>`. Sin parámetro (o vacío) se abre la lección 1, así que los enlaces existentes y la `ruta_laboratorio` del curso no cambian.

| N.º | Identificador (definitivo) | Circuito | Evaluación |
|---|---|---|---|
| 1 | `arduino-led-serie` | LED + 220 Ω en D13 | 5 s · `challenge.js` (sin cambios) |
| 2 | `arduino-protoboard-semaforo` | protoboard: verde D2, amarillo D3, rojo D4, 220 Ω cada uno | 17 s · `lessons/semaforo-eval.js` |
| 3 | `arduino-pwm-brillo` | LED + 220 Ω en D9 con medidor de % y Hz | 6 s · `lessons/pwm-eval.js` |

Cada módulo de lección (`lessons/led-serie.js`, `semaforo.js`, `pwm-brillo.js`) reúne contenido por pasos, ejemplos (ninguno es la solución), reto, circuito, pines vigilados, evaluación y pistas de Chispa. Las lecciones previas solo se recomiendan; no bloquean.

**Semáforo** (criterios anunciados en el reto): orden verde → amarillo → rojo con al menos 6 fases completas (dos ciclos) en 17 s; verde y rojo 3 s y amarillo 1 s (±10 %); nunca dos LED encendidos más de 20 ms; monitor a 9600 baudios (±3 %); una línea con el color que se enciende a ±100 ms de cada cambio y ninguna línea de color de más. Una fase que empieza en los últimos 150 ms puede no tener aún su línea. Las líneas que no nombran un color (p. ej. «Semaforo listo») se ignoran.

**PWM** (criterios anunciados en el reto; el monitor serie no se evalúa): D9 con valores intermedios a 450–1000 Hz (mediana de las ventanas con PWM y al menos el 90 % de ellas en rango; con 0 % y 100 % la salida es continua y no se exige frecuencia); brillo mínimo ≤ 5 % y máximo ≥ 95 %; al menos dos respiraciones completas de 1,6–2,4 s que lleguen a ambos extremos (una respiración va de una subida que cruza el 50 % a la siguiente, con histéresis 40–60 %); variación ≤ 8 puntos entre ventanas consecutivas de 20 ms. Mensajes específicos para PWM en otro pin, en un pin sin PWM (D8…) o hecho a mano con `digitalWrite`.

## Medición por ventanas (`src/pwm.js`)

El Worker cierra una ventana cada 20 ms simulados (límites en múltiplos exactos) y, por pin, calcula el % en HIGH (sobre periodos completos cuando hay 2 o más subidas, exacto para PWM estable), la frecuencia (inversa de la mediana de los intervalos entre subidas, así un pulso suelto al cambiar `analogWrite` no la altera) y el nivel final. Medido en el emulador: `analogWrite(9, v)` da v/255 con error < 0,4 puntos a 490,2 Hz; D5/D6 dan (v+1)/256 a 976,6 Hz, como el temporizador 0 real.

- **Tiempo real:** el Worker envía solo las ventanas que cambian; el circuito y la tira de pines se actualizan con ellas (brillo del LED = % medido). Con PWM en dos pines durante 60 s, la interfaz no se bloquea y la memoria no crece.
- **Evaluación:** la traza guarda flancos (máximo 1000 por pin; un pin más rápido queda medido solo por ventanas, sin agotar el límite total de 20 000) y todas las ventanas de los pines del circuito y de los que tengan actividad.
- Rendimiento medido (Chromium, este equipo de pruebas): evaluación de PWM (6 s simulados) ≈ 2 s; semáforo (17 s) ≈ 5,5–6,5 s; la emulación de avr8js va a unas 3 veces el tiempo real.

## Limitaciones conocidas

- La evaluación se ejecuta en el navegador del estudiante: sirve para aprender, no es una prueba a prueba de manipulaciones. Por eso el resultado no se guarda en la cuenta.
- El cableado es fijo por lección: no hay editor de circuitos y el simulador no comprueba un montaje físico en protoboard.
- El semáforo no evalúa los momentos con todas las luces apagadas entre fases (el reto no lo pide); una línea serie que nombre dos colores puede contarse para cualquiera de ellos.
- El brillo de la ilustración es proporcional al % medido (sin corrección de percepción del ojo).
- La emulación va a unas 3 veces el tiempo real: los 17 s del semáforo tardan unos 6 s en evaluarse (más en equipos lentos; el límite es 30 s de reloj).
- Las pistas usan reglas sobre el texto del código solo para orientar; nunca aprueban.

## Archivos

- `src/main.js` arranca la lección de la URL; `lab.js` orquesta (`startLab`); `lessons/` manifiesto, lecciones 2 y 3, evaluadores y piezas de vista; `pwm.js` medición por ventanas; `lesson.js` contenido de la lección 1; `editor.js` + `cpp-highlight.js` editor; `compiler.js` cliente HTTP; `compiler-help.js` explicaciones de errores; `nano-runner.js` emulación; `sim-worker.js` + `simulation.js` Workers (tiempo real y evaluación); `challenge.js` evaluación; `circuit.js` ilustraciones (LED en un pin, semáforo) y tira de pines; `guide.js` guía «Chispa»; `progress.js` almacenamiento local.
- `vendor/avr8js-0.21.1.js`: paquete npm `avr8js@0.21.1` (MIT, © Uri Shaked) empaquetado en un único ES Module con esbuild 0.24.2 (`--bundle --format=esm --minify`); licencia en `vendor/LICENSE-avr8js.txt`. Es una biblioteca; no usa el servicio ni cuentas de Wokwi.

## Lección guiada (formato común)

La lección 1 (`lesson.js`) tiene seis pasos; las lecciones 2 y 3, cinco (`lessons/semaforo.js`, `lessons/pwm-brillo.js`), con las mismas piezas de `lessons/view.js`. Lección 1: circuito, `setup()`/`loop()`, modificar, compilar, simulación y reto. Cada paso tiene explicación breve, preguntas «Piensa» (respuesta desplegable) y, en algunos, un **Ejemplo** (`EXAMPLES`) que nunca es la solución; el reto aparece aparte con la etiqueta **Reto** y sin código. Se navega con la barra de pasos (flechas ←/→ entre botones), «Anterior»/«Siguiente» y «Repasar desde el paso 1»; el paso actual y los vistos se guardan en `step`/`seen` del progreso local. Recorrer los pasos **no aprueba**: solo «Comprobar reto».

«Probar en el editor…» abre un diálogo (Cancelar por defecto). Si se elige reemplazar, el código actual (guardado o no) queda en `backupCode`, el cambio se puede deshacer con Ctrl+Z o «Recuperar mi código» (intercambia editor y respaldo) y no se guarda nada hasta pulsar Guardar.

## Guía «Chispa»

Mensajes preparados y deterministas, identificados como «Ayuda preparada». «Pedir pista» elige un tema con reglas locales (`chooseTopic`/`analyzeCode` en `guide.js`): error de compilación del código actual, paso de la lección si el ejemplo no se ha tocado, último fallo de la evaluación y análisis del código (pin, `Serial.begin`, tiempos, texto «Latido», contador y su alcance, momento del mensaje). Cada tema avanza en 2–3 pistas y vuelve a empezar para repasarlas; ninguna entrega el código del reto y el análisis nunca aprueba. Los errores del compilador conservan el mensaje original; si no hay regla para un mensaje, se dice expresamente en vez de inventar una causa. Celebra solo tras compilación correcta o reto comprobado. Se puede minimizar y silenciar (preferencia local), está en el flujo de la página y respeta `prefers-reduced-motion`.

Cada lección aporta sus temas de pista, `chooseTopic`/`analyzeCode`, consejos por comprobación fallida y textos (`createPreparedHelp` en `guide.js`); en las lecciones 2 y 3 el fallo medido manda sobre la estimación hecha a partir del texto. Para añadir IA más adelante: crear un proveedor `{ id, label, respond(event, context) }` (puede ser asíncrono) y pasarlo a `createGuide(root, { providers: [proveedorIA, preparedHelp] })`. Los eventos son `welcome`, `hint`, `service-pending`, `compile-error`, `compile-ok`, `run-started`, `eval-fail`, `eval-pass`.

## Progreso, borradores y cambio de lección

`localStorage` clave `globalt.laboratorio.arduino.v1` (sin cambios): `lessons[<id>]` con código guardado, respaldo, pasos vistos, intentos y fecha del reto superado. Cada lección usa solo su entrada. «Restaurar ejemplo» pide confirmación y conserva el registro del reto.

- **Evaluación y cuenta son cosas distintas:** el reto superado se registra solo en este navegador; la cuenta del aula guarda únicamente el código (`borradores`, una fila por estudiante y lección).
- **Cambiar de lección** (selector «Lección N de 3 · cambiar de lección») recarga la página con `?leccion=<id>`. Con cambios sin guardar aparece un diálogo: «Seguir aquí» (por defecto), «Descartar y cambiar» o «Guardar y cambiar» (guarda en el navegador y espera hasta 8 s a la copia en la cuenta). Si el navegador no permite guardar, no cambia.
- **Identificador desconocido:** no se monta el editor, no se llama al aula y no se escribe nada en el navegador; solo se muestra la lista de lecciones.
- **API sin la lección** (antes de actualizar el servidor): `GET /borradores/<id>` responde 404 y el laboratorio muestra «Esta lección todavía no se guarda en tu cuenta», con guardado solo local.

## Pruebas

```bash
python3 scripts/check.py
python3 -m unittest discover -s tests -v
# Extremo a extremo (Chromium + compilador local, ver services/compilador-arduino/README.md):
LAB_URL=http://localhost:8080/games/laboratorio-arduino/index.html \
LAB_PENDIENTE_URL=http://localhost:8081/games/laboratorio-arduino/index.html \
node tests/e2e/laboratorio.e2e.mjs
# Lecciones 2 y 3, cambio de lección, PWM y rendimiento (AULA_SITIO opcional: borradores por lección en la cuenta):
LAB_URL=… [AULA_SITIO=http://127.0.0.1:8180] [LAB_LARGA=1] node tests/e2e/lecciones.e2e.mjs
```

`tests/fixtures/laboratorio/*.hex` son compilaciones reales de los `.ino` contiguos (generadas con el servicio) para probar emulación y evaluación en CI sin compilador: soluciones y fallos típicos de cada reto (`semaforo-*`, `pwm-*`), el código inicial y los ejemplos de cada lección (`*-ejemplo`, `*-ej-*`, que la prueba compara con el código de la lección) y `pwm-niveles` para medir el PWM.
