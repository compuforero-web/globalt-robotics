// Fallo: el servo se conecta en el programa a D10, pero el circuito lo tiene en D9.
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
  servo.attach(10);
}

void loop() {
  mover(0);
  mover(90);
  mover(180);
  mover(90);
}
