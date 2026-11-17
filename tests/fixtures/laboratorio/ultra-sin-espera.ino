// Fallo: dispara el sensor sin parar (cada ~1–10 ms) e imprime cada 150 ms el último valor.
const int TRIG = 7;
const int ECO = 8;
unsigned long ultimo = 0;
long cm = 0;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  cm = pulseIn(ECO, HIGH, 30000) / 58;
  if (millis() - ultimo >= 150) {
    ultimo = millis();
    Serial.print("Distancia: ");
    Serial.print(cm);
    Serial.println(" cm");
  }
}
