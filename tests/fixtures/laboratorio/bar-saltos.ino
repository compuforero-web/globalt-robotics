// Fallo: salta de 0° a 180° y vuelve cada 2,7 s en lugar de barrer.
#include <Servo.h>

Servo servo;
const int LED = 13;

int angulo = 0;
int paso = 1;
unsigned long tServo = 0;
unsigned long tLed = 0;
bool encendido = false;

void setup() {
  pinMode(LED, OUTPUT);
  servo.attach(9);
  servo.write(angulo);
}

void loop() {
  unsigned long ahora = millis();
  if (ahora - tServo >= 2700) {
    tServo += 2700;
    angulo = 180 - angulo;
    servo.write(angulo);
  }
  if (ahora - tLed >= 500) {
    tLed += 500;
    encendido = !encendido;
    digitalWrite(LED, encendido ? HIGH : LOW);
  }
}
