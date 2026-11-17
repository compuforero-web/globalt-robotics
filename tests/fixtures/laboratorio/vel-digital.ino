// Fallo (lección 10): ENA solo con digitalWrite (sin PWM).
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  pinMode(ENA, OUTPUT);
}

void loop() {
  digitalWrite(ENA, HIGH);
  delay(3000);
  digitalWrite(ENA, LOW);
  delay(3000);
}
