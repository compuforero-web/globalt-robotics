// Ejemplo: una función para el motor izquierdo con dos parámetros.
// sentido: 1 adelante, -1 atrás, 0 parado.
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 5;

void motorIzquierdo(int sentido, int velocidad) {
  digitalWrite(IN1, sentido == 1 ? HIGH : LOW);
  digitalWrite(IN2, sentido == -1 ? HIGH : LOW);
  analogWrite(ENA, velocidad);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  motorIzquierdo(1, 180);
  delay(800);
  motorIzquierdo(-1, 180);
  delay(800);
  motorIzquierdo(0, 0);
}

void loop() { }
