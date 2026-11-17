// Otra solución: cada tarea en su función, con su propio reloj.
#include <Servo.h>

Servo brazo;

void tareaServo() {
  static unsigned long antes = 0;
  static int angulo = 0;
  static int sentido = 1;
  if (millis() - antes < 15) return;
  antes = millis();
  if (angulo == 180) sentido = -1;
  if (angulo == 0) sentido = 1;
  angulo = angulo + sentido;
  brazo.write(angulo);
}

void tareaLed() {
  static unsigned long antes = 0;
  if (millis() - antes < 500) return;
  antes = antes + 500;
  digitalWrite(13, !digitalRead(13));
}

void setup() {
  pinMode(13, OUTPUT);
  brazo.attach(9);
  brazo.write(0);
}

void loop() {
  tareaServo();
  tareaLed();
}
