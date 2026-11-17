# Ruta del curso «Electrónica y C++ con Arduino»

Plan de ampliación del Laboratorio Arduino (`games/laboratorio-arduino/`). **Es un documento de planificación: no cambia funcionalidades, catálogo público, infraestructura ni datos.** Describe lo que existe hoy (comprobado en el código de `main` del 16-11-2026), la secuencia de lecciones, lo que falta construir y la siguiente entrega mínima.

Regla que rige todo el plan: **una lección solo se aprueba por el comportamiento medido del programa del estudiante**, compilado con el compilador real y ejecutado en el ATmega328P emulado. Los modelos de componentes (botón, servo, sensor, motores, robot) reaccionan a los pines del microcontrolador emulado y le devuelven señales eléctricas; nunca leen el texto del código ni reproducen una animación preparada. Leer pasos, responder «Piensa» o guardar un borrador no aprueba nada.

---

## 1. Arquitectura actual relevante

| Pieza | Dónde | Estado real |
|---|---|---|
| Contenido de lección | `src/lesson.js` (`LESSON`, `STEPS`, `EXAMPLES`, `CHALLENGE`) | Una sola lección, `arduino-led-serie`, codificada en el módulo. `main.js` usa `LESSON.id` directamente. |
| Guía «Chispa» | `src/guide.js` | Pistas deterministas; `analyzeCode` es específico de la lección 1 (pin 13, «Latido», 200/800 ms). |
| Compilación | `src/compiler.js` → `/api/aula/compilar` (con sesión, inscripción, CSRF y límites 6/min, 60/h) → `services/compilador-arduino/server.py` | `avr-gcc 7.3.0` + **solo el núcleo** ArduinoCore-avr 1.8.6 (`build-core.sh` copia `cores/arduino` y las variantes). Enlaza `sketch.o` + `core.a` + `-lm`. Placa fija `nano`. |
| Emulación | `src/nano-runner.js` + `vendor/avr8js-0.21.1.js` | CPU ATmega328P 16 MHz, puertos B/C/D (D0–D19 observados), temporizadores 0–2, USART0. El bundle **solo exporta** `CPU, avrInstruction, AVRTimer, timer0–2Config, AVRIOPort, portB/C/DConfig, PinState, AVRUSART, usart0Config, AVRClock`. |
| Ejecución | `src/sim-worker.js`, `src/simulation.js` | Worker en tiempo real (envía cada flanco) y modo rápido para evaluar (traza de flancos y bytes serie, máx. 20 000 eventos). |
| Evaluación | `src/challenge.js` | Fija para la lección 1: flancos de D13 y líneas serie con su instante, 5 s simulados. |
| Circuito | `src/circuit.js` | Ilustración fija: LED + 220 Ω en D13; tira de estado D0–D13 (no muestra A0–A5). Se ilumina con los pines emulados. |
| Progreso local | `src/progress.js`, clave `globalt.laboratorio.arduino.v1` | Mapa `lessons[id]` con `code`, `backupCode`, `attempts`, `completedAt`, `passedCode`, `step`, `seen`. Ya admite varias lecciones. |
| Borrador en cuenta | `src/cuenta.js` → `GET/PUT /api/aula/borradores/{leccion_id}` | Tabla `borradores (usuario_id, leccion_id, codigo ≤ 12 000, version)` con control optimista (`version_base`, 409). La API solo acepta las lecciones de `LECCIONES = {'arduino-led-serie': 'course-arduino'}` en `services/aula-api/app/main.py`. |
| Curso | migración `0001_inicial.sql` | `course-arduino` → `ruta_laboratorio = games/laboratorio-arduino/index.html`. |
| Aprobación | solo `localStorage` (`completedAt`) | No hay registro de resultados en el servidor. |

### Lo que **no** es simulación del programa

