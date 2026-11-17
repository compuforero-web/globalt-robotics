// Fallo (lección 10): rampas de 1 s en lugar de 2 s.
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void loop() {
  for (int v = 0; v <= 255; v++) {
    analogWrite(ENA, v);
    delay(4);
  }
  delay(1000);
  for (int v = 255; v >= 0; v--) {
    analogWrite(ENA, v);
    delay(4);
  }
  delay(1000);
}
