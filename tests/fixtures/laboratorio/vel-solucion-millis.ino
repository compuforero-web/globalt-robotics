// Solución alternativa del reto de la lección 10: el valor se calcula con millis() (sin for).
const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;
unsigned long inicio;

void setup() {
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
  inicio = millis();
}

void loop() {
  unsigned long t = (millis() - inicio) % 6000;
  int v;
  if (t < 2000) v = map(t, 0, 2000, 0, 255);
  else if (t < 3000) v = 255;
  else if (t < 5000) v = map(t, 3000, 5000, 255, 0);
  else v = 0;
  analogWrite(ENA, v);
}
