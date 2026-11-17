// Prueba del modelo: ENA (D9) a 60, 120 y 255 durante 1 s cada uno, hacia adelante.
void setup() {
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
  digitalWrite(7, HIGH);
  digitalWrite(8, LOW);
}

void loop() {
  analogWrite(9, 60);
  delay(1000);
  analogWrite(9, 120);
  delay(1000);
  analogWrite(9, 255);
  delay(1000);
  analogWrite(9, 0);
  delay(1000);
}