`games/robolab-arduino/` (niveles 1–5: LED/PWM, servo, HC-SR04, L298N, evasor), `games/radar-ultrasonico/` y `games/sumo-bot-challenge/` son juegos con escenas paramétricas o código mostrado como texto (`codesim.js`, `simcore.js` con su propio `Brain`). **No compilan ni ejecutan el programa del estudiante.** Pueden enlazarse como exploración previa del concepto, nunca como evidencia de aprobación ni presentarse como «simulación de tu código».

---

## 2. Capacidades reales y lo que falta

### 2.1 Compilador (`services/compilador-arduino`)

| Elemento | ¿Disponible? | Notas |
|---|---|---|
| `pinMode`, `digitalWrite/Read`, `analogWrite`, `analogRead`, `delay`, `millis`, `micros`, `delayMicroseconds`, `pulseIn`, `tone`, `map`, `constrain`, `Serial` | Sí (núcleo) | Compilan. Que **funcionen en la emulación** depende de la tabla 2.2. |
| `Servo.h` | **No** | No forma parte de ArduinoCore-avr; está en `arduino-libraries/Servo`. `#include <Servo.h>` falla con «No such file». |
| `EEPROM.h`, `Wire.h`, `SPI.h`, `SoftwareSerial.h` | **No** | Están en `libraries/` de ArduinoCore-avr, pero `build-core.sh` no las copia ni compila. No son necesarias para esta ruta. |
| `NewPing.h`, librerías de L298N | **No, y no se añadirán** | El curso enseña `pulseIn` y control directo de IN/EN; así el estudiante entiende la señal. |

**Falta para servo:** añadir `arduino-libraries/Servo` con versión y commit fijados al `Dockerfile`, compilarla a una biblioteca estática junto al núcleo, añadir su carpeta a los directorios de inclusión permitidos (`_directorios`/`revisar_preprocesado` en `server.py`) y enlazarla. Requiere pruebas del filtro de seguridad, **reconstruir la imagen del compilador y desplegarla en Linux** (contenedor `globalt-arduino-compiler`, sin red).

### 2.2 Emulación (`nano-runner.js`, bundle avr8js)

| Capacidad | Estado | Qué falta |
|---|---|---|
| Salidas digitales en cualquier pin D0–D19 | Funciona (se emiten todos los flancos) | Circuito y evaluador por lección. |
| PWM (`analogWrite` en D3, D5, D6, D9, D10, D11) | El temporizador conmuta el pin (`timerOverridePin`) y el oyente del puerto ve cada flanco | **Medición de ciclo de trabajo** por ventanas en el Worker. A 490–980 Hz, 5 s de PWM generan ~5 000–10 000 flancos por pin: se agota `MAX_TRACE` y satura el canal en tiempo real. Hay que resumir (pin, ventana, % alto, frecuencia). |
| Entradas digitales (botón, `INPUT_PULLUP`, eco del HC-SR04) | El método `AVRIOPort.setPin` existe en el bundle, pero `NanoRunner` no lo usa | API de estímulo: `setInput(pin, nivel)` y eventos programados con `cpu.addClockEvent` (precisión de ciclo). |
| `pulseIn` / `micros` con eco | Depende del punto anterior | Modelo HC-SR04 que detecta el pulso TRIG (≥ 10 µs) y programa el ECHO (≈ 58 µs/cm). |
| ADC (`analogRead`, potenciómetro) | **No**: avr8js 0.21.1 incluye `AVRADC`, pero el bundle no lo exporta ni `NanoRunner` lo instancia | Regenerar el bundle **con la misma versión** (esbuild, añadiendo `AVRADC` y `adcConfig`), documentarlo en `LABORATORIO_ARDUINO.md` y conectar la tensión del modelo a cada canal A0–A7. |
| Interrupciones externas (`attachInterrupt`) | Sin verificar | Fuera de esta ruta; si se usa, probar antes con un fixture. |
| Servo (pulsos 544–2400 µs a 50 Hz con Timer1) | Timer1 e interrupciones están emulados | Librería en el compilador (2.1) + modelo que convierte ancho de pulso en ángulo, con inercia. |
| L298N y motores | — | Modelo de puente H (IN1–IN4, ENA/ENB) + motor con zona muerta y respuesta de primer orden. |
| Robot evasor | — | Mundo 2D de tracción diferencial **en lazo cerrado**: los motores mueven el robot y la distancia del mundo alimenta el eco del HC-SR04. Determinista (semilla fija). |
| Entrada por monitor serie | No | No necesaria en esta ruta. |

