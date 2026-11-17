// Fallo: el servo se conecta en el programa a D10, pero el circuito lo tiene en D9.
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
  servo.attach(10);
  servo.write(angulo);
}

void loop() {
  unsigned long ahora = millis();
  if (ahora - tServo >= 15) {
    tServo += 15;
    angulo += paso;
    if (angulo >= 180 || angulo <= 0) paso = -paso;
    servo.write(angulo);
  }
  if (ahora - tLed >= 500) {
    tLed += 500;
    encendido = !encendido;
    digitalWrite(LED, encendido ? HIGH : LOW);
  }
}
