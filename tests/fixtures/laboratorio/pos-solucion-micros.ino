// Otra solución: anchos de pulso con writeMicroseconds (544 µs = 0°, 1472 µs = 90°, 2400 µs = 180°) y una tabla.
#include <Servo.h>

Servo servo;
const int ANGULOS[] = {0, 90, 180, 90};
const int PULSOS[] = {544, 1472, 2400, 1472};

void setup() {
  Serial.begin(9600);
  servo.attach(9, 544, 2400);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    servo.writeMicroseconds(PULSOS[i]);
    Serial.print(ANGULOS[i]);
    Serial.println(" grados");
    delay(1000);
  }
}