### 2.3 Interfaz y evaluación

- `circuit.js` debe pasar a un **circuito declarado por lección** (lista de componentes y pines) con componentes reutilizables: LED (con brillo por % PWM), botón, potenciómetro, servo, HC-SR04, L298N, motor, robot. Sigue siendo una ilustración fija por lección: **no hay editor de cableado**, y así se dice en la lección (la protoboard se enseña con el diagrama y preguntas, no se evalúa el cableado físico).
- `challenge.js` debe convertirse en evaluadores por lección con la misma forma de salida (`{passed, checks[]}`) y un **guion de estímulos** (pulsaciones, tensiones, distancias) aplicado igual en la ejecución rápida.
- `guide.js`: `chooseTopic`/`analyzeCode` por lección; las pistas nunca aprueban.

---

## 3. Secuencia del curso

Seis temas, **15 lecciones obligatorias + 1 opcional**. Cada lección conserva el formato actual: pasos breves, ejemplos que no son la solución, reto sin código y evaluación medida. «Evidencia» = lo que el evaluador mide en la traza emulada; todas usan tolerancias explícitas.

### Tema 1 · Arduino Nano y protoboard

**1.1 `arduino-led-serie` — LED intermitente y monitor serie** *(existe; identificador y borradores intactos)*
- Previos: ninguno.
- Objetivo: estructura `setup()/loop()`, `pinMode`, `digitalWrite`, `delay`, `Serial`.
- Componentes: Nano, LED, 220 Ω en D13.
- Práctica: modificar los tiempos del ejemplo.
- Reto: «El latido» (200/800 ms + «Latido N»).
- Evidencia: la ya implementada en `challenge.js`.

**1.2 `arduino-protoboard-semaforo` — Protoboard y varias salidas**
- Previos: 1.1.
- Objetivo: filas y rieles de la protoboard, resistencia por LED, varios pines de salida, constantes con nombre.
- Componentes: Nano, protoboard, LED rojo/amarillo/verde en D4/D3/D2 con 220 Ω cada uno.
- Práctica: encender cada LED por separado e informar por serie.
- Reto: semáforo verde 3 s → amarillo 1 s → rojo 3 s, en bucle, con un mensaje por cambio de fase.
- Evidencia (15 s): orden de fases verde→amarillo→rojo ≥ 2 ciclos completos; duraciones ±10 %; nunca dos LED encendidos a la vez (> 20 ms de solape suspende); una línea serie por fase con el nombre del color, emitida a ±100 ms del cambio.

### Tema 2 · Entradas, salidas y PWM

**2.1 `arduino-pwm-brillo` — Brillo con PWM**
- Previos: 1.2.
- Objetivo: qué es PWM, ciclo de trabajo, `analogWrite(0–255)`, qué pines lo admiten (D3, D5, D6, D9, D10, D11) y por qué otros no.
- Componentes: LED + 220 Ω en D9.
- Práctica: fijar 0, 64, 128, 255 y observar el % medido.
- Reto: «respiración»: subir de 0 a 255 y bajar a 0 en ~2 s por ciclo, sin escalones mayores de 16.
- Evidencia (6 s, ventanas de 20 ms): D9 con frecuencia PWM 450–1000 Hz; ciclo de trabajo que alcanza ≤ 5 % y ≥ 95 % en cada ciclo; ≥ 2 ciclos completos de 1,6–2,4 s; variación entre ventanas consecutivas ≤ 8 puntos (suavidad). Un pin sin PWM (solo 0 % o 100 %) suspende con mensaje explicativo.

