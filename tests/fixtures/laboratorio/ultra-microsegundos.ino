// Fallo: imprime los microsegundos con «cm».
const int TRIG = 7;
const int ECO = 8;

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
  Serial.print(duracion);
  Serial.println(" cm");
  delay(100);
}
