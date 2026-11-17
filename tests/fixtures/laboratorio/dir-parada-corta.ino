// Fallo (lección 9): paradas de solo 50 ms antes de invertir.
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
  fase(LOW, LOW, 50);
  fase(LOW, HIGH, 1000);
  fase(LOW, LOW, 50);
}
