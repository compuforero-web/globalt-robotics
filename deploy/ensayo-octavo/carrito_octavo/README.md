# Carrito de octavo · «¿Cuándo debe frenar el robot?»

`carrito_octavo.ino` es el programa de la práctica física. El carrito **avanza** si la lectura usada es mayor que
20 cm y **se detiene** si es de 20 cm o menos. Si el sensor no devuelve eco, queda **detenido**. Usa el mismo mapa de
pines que el robot evasor del laboratorio (fase 4). El umbral de 25 cm de ese reto de evasión es otra actividad y no
cambia.

## Conexiones

| Pieza | Pin de la pieza | Arduino Nano / alimentación |
| --- | --- | --- |
| HC-SR04 (4 pines) | VCC | 5V |
| | GND | GND |
| | TRIG | D7 |
| | ECHO | D8 |
| L298N, motor izquierdo | IN1 · IN2 · ENA | D2 · D4 · D5 |
| L298N, motor derecho | IN3 · IN4 · ENB | D10 · D11 · D6 |
| L298N, salidas | OUT1–OUT2 · OUT3–OUT4 | motor izquierdo · motor derecho |
| L298N, potencia | VS (+12V) · GND | batería de 7–9 V (+) · batería (−) |
| GND común | GND del L298N | GND del Nano |

- Retira los dos puentes (jumpers) de ENA y ENB del L298N: así D5 y D6 controlan la velocidad.
- El Nano se alimenta por USB. No conectes el borne de 5 V del L298N al Nano.
- Si un motor gira hacia atrás al avanzar, intercambia sus dos cables en OUT1–OUT2 u OUT3–OUT4; no cambies el programa.

## Cargarlo desde Arduino IDE

1. Abre `carrito_octavo/carrito_octavo.ino` con **Archivo → Abrir**. Arduino IDE exige que la carpeta se llame igual
   que el archivo; si descargaste solo el `.ino`, acepta cuando ofrezca crear la carpeta `carrito_octavo`.
2. Conecta el Nano por USB y deja la batería de los motores **apagada**, o el carrito con las ruedas levantadas.
3. En **Herramientas**, elige **Placa: Arduino Nano**, **Procesador: ATmega328P** y el **Puerto** que aparece al
   conectarlo.
4. Pulsa **Verificar** (✓) y después **Subir** (→). Si falla con «not in sync», cambia el procesador a
   **ATmega328P (Old Bootloader)** y súbelo otra vez.
5. Abre **Herramientas → Monitor serie** a **9600 baudios**. Aparece «Carrito de octavo: regla PARAR con lectura
   <= 20 cm. Arranca en 3 s.» y después una línea cada 0,1 s.

En Linux, si el puerto no aparece o se niega el acceso, añade tu usuario al grupo `dialout` y vuelve a iniciar
sesión. Con placas compatibles que usan el chip CH340, en Windows puede hacer falta instalar su controlador.

## Qué muestra el monitor serie

```
Eco: 1161 us | Distancia: 20,0 cm | Lectura usada: 20 cm | Orden: PARAR
Eco: 1213 us | Distancia: 20,9 cm | Lectura usada: 21 cm | Orden: AVANZAR
Eco: sin eco | Distancia: -- | Lectura usada: -- | Orden: PARAR (sin eco)
```

- **Eco**: duración del pulso ECHO en microsegundos.
- **Distancia**: el eco convertido a centímetros con un decimal: unos 58 µs por centímetro de ida y vuelta.
- **Lectura usada**: la distancia **redondeada al centímetro entero más cercano**. **La regla se aplica a esta lectura
  procesada**, no a la distancia marcada con la regla de medir.
- **Orden**: lo que el programa envía al L298N en ese momento.

### El caso de 20,9 cm

Con este programa, 20,9 cm se redondea a una lectura de **21 cm**, así que el carrito **avanza**. El cambio de orden
queda hacia los 20,5 cm: 20,4 cm da 20 (PARAR) y 20,6 cm da 21 (AVANZAR).

La fase 1 del laboratorio calcula `cm = eco / 58`, que **descarta los decimales**. Con esa conversión, 20,9 cm daría
una lectura de 20 y el carrito **pararía**. Además, 21 cm quedaría a solo 1 µs del límite: un eco de 1219 µs da 21 y
uno de 1217 µs daría 20. El carrito redondea para que 21 cm avance con margen. En clase conviene decirlo así: «la regla
mira la lectura procesada; 20,9 cm puede leerse 21 o 20 según cómo se convierta».

### Cuando el sensor pierde el eco

Si no hay obstáculo en unos 5 m, el cable de ECHO está suelto o el eco no vuelve, `pulseIn` espera 30 ms y devuelve 0.
El programa lo trata como **sin lectura**: envía freno a los dos motores y escribe «Orden: PARAR (sin eco)». Nunca
avanza a ciegas. Cuando vuelve un eco válido, aplica de nuevo la regla.

### Orden enviada frente a posición final

La orden cambia en la medida siguiente, como mucho unos 0,2 s después del cambio. Un carrito en marcha recorre todavía
unos centímetros por inercia, así que **termina detenido más cerca que la lectura con la que recibió PARAR**. Esa
diferencia se mide aparte; la guía la registra en B5.

## Qué se verificó y qué falta

| Verificación | Cómo | Resultado |
| --- | --- | --- |
| Compila para Arduino Nano (ATmega328P) | Servicio de compilación del laboratorio (avr-gcc + ArduinoCore-avr 1.8.6) | 4092 bytes de flash, 408 bytes de RAM |
| 19, 20, 20,4, 20,6, 20,9, 21, 5 y 100 cm | Simulación del HEX con los modelos HC-SR04 y L298N del laboratorio (`tests/test_carrito_octavo.py`) | Lecturas 19 → 20 → 20 → 21 → 21 → 21 → 5 → 100; PARAR hasta 20 y AVANZAR desde 21, con los motores detenidos o avanzando |
| Sin eco | Misma simulación, obstáculo retirado | «PARAR (sin eco)» y motores detenidos |
| Espera inicial | Misma simulación | Motores quietos durante 3 s; arrancan a los 3,02 s con el camino libre |
| Tiempo de reacción | Misma simulación | Motores reflejan la nueva orden en 10–160 ms |
| Variante que descarta decimales | Misma simulación, solo para comparar | 20,9 cm → lectura 20 → PARAR; 21 cm → 21 → AVANZAR |
| Kit físico, sensor real y posición final | **Pendiente**: prueba física de Edwin (guía B5) | — |

La simulación no reproduce ruido del sensor, ángulo del haz, caída de tensión de la batería ni inercia real. Por eso la
posición final solo se puede medir con el kit.
