// Prueba del modelo con el mapa del futuro robot evasor (docs/INTEGRACION_PINES_ARDUINO.md):
// izquierdo IN1 D2, IN2 D4, ENA D5; derecho IN3 D10, IN4 D11, ENB D6. D7/D8 quedan para el HC-SR04 y D9 para el servo.
const int IN1 = 2;
const int IN2 = 4;
const int IN3 = 10;
const int IN4 = 11;
const int ENA = 5;
const int ENB = 6;

void motores(int a1, int a2, int b1, int b2, int va, int vb) {
  digitalWrite(IN1, a1);
  digitalWrite(IN2, a2);
  digitalWrite(IN3, b1);
  digitalWrite(IN4, b2);
  analogWrite(ENA, va);
  analogWrite(ENB, vb);
}

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  pinMode(7, OUTPUT);           // TRIG: libre para el sensor, no afecta a los motores
  motores(HIGH, LOW, HIGH, LOW, 200, 200);   // avanzar
  delay(1000);
  motores(HIGH, LOW, LOW, HIGH, 180, 180);   // girar a la derecha
  delay(600);
  motores(LOW, LOW, LOW, LOW, 255, 255);     // freno
  delay(400);
  motores(LOW, LOW, LOW, LOW, 0, 0);         // libre
}

void loop() {
  digitalWrite(7, HIGH);        // actividad en D7: no es un pin del mapa del robot
  delayMicroseconds(10);
  digitalWrite(7, LOW);
  delay(60);
}