**2.2 `arduino-boton-entrada` — Leer un pulsador**
- Previos: 1.2.
- Objetivo: `INPUT` vs `INPUT_PULLUP`, lógica invertida, `digitalRead`.
- Componentes: pulsador en D2 a GND (pull-up interno), LED en D13.
- Práctica: imprimir el estado del botón cada 200 ms.
- Reto: el LED sigue al botón (pulsado = encendido) y se escribe «Pulsado»/«Suelto» solo al cambiar.
- Evidencia (guion de 5 pulsaciones de 150–600 ms): D13 sigue a D2 con retardo ≤ 30 ms; exactamente un mensaje por cambio; sin mensajes repetidos estando quieto. Sin `INPUT_PULLUP` el pin queda flotante y el modelo lo simula como inestable → suspende con explicación.

**2.3 `arduino-boton-flanco` — Flancos y antirrebote**
- Previos: 2.2.
- Objetivo: detectar flancos, rebote mecánico, antirrebote con `millis()` sin bloquear.
- Componentes: pulsador en D2, LED en D13.
- Práctica: contar pulsaciones sin antirrebote y ver el error por el rebote.
- Reto: cada pulsación alterna el LED y escribe «Pulsaciones: N».
- Evidencia (guion de 6 pulsaciones con 3–8 rebotes de 0,2–2 ms cada una): N final = 6, numeración 1…6; LED alterna exactamente 6 veces; respuesta ≤ 60 ms tras la pulsación.

**2.4 `arduino-potenciometro-pwm` — Entrada analógica a PWM**
- Previos: 2.1, 2.2.
- Objetivo: ADC de 10 bits, `analogRead`, `map`, relación tensión–valor.
- Componentes: potenciómetro 10 kΩ en A0, LED en D9.
- Práctica: imprimir la lectura con distintas posiciones.
- Reto: el brillo de D9 sigue al potenciómetro e imprime la lectura cada 250 ms.
- Evidencia (guion 0 V, 1,25 V, 2,5 V, 5 V): lecturas impresas ±8 cuentas del valor esperado (0, 256, 512, 1023); % PWM ±4 puntos de lo esperado tras ≤ 100 ms.
- **Requiere ADC en la emulación.**

### Tema 3 · Servo

**3.1 `arduino-servo-posiciones` — Posiciones del servo**
- Previos: 2.1.
- Objetivo: señal de servo (50 Hz, 0,5–2,4 ms), librería `Servo`, alimentación separada y GND común.
- Componentes: micro servo SG90 en D9, fuente de 5 V externa (en el diagrama).
- Práctica: `write(0)`, `write(90)`, `write(180)`.
- Reto: secuencia 0° → 90° → 180° → 90°, 1 s en cada una, informando el ángulo por serie.
- Evidencia: pulsos en D9 a 45–55 Hz; ancho convertido a ángulo ±5°; cada posición mantenida 0,9–1,1 s; línea serie por posición a ±150 ms.
- **Requiere librería Servo en el compilador.**

**3.2 `arduino-servo-barrido` — Barrido sin bloquear**
- Previos: 3.1, 2.3.
- Objetivo: temporización con `millis()` para hacer dos tareas a la vez.
- Componentes: servo en D9, LED en D13.
- Práctica: barrido con `delay` y observar que el LED se retrasa.
- Reto: barrido 0↔180° a 1° cada 15 ms mientras D13 parpadea a 500/500 ms.
- Evidencia: velocidad angular 55–80 °/s y sentido que se invierte en los extremos; periodo de D13 1000 ms ±5 % **durante** el barrido.

### Tema 4 · Sensor ultrasónico HC-SR04

**4.1 `arduino-ultrasonico-distancia` — Medir distancia**
- Previos: 1.1, 2.2.
- Objetivo: pulso TRIG de 10 µs, duración del ECHO, `pulseIn`, velocidad del sonido, cm = µs / 58.
- Componentes: HC-SR04 con TRIG en D7 y ECHO en D8.
- Práctica: imprimir la duración del eco en µs.
- Reto: imprimir «Distancia: N cm» cada 100–200 ms.
- Evidencia (guion de obstáculo a 10, 35, 80 y 150 cm): pulsos TRIG ≥ 10 µs separados ≥ 60 ms; valores impresos dentro de ±(1 cm + 3 %) del obstáculo vigente.

