// Fallo: imprime cada ángulo al terminar la espera, no al mover el servo.
#include <Servo.h>

Servo servo;

void mover(int angulo) {
  servo.write(angulo);
  delay(1000);
  Serial.print("Angulo: ");
  Serial.println(angulo);
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
