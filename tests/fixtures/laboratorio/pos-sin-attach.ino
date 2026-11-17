// Fallo: write() sin attach(): la librería no genera pulsos y el servo no se mueve.
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
}

void loop() {
  mover(0);
  mover(90);
  mover(180);
  mover(90);
}
