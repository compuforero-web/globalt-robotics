// Solución alternativa (lección 9): para con IN1 e IN2 en HIGH (también es freno).
const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void fase(int a, int b, int ms) {
  digitalWrite(IN1, a);
  digitalWrite(IN2, b);
  delay(ms);
}

void loop() {
  fase(HIGH, LOW, 1000);
  fase(HIGH, HIGH, 500);
  fase(LOW, HIGH, 1000);
  fase(HIGH, HIGH, 500);
}
