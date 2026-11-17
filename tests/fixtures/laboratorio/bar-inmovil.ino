// Fallo: el LED parpadea, pero el servo se queda quieto en 90°.
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
  servo.write(90);
}

void loop() {
  unsigned long ahora = millis();
  if (ahora - tLed >= 500) {
    tLed += 500;
    encendido = !encendido;
    digitalWrite(LED, encendido ? HIGH : LOW);
  }
}