**4.2 `arduino-ultrasonico-alerta` — Alerta por cercanía y fuera de rango**
- Previos: 4.1, 2.1.
- Objetivo: umbrales, condiciones encadenadas, tiempo máximo de `pulseIn`.
- Componentes: HC-SR04 (D7/D8), LED en D9.
- Práctica: probar sin obstáculo y ver qué devuelve `pulseIn`.
- Reto: LED apagado > 50 cm, PWM proporcional entre 50 y 10 cm, encendido < 10 cm; sin eco, imprimir «Fuera de rango» sin bloquear más de 40 ms.
- Evidencia: % PWM según la tabla ±6 puntos tras ≤ 250 ms; «Fuera de rango» presente en el tramo sin eco; ningún ciclo con D9 sin actualizar > 300 ms.

### Tema 5 · Puente H L298N y motores

**5.1 `arduino-l298n-direccion` — Sentido de giro**
- Previos: 1.2.
- Objetivo: puente H, tabla IN1/IN2, por qué el Nano no alimenta el motor, GND común.
- Componentes: L298N (IN1 D7, IN2 D8, ENA puenteado), motor DC, batería 7–9 V (diagrama).
- Práctica: adelante, parar, atrás.
- Reto: 1 s adelante → 0,5 s parado → 1 s atrás → 0,5 s parado, en bucle.
- Evidencia: estados del modelo L298N con duraciones ±10 %; pasa por «parado» ≥ 100 ms antes de invertir; sentido del motor modelado coherente.

**5.2 `arduino-l298n-velocidad` — Velocidad con ENA**
- Previos: 5.1, 2.1.
- Objetivo: PWM en ENA, zona muerta del motor, rampas de arranque.
- Componentes: L298N (IN1 D7, IN2 D8, ENA D9), motor DC.
- Práctica: probar ENA a 60, 120, 255 y ver que a 60 el motor no gira.
- Reto: rampa 0→255 en 2 s, 1 s a tope, rampa hasta 0 en 2 s.
- Evidencia: % PWM de ENA según el perfil ±8 puntos; sin saltos > 15 puntos; dirección constante durante la rampa.

**5.3 `arduino-l298n-dos-motores` — Dos motores y maniobras**
- Previos: 5.2.
- Objetivo: funciones con parámetros (`avanzar(v)`, `girar(...)`, `parar()`), tracción diferencial.
- Componentes: L298N completo (IN1–IN4 en D7, D8, D4, D2; ENA D5, ENB D6), dos motores.
- Práctica: probar cada función por separado.
- Reto: avanzar 1 s, girar a la derecha 0,6 s (ruedas en sentido opuesto), avanzar 1 s, parar; cada maniobra anunciada por serie.
- Evidencia: secuencia de estados de ambos motores ±10 %; giro con sentidos opuestos; mensajes a ±100 ms.

### Tema 6 · Robot evasor

**6.1 `arduino-evasor-decision` — Decidir ante un obstáculo (banco de pruebas)**
- Previos: 4.2, 5.3.
- Objetivo: lazo leer → decidir → actuar; máquina de estados simple.
- Componentes: HC-SR04 (D7/D8) + L298N como en 5.3; robot en banco (ruedas al aire).
- Práctica: imprimir estado y distancia en cada ciclo.
- Reto: avanzar si > 25 cm; si no, parar, retroceder 0,4 s y girar hasta ver > 40 cm.
- Evidencia (guion de distancias en el tiempo, sin movimiento): tras caer < 25 cm, motores parados en ≤ 150 ms; retroceso 0,3–0,5 s; giro hasta que el guion supera 40 cm; vuelve a avanzar en ≤ 150 ms.

