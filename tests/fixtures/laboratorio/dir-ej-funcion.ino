// Ejemplo: funciones con nombre hacen el programa más fácil de leer.
const int IN1 = 7;
const int IN2 = 8;

void adelante() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void frenar() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  adelante();
  delay(800);
  frenar();
}

void loop() { }
