// Solución alternativa (lección 11): frena 100 ms entre maniobras.
const int IN1 = 7;   // motor izquierdo (A)
const int IN2 = 8;
const int IN3 = 4;   // motor derecho (B)
const int IN4 = 2;
const int ENA = 5;
const int ENB = 6;

void motorIzquierdo(int sentido, int velocidad) {
  digitalWrite(IN1, sentido > 0 ? HIGH : LOW);
  digitalWrite(IN2, sentido < 0 ? HIGH : LOW);
  analogWrite(ENA, velocidad);
}

void motorDerecho(int sentido, int velocidad) {
  digitalWrite(IN3, sentido > 0 ? HIGH : LOW);
  digitalWrite(IN4, sentido < 0 ? HIGH : LOW);
  analogWrite(ENB, velocidad);
}

void avanzar(int v) {
  Serial.println("Avanzar");
  motorIzquierdo(1, v);
  motorDerecho(1, v);
}

void girarDerecha(int v) {
  Serial.println("Girar a la derecha");
  motorIzquierdo(1, v);
  motorDerecho(-1, v);
}

void parar() {
  Serial.println("Parar");
  motorIzquierdo(0, 0);
  motorDerecho(0, 0);
}

void frenar() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);
  delay(100);
}

void setup() {
  Serial.begin(9600);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  avanzar(200);
  delay(1000);
  frenar();
  girarDerecha(180);
  delay(600);
  frenar();
  avanzar(200);
  delay(1000);
  parar();
}

void loop() {
}
