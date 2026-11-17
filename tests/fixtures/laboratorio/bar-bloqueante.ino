// Fallo: barrido con delay(): mientras el servo se mueve, el LED no puede cambiar.
#include <Servo.h>

Servo servo;
bool encendido = false;

void setup() {
  pinMode(13, OUTPUT);
  servo.attach(9);
}

void loop() {
  for (int a = 0; a <= 180; a++) {
    servo.write(a);
    delay(15);
  }
  encendido = !encendido;
  digitalWrite(13, encendido);
  for (int a = 180; a >= 0; a--) {
    servo.write(a);
    delay(15);
  }
  encendido = !encendido;
  digitalWrite(13, encendido);
}
