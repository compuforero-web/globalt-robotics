// Fallo: brillo invertido entre 50 y 10 cm.
const int TRIG = 7;
const int ECO = 8;
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  pinMode(LED, OUTPUT);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long duracion = pulseIn(ECO, HIGH, 30000);
  if (duracion == 0) {
    analogWrite(LED, 0);
    Serial.println("Fuera de rango");
  } else {
    long cm = duracion / 58;
    if (cm > 50) {
      analogWrite(LED, 0);
    } else if (cm < 10) {
      analogWrite(LED, 255);
    } else {
      analogWrite(LED, constrain(map(cm, 50, 10, 255, 0), 0, 255));
    }
  }
  delay(80);
}
