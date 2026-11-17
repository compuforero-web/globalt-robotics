// Fallo: el extremo es 160° en vez de 180°.
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
  mover(160);
  mover(90);
}
