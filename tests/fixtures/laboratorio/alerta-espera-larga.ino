// Fallo: con tiempo máximo, pero espera 60 ms antes de avisar «Fuera de rango».
const int TRIG = 7;
const int ECO = 8;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duracion = pulseIn(ECO, HIGH, 30000);
  if (duracion == 0) {
    analogWrite(LED, 0);
    delay(60);
    Serial.println("Fuera de rango");
  } else {
    long cm = duracion / 58;
    analogWrite(LED, constrain(map(cm, 50, 10, 0, 255), 0, 255));
  }
  delay(80);
}
