// Fallo: TRIG y ECHO cambiados de pin.
const int TRIG = 8;
const int ECO = 7;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  digitalWrite(TRIG, LOW);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duracion = pulseIn(ECO, HIGH, 30000);
  long cm = duracion / 58;
  Serial.print("Distancia: ");
  Serial.print(cm);
  Serial.println(" cm");
  delay(100);
}
