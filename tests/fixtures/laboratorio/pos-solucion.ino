// Solución de referencia: 0° → 90° → 180° → 90°, 1 s en cada posición, informando por serie.
#include <Servo.h>

Servo servo;

void mover(int angulo) {
  servo.write(angulo);
  Serial.print("Angulo: ");
  Serial.println(angulo);
  delay(1000);
}

void setup() {
  Serial.begin(9600);
  servo.attach(9);
}

void loop() {
  mover(0);
  mover(90);
  mover(180);
  mover(90);
}
