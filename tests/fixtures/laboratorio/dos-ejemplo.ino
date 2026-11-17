// GLOBALT Robotics · Lección 11: dos motores con el L298N
// Motor izquierdo (A): IN1 D7, IN2 D8, ENA D5.
// Motor derecho  (B): IN3 D4, IN4 D2, ENB D6.

const int IN1 = 7;
const int IN2 = 8;
const int IN3 = 4;
const int IN4 = 2;
const int ENA = 5;
const int ENB = 6;

void avanzar(int velocidad) {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
  analogWrite(ENA, velocidad);
  analogWrite(ENB, velocidad);
}

void parar() {
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  // Práctica: prueba cada función por separado.
  avanzar(200);
  delay(1500);
  parar();
}

void loop() {
}
