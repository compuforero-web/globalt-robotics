// Prueba de precisión: dispara el HC-SR04 y escribe la duración del ECHO (pulseIn) y el tiempo de espera (micros).
const int TRIG = 7;
const int ECO = 8;

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
}

void medir(unsigned long limite) {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long t0 = micros();
  unsigned long d = limite ? pulseIn(ECO, HIGH, limite) : pulseIn(ECO, HIGH);
  unsigned long t1 = micros();
  Serial.print(limite);
  Serial.print(' ');
  Serial.print(d);
  Serial.print(' ');
  Serial.println(t1 - t0);
}

void loop() {
  medir(0);
  delay(60);
  medir(30000UL);
  delay(60);
  medir(5000UL);
  delay(60);
}
