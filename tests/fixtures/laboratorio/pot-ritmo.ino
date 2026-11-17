// Fallo: escribe una línea cada 100 ms.
const int POT = A0;
const int LED = 9;
unsigned long ultimo = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(POT);
  analogWrite(LED, map(lectura, 0, 1023, 0, 255));
  if (millis() - ultimo >= 100) {
    ultimo += 100;
    Serial.print("Lectura: ");
    Serial.println(lectura);
  }
}
