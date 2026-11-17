// Fallo: escribe la lectura 0–1023 directamente en analogWrite.
const int POT = A0;
const int LED = 9;
unsigned long ultimo = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(POT);
  analogWrite(LED, lectura);
  if (millis() - ultimo >= 250) {
    ultimo += 250;
    Serial.print("Lectura: ");
    Serial.println(lectura);
  }
}
