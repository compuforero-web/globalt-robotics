// GLOBALT Robotics · Lección 13: barrido sin bloquear
// Servo en D9 (fuente externa de 5 V y GND común) y LED en D13.
// Práctica: este barrido usa delay(). Ejecuta y mira el LED:
// ¿parpadea cada 500 ms mientras el servo se mueve?
#include <Servo.h>

Servo servo;
const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  servo.attach(9);
}

void loop() {
  for (int angulo = 0; angulo <= 180; angulo++) {
    servo.write(angulo);
    delay(15);
  }
  digitalWrite(LED, HIGH);
  delay(500);
  for (int angulo = 180; angulo >= 0; angulo--) {
    servo.write(angulo);
    delay(15);
  }
  digitalWrite(LED, LOW);
  delay(500);
}