**6.2 `arduino-evasor-pista` — Evasor en pista simulada**
- Previos: 6.1.
- Objetivo: ajustar umbrales y velocidades con física (inercia, zona muerta).
- Componentes: robot completo en mundo 2D.
- Práctica: recorrer una pista sin obstáculos.
- Reto: recorrer 3 pistas fijas (semillas conocidas) durante 60 s simulados cada una.
- Evidencia: 0 colisiones; recorrido ≥ 6 m en cada pista; nunca inmóvil > 3 s seguidos. Las pistas son deterministas para que el resultado sea reproducible.

**6.3 `arduino-evasor-servo-radar` — Evasor con sensor giratorio** *(opcional)*
- Previos: 6.2, 3.2.
- Reto: barrer el sensor con el servo y girar hacia el lado más libre. Evidencia: igual que 6.2 en pistas más estrechas, con el servo moviéndose durante la marcha.

### Requisitos técnicos por lección

| Lección | Pines/estímulos | Compilador | Emulación nueva |
|---|---|---|---|
| 1.1 | — | actual | — |
| 1.2 | salidas | actual | circuito por lección, evaluador por lección |
| 2.1 | PWM | actual | medición PWM |
| 2.2, 2.3 | entrada + rebotes | actual | inyección de entradas programadas |
| 2.4 | ADC | actual | bundle con `AVRADC` |
| 3.1, 3.2 | PWM Timer1 | **librería Servo** | modelo servo |
| 4.1, 4.2 | TRIG/ECHO µs | actual | modelo HC-SR04 |
| 5.1–5.3 | IN/EN | actual | modelo L298N + motor |
| 6.1 | guion de distancias | actual | HC-SR04 + L298N |
| 6.2, 6.3 | lazo cerrado | actual (6.3: Servo) | mundo 2D determinista |

---

## 4. Identificadores y borradores

### 4.1 Identificadores

- Formato: `arduino-<tema>-<tema>` en minúsculas, compatible con la restricción ya existente `^[a-z0-9-]{3,60}$` (tabla `borradores` y `localStorage`). Son **definitivos**: no se renombran aunque cambie el título o el orden. Si una lección cambia tanto que el borrador anterior ya no sirve, se crea un identificador nuevo (`…-v2`) y el antiguo se conserva.
- `arduino-led-serie` se mantiene sin cambios.
- El orden de la ruta vive en un manifiesto (`lecciones` con `id`, `tema`, `orden`, `previas`, `requiere`), no en el identificador.
- URL: `games/laboratorio-arduino/index.html?leccion=<id>`. Sin parámetro → `arduino-led-serie`, así la `ruta_laboratorio` de `course-arduino` y los enlaces actuales siguen funcionando. Un identificador desconocido muestra la lista de lecciones; nunca se guarda con él.

### 4.2 Borradores por estudiante y lección

- **Servidor:** la tabla `borradores` ya tiene clave `(usuario_id, leccion_id)` y no necesita migración. Basta ampliar la lista `LECCIONES` de `services/aula-api/app/main.py` con los nuevos identificadores (todos → `course-arduino`). Los borradores existentes de `arduino-led-serie` no se tocan.
- **Navegador:** se conserva la clave `globalt.laboratorio.arduino.v1` y su mapa `lessons[id]`; cada lección escribe en su entrada. No se renombra la clave ni se migra nada local.
- **Coherencia:** una prueba en `tests/` debe comprobar que los identificadores del manifiesto del laboratorio y `LECCIONES` de la API coinciden, que cumplen el patrón y que `arduino-led-serie` sigue presente.
- Cambiar de lección guarda o pregunta como hoy («Cambios sin guardar»); el conflicto 409 y la elección cuenta/navegador siguen siendo por lección.

### 4.3 Qué exige API, migración o despliegue Linux

| Cambio | API | Migración | Despliegue Linux |
|---|---|---|---|
| Nuevas lecciones y modelos en el laboratorio (JS estático) | — | — | Publicación estática habitual |
| Admitir borradores de lecciones nuevas (`LECCIONES`) | Sí (código) | **No** | Sí: actualizar el contenedor de la API del aula (`update-aula-preview.sh` / `aula-produccion.sh`) |
| Listar mis borradores del curso (`GET /api/aula/borradores?curso=…`), opcional para el índice de lecciones | Sí | No | Sí (API) |
| Bundle avr8js con ADC | — | — | Publicación estática |
| Librería Servo | — (la API reenvía igual) | — | Sí: **reconstruir y desplegar la imagen del compilador** |
| Registrar aprobaciones en la cuenta (futuro) | Sí | Sí: nueva `0004_…` (nunca editar 0001–0003: `migraciones.py` rechaza cambios por suma de control) | Sí |

