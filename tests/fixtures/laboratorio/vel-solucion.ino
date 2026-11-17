// Solución de referencia del reto «Rampa suave» (lección 10).
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(ENA, OUTPUT);
  digitalWrite(IN1, HIGH);   // siempre hacia adelante
  digitalWrite(IN2, LOW);
}

void loop() {
  for (int v = 0; v <= 255; v++) {   // 256 pasos de ~8 ms ≈ 2 s
    analogWrite(ENA, v);
    delay(8);
  }
  delay(1000);                       // 1 s a tope
  for (int v = 255; v >= 0; v--) {
    analogWrite(ENA, v);
    delay(8);
  }
  delay(1000);                       // 1 s parado
}
