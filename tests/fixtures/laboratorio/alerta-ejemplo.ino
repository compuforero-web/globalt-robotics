// GLOBALT Robotics · Lección 8: ¿qué devuelve pulseIn sin eco?
// HC-SR04: TRIG en D7, ECHO en D8. LED con 220 Ω en D9.

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

  // Práctica: marca «Sin obstáculo» y compara el resultado con y sin el tercer argumento.
  unsigned long duracion = pulseIn(ECO, HIGH, 30000);
  Serial.print("pulseIn = ");
  Serial.println(duracion);
  delay(300);
}
