// Fallo: solo attach(); el servo queda en la posición por defecto (1500 µs) aunque se imprima la secuencia.
#include <Servo.h>

Servo servo;

void setup() {
  Serial.begin(9600);
  servo.attach(9);
}

void loop() {
  Serial.println("Angulo: 0");
  delay(1000);
  Serial.println("Angulo: 90");
  delay(1000);
  Serial.println("Angulo: 180");
  delay(1000);
  Serial.println("Angulo: 90");
  delay(1000);
}
