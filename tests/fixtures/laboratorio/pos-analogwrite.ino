// Fallo: analogWrite en D9 no es una señal de servo (PWM a 490 Hz, no un pulso cada 20 ms).
void mover(int angulo) {
  analogWrite(9, map(angulo, 0, 180, 0, 255));
  Serial.print("Angulo: ");
  Serial.println(angulo);
  delay(1000);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  mover(0);
  mover(90);
  mover(180);
  mover(90);
}
