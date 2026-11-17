// Fallo (lección 11): velocidad 60, por debajo de la zona muerta.
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

void setup() {
  Serial.begin(9600);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(ENA, OUTPUT);
  pinMode(ENB, OUTPUT);
  avanzar(60);
  delay(1000);
  girarDerecha(60);
  delay(600);
  avanzar(60);
  delay(1000);
  parar();
}

void loop() {
}
