// Ejemplo: writeMicroseconds fija el ancho del pulso directamente.
// read() devuelve el ángulo que corresponde a ese pulso.
#include <Servo.h>

Servo servo;

void setup() {
  Serial.begin(9600);
  servo.attach(9);
  servo.writeMicroseconds(1000);
  Serial.print("Pulso de 1000 us = ");
  Serial.print(servo.read());
  Serial.println(" grados");
}

void loop() { }
