// Fallo (lección 10): rampa brusca, de 0 a 255 de golpe.
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
  analogWrite(ENA, 0);
  delay(1000);
  analogWrite(ENA, 255);
  delay(2000);
  analogWrite(ENA, 0);
  delay(3000);
}
