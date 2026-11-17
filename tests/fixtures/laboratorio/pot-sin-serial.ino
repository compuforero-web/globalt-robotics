// Fallo: brillo correcto, pero sin monitor serie.
const int POT = A0;
const int LED = 9;
unsigned long ultimo = 0;

void setup() {
}

void loop() {
  int lectura = analogRead(POT);
  analogWrite(LED, map(lectura, 0, 1023, 0, 255));
  if (millis() - ultimo >= 250) {
    ultimo += 250;
  }
}
