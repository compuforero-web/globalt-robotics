// Fallo (lección 9): sentido incorrecto, empieza hacia atrás.
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
  fase(LOW, HIGH, 1000);
  fase(LOW, LOW, 500);
  fase(HIGH, LOW, 1000);
  fase(LOW, LOW, 500);
}
