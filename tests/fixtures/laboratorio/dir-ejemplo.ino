// GLOBALT Robotics · Lección 9: un motor con el puente H L298N
// IN1 en D7, IN2 en D8. ENA lleva el puente puesto (siempre habilitado).
// El motor se alimenta con su batería a través del L298N; el Nano solo da las órdenes.

const int IN1 = 7;
const int IN2 = 8;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);

  // Adelante durante 1,5 segundos
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  delay(1500);

  // Parar: IN1 e IN2 iguales (freno)
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);

  // Práctica: añade aquí un giro hacia atrás de 1 segundo y vuelve a parar.
}

void loop() {
}