Sobre aprobaciones en el servidor: la evaluación ocurre en el navegador, así que un registro en la cuenta sería **declarativo**, no una prueba. Si se implementa, guardar resumen de comprobaciones, hash del HEX y versión del evaluador, y documentar esa limitación. No forma parte de las próximas entregas.

---

## 5. Siguiente entrega mínima: control digital y PWM

> **Estado (16-11-2026):** implementada en la rama `feature/leccion-semaforo-pwm` (PR pendiente de desplegar la API; procedimiento en `docs/ACTUALIZACION_LECCIONES_2_3.md`, detalle técnico en `docs/LABORATORIO_ARDUINO.md`). Ajustes respecto a este plan, todos anunciados en el reto de cada lección:
> - Semáforo: se evalúan **17 s** (no 15) para que dos ciclos de 7 s quepan aun con el +10 % de tolerancia; «dos ciclos» = al menos 6 fases completas en orden. Cuesta unos 5,5–6,5 s de reloj en Chromium.
> - PWM: la frecuencia se exige solo donde hay valores intermedios (0 % y 100 % son salida continua) y se mide con la mediana de los intervalos; se aceptan ventanas sueltas fuera de rango (hasta el 10 %) por el pulso que deja `analogWrite` al cambiar de valor. El reto de PWM no exige monitor serie.
> - El registro de «reto superado» sigue siendo local; la cuenta guarda solo el código.

**Alcance:** lecciones **1.2 `arduino-protoboard-semaforo`** y **2.1 `arduino-pwm-brillo`**, más la infraestructura de varias lecciones que reutilizarán todas las siguientes. No requiere cambios en el compilador ni migraciones.

### Trabajo

1. **Varias lecciones:** manifiesto de lecciones; cada lección en su módulo (contenido, pasos, ejemplos, reto, circuito, evaluador, pistas); `main.js` resuelve `?leccion=` y sustituye todas las referencias a `LESSON` por la lección activa; selector de lecciones con previas recomendadas (no bloqueantes).
2. **Medición PWM:** el Worker resume por pin y ventana (20 ms): % alto, frecuencia y nivel final. El modo tiempo real envía el resumen en lugar de cada flanco de un pin con PWM; la traza de evaluación conserva flancos de pines lentos y resúmenes de los rápidos, sin depender de `MAX_TRACE`.
3. **Circuito por lección:** componentes LED (encendido/brillo según % medido) y resistencia; diagrama de protoboard original para 1.2; tira de pines que incluye el % PWM.
4. **Evaluadores** de 1.2 y 2.1 con los criterios de la sección 3; `challenge.js` de 1.1 sin cambios de comportamiento.
5. **API del aula:** añadir los dos identificadores a `LECCIONES` + prueba de coherencia (sección 4.2).
6. **Pistas de Chispa** para ambas lecciones (sin entregar la solución).
7. **Fixtures** `.ino` + `.hex` reales para cada reto: solución, y fallos típicos (solape de LEDs, orden incorrecto, `analogWrite` en pin sin PWM, escalones bruscos, sin serie).

### Criterios de aceptación

