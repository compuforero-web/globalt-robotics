// GLOBALT Robotics · Lección 12: posiciones del servo
// Servo SG90: naranja (señal) en D9, rojo a la fuente externa de 5 V,
// marrón al negativo de la fuente, unido al GND del Nano (GND común).
// Práctica: mira el ancho del pulso y el brazo con 0°, 90° y 180°.
#include <Servo.h>

Servo servo;   // un objeto Servo por cada servo

void setup() {
  servo.attach(9);   // D9 empieza a recibir un pulso cada 20 ms
}

void loop() {
  servo.write(0);
  delay(2000);
  servo.write(90);
  delay(2000);
  servo.write(180);
  delay(2000);
}
