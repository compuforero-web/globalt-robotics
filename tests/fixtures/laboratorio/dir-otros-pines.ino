// Fallo (lección 9): usa D9 y D10 en lugar de D7 y D8.
const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(9, OUTPUT);
  pinMode(10, OUTPUT);
}

void fase(int a, int b, int ms) {
  digitalWrite(IN1, a);
  digitalWrite(IN2, b);
  delay(ms);
}

void loop() {
  digitalWrite(9, HIGH); digitalWrite(10, LOW); delay(1000);
  digitalWrite(9, LOW); delay(500);
  digitalWrite(10, HIGH); delay(1000);
  digitalWrite(10, LOW); delay(500);
}
