# Integración de pines: motores y futuro robot evasor

Contrato para combinar componentes en el Nano ATmega328P emulado. El modelo de motores ya lo cumple (ver «Implementación»); el robot integrado sigue siendo una fase futura.

## Conflicto resuelto en el plan

Las lecciones de motores 5.1–5.3 usan D7/D8 para dirección. Las lecciones de ultrasonido usan D7/D8 para TRIG/ECHO. Ambos mapas son válidos por separado, pero no pueden copiarse juntos al robot completo. La sección 6.1 de [RUTA_CURSO_ARDUINO.md](RUTA_CURSO_ARDUINO.md) utiliza ahora el mapa sin colisiones siguiente.

## Robot integrado (fase futura)

| Componente | Señal | Nano | Uso |
|---|---|---|---|
| HC-SR04 | TRIG | D7 | Salida al sensor |
| HC-SR04 | ECHO | D8 | Entrada desde el sensor |
| L298N, canal A | IN1 | D2 | Dirección |
| L298N, canal A | IN2 | D4 | Dirección |
| L298N, canal B | IN3 | D10 | Dirección |
| L298N, canal B | IN4 | D11 | Dirección |
| L298N, canal A | ENA | D5 | PWM |
| L298N, canal B | ENB | D6 | PWM |
| Servo opcional | Señal | D9 | Reservado; todavía requiere su implementación |

D0/D1 quedan libres para la comunicación serie. Alimentación y GND no son pines de control: los diagramas deben identificar la alimentación de motores y la referencia de tierra común, sin presentar el Nano como fuente de alimentación del motor.

## Entrega inmediata: tres lecciones de motores

Se mantienen los mapas ya previstos:

- `arduino-l298n-direccion`: IN1 D7, IN2 D8, ENA puenteado.
- `arduino-l298n-velocidad`: IN1 D7, IN2 D8, ENA D9.
- `arduino-l298n-dos-motores`: IN1 D7, IN2 D8, IN3 D4, IN4 D2, ENA D5, ENB D6.

No renombrar identificadores ni alterar las ocho lecciones publicadas. Las tres lecciones nuevas utilizan modelos configurables por pines para poder reutilizarlos en la fase del robot, sin reescribirlos ni introducir una segunda lógica de motores.

## Reglas de integración y comprobación

1. Circuito, ejemplos, guion y evaluador de cada lección usan la misma configuración de pines.
2. El modelo responde a estados digitales y PWM medidos del ATmega328P emulado; no al texto del programa ni a una secuencia de animación independiente.
3. Distinguir las órdenes eléctricas del puente H de la velocidad del motor: la respuesta mecánica puede tener inercia. Documentar parámetros, zona muerta y criterios de parada de la simulación.
4. Probar el mismo modelo con los mapas didácticos y el mapa futuro sin colisiones. La combinación real con sonar pertenece a la fase del evasor, no a la entrega inmediata.
5. Antes de incorporar el servo, comprobar la convivencia de temporizadores y PWM, además de añadir y desplegar su librería en el compilador.
6. Al desarrollar el evasor, comprobar que cada señal tenga un pin exclusivo y que ENA/ENB sean pines PWM. No reutilizar D7/D8 para dirección.

Validación de este plan: nueve señales con pines distintos, ENA/ENB en D5/D6, D0/D1 sin asignar y mapas de las lecciones de motores conservados. No se ha probado todavía el robot integrado: es una entrega futura.

## Implementación del modelo de motores (lecciones 9–11)

- `games/laboratorio-arduino/src/motor.js` define los cuatro mapas como datos (`PIN_MAPS.direccion`, `velocidad`, `dosMotores` y `robot`) y un único `MotorModel` configurable por canal (`{ id, name, in1, in2, en }`, `en: null` = puente). Las tres lecciones usan sus mapas didácticos sin cambios; el robot usará `PIN_MAPS.robot` con el mismo modelo, sin una segunda lógica de motores.
- Circuito, código inicial, ejemplos, evaluador y pistas de cada lección leen el mismo mapa (`motor-eval.js` exporta `DIRECCION_PINS`, `VELOCIDAD_PINS`, `DOS_PINS`); una prueba comprueba que los pines vigilados y el estímulo de la evaluación coinciden con el mapa.
- `pinMapProblems(canales, ocupados)` aplica las reglas 1 y 6: pin exclusivo para cada señal (también frente a otros componentes, p. ej. `{ 7: 'TRIG', 8: 'ECHO', 9: 'servo' }`), ENA/ENB en pines PWM y D0/D1 libres. `MotorModel` rechaza un mapa inválido.
- Comprobado (`tests/test_laboratorio.py`, `MotorLessonTests`): el mapa del robot no tiene problemas junto a TRIG D7, ECHO D8 y servo D9 (nueve señales distintas, EN en D5/D6); el de la lección 11 choca con el sonar en D7/D8, como se esperaba; un programa compilado con el mapa del robot (`motor-mapa-robot.ino`, que además da pulsos en D7) produce avanzar → girar a la derecha → parar, y el mismo HEX leído con el mapa de la lección 11 mueve solo lo que dicen esos pines.
- Temporizadores: ENA/ENB del robot (D5/D6) usan Timer0 (~980 Hz, el mismo que `millis`/`delay`, sin conflicto). El servo de D9 usará Timer1, que la librería Servo reconfigura: dejará sin `analogWrite` a D9 y D10 (D10 en el robot es IN3, solo digital, así que no se ve afectado). Queda por comprobar con la librería real cuando se incorpore.
- Pendiente de la fase del evasor: la combinación real sonar + motores en una sola lección y el mundo 2D.
