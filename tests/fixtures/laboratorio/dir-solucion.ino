// Solución de referencia del reto «Ida y vuelta» (lección 9).
const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
}

void loop() {
  digitalWrite(IN1, HIGH);   // adelante
  digitalWrite(IN2, LOW);
  delay(1000);
  digitalWrite(IN1, LOW);    // parado (freno)
  digitalWrite(IN2, LOW);
  delay(500);
  digitalWrite(IN1, LOW);    // atrás
  digitalWrite(IN2, HIGH);
  delay(1000);
  digitalWrite(IN1, LOW);    // parado (freno)
  digitalWrite(IN2, LOW);
  delay(500);
}
