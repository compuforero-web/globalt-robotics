// Fallo: no trata el 0 de pulseIn: sin eco calcula 0 cm y enciende el LED al máximo.
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
  long cm = pulseIn(ECO, HIGH, 30000) / 58;
  if (cm > 400) Serial.println("Fuera de rango");
  analogWrite(LED, constrain(map(cm, 50, 10, 0, 255), 0, 255));
  delay(80);
}
