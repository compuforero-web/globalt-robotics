// Prueba de convivencia de temporizadores: Servo (Timer1, D9) con PWM de Timer0 (D5, D6), de Timer2 (D3, D11),
// analogWrite en D10 (Timer1, que Servo reconfigura) y un LED con millis() en D13.
#include <Servo.h>

Servo servo;
unsigned long tLed = 0;

void setup() {
  pinMode(13, OUTPUT);
  servo.attach(9);
  servo.write(45);
  analogWrite(5, 64);
  analogWrite(6, 128);
  analogWrite(3, 192);
  analogWrite(11, 32);
  analogWrite(10, 100);
}

void loop() {
  if (millis() - tLed >= 250) {
    tLed += 250;
    digitalWrite(13, !digitalRead(13));
  }
}
