// Solución alternativa: mide el ECHO con micros() y escribe un decimal; ritmo con millis() cada 150 ms.
const int TRIG = 7;
const int ECO = 8;
unsigned long ultimo = 0;

float medir() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(12);
  digitalWrite(TRIG, LOW);
  unsigned long t0 = micros();
  while (digitalRead(ECO) == LOW) {
    if (micros() - t0 > 30000) return -1;
  }
  unsigned long inicio = micros();
  while (digitalRead(ECO) == HIGH) {
    if (micros() - inicio > 30000) return -1;
  }
  return (micros() - inicio) * 0.0343 / 2;
}

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
}

void loop() {
  if (millis() - ultimo >= 150) {
    ultimo += 150;
    float cm = medir();
    Serial.print("Distancia: ");
    Serial.print(cm, 1);
    Serial.println(" cm");
  }
}
