// Mapa del futuro robot evasor (docs/INTEGRACION_PINES_ARDUINO.md): servo en D9 barriendo con millis() mientras los
// motores (IN1 D2, IN2 D4, IN3 D10, IN4 D11, ENA D5, ENB D6) avanzan y TRIG (D7) dispara cada 60 ms.
#include <Servo.h>

Servo radar;
int angulo = 30;
int paso = 2;
unsigned long tServo = 0;
unsigned long tTrig = 0;

void setup() {
  int salidas[] = {2, 4, 10, 11, 7};
  for (int i = 0; i < 5; i++) pinMode(salidas[i], OUTPUT);
  pinMode(8, INPUT);
  radar.attach(9);
  digitalWrite(2, HIGH);
  digitalWrite(4, LOW);
  digitalWrite(10, HIGH);
  digitalWrite(11, LOW);
  analogWrite(5, 200);
  analogWrite(6, 200);
}

void loop() {
  unsigned long ahora = millis();
  if (ahora - tServo >= 20) {
    tServo += 20;
    angulo += paso;
    if (angulo >= 150 || angulo <= 30) paso = -paso;
    radar.write(angulo);
  }
  if (ahora - tTrig >= 60) {
    tTrig += 60;
    digitalWrite(7, HIGH);
    delayMicroseconds(10);
    digitalWrite(7, LOW);
  }
}