- `arduino-led-serie` se comporta exactamente igual: mismas pruebas unitarias y e2e en verde; el borrador existente en la cuenta y en el navegador se abre sin cambios.
- `?leccion=arduino-protoboard-semaforo` y `?leccion=arduino-pwm-brillo` cargan su contenido, circuito y reto; sin parámetro se abre la lección 1.
- Las soluciones de referencia compiladas aprueban; cada fixture de fallo suspende con la comprobación concreta que lo explica. Ninguna aprobación es posible sin compilar y ejecutar.
- PWM: para `analogWrite(9, v)` con v ∈ {0, 64, 128, 191, 255}, el % medido coincide con v/255 ±2 puntos y la frecuencia es ≈ 490 Hz; en D5/D6, ≈ 980 Hz. Un pin sin PWM nunca muestra valores intermedios.
- La simulación en tiempo real con PWM en dos pines durante 60 s no bloquea la interfaz ni crece la memoria de forma sostenida; la evaluación de 6 s termina en < 5 s de reloj en un equipo de referencia.
- Borradores: con sesión e inscripción, cada lección guarda y recupera su propio borrador (`GET/PUT /api/aula/borradores/<id>`); guardar en una no altera otra; un identificador no listado devuelve 404. Sin aula, todo funciona con guardado local.
- `python3 scripts/check.py`, `python3 -m unittest discover -s tests -v` y las pruebas de `services/aula-api` pasan; nuevas e2e cubren cambio de lección y ambos retos.
- `docs/LABORATORIO_ARDUINO.md` actualizado (capacidades PWM, lecciones, criterios).

### Dependencias

- **Despliegue Linux de la API del aula** para que los borradores de las dos lecciones nuevas se guarden en la cuenta (sin migración). Hasta entonces el laboratorio debe seguir funcionando con guardado local y avisar de que esa lección aún no se guarda en la cuenta.
- Compilador ya instalado y accesible por el aula (existente); sin cambios de imagen.
- Fuera de esta entrega: entradas (2.2–2.3), ADC (2.4), Servo (requiere imagen nueva del compilador), HC-SR04, L298N y robot.

### Entregas posteriores (orden propuesto)

1. Entradas programadas + 2.2 y 2.3. **Implementada (17-11-2026)** en la rama `feature/lecciones-boton` (PR pendiente de desplegar la API; procedimiento en `docs/ACTUALIZACION_LECCIONES_4_5.md`, detalle en `docs/LABORATORIO_ARDUINO.md`). Ajustes anunciados en cada reto: en 2.2 el mensaje debe empezar en ≤ 50 ms tras el cambio y se admite un saludo al arrancar; en 2.3 la respuesta (≤ 60 ms) se mide desde que el contacto deja de rebotar, el guion rebota también al soltar y dura 5,5 s.
2. Bundle con ADC + 2.4. **Implementada (17-11-2026)** en la rama `feature/leccion-potenciometro` (PR pendiente de desplegar la API; procedimiento en `docs/ACTUALIZACION_LECCION_6.md`, detalle en `docs/LABORATORIO_ARDUINO.md`). Ajustes anunciados en el reto: el guion añade un tramo final de vuelta a 1,25 V y sus cambios no caen en múltiplos de 250 ms (evaluación de 5,4 s); la línea debe contener la lectura como número entero; ritmo de 250 ms ±10 %.
3. Modelo HC-SR04 + 4.1 y 4.2. **Implementada (17-11-2026)** en la rama `feature/lecciones-ultrasonico` (PR pendiente de desplegar la API; procedimiento en `docs/ACTUALIZACION_LECCIONES_7_8.md`, detalle en `docs/LABORATORIO_ARDUINO.md`). Ajustes anunciados en cada reto: en 4.1 cada valor debe salir de un eco medido, se evalúan 6,1 s y el ritmo admite ±10 %; en 4.2 el LED también debe apagarse sin eco, el tramo sin eco dura 1,1 s, el guion vuelve a 30 cm y «Fuera de rango» no puede aparecer con eco. El módulo modelado baja ECHO a los 38 ms sin eco.
4. Modelo L298N/motor + 5.1–5.3.
5. Librería Servo en el compilador (despliegue de imagen) + 3.1 y 3.2.
6. Mundo 2D en lazo cerrado + 6.1 y 6.2 (6.3 opcional).

Servo se sitúa después de motores porque es la única pieza que exige reconstruir el compilador; el orden pedagógico del curso (sección 3) no cambia: las lecciones se publican cuando su soporte está listo.
