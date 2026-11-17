// Fallo: escribe siempre el mismo valor sin medir (no dispara el sensor).
void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println("Distancia: 10 cm");
  delay(120);
}
