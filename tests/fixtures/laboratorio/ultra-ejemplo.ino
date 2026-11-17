// GLOBALT Robotics · Lección 7: el eco del HC-SR04
// HC-SR04: VCC a 5 V, TRIG en D7, ECHO en D8, GND a GND.

const int TRIG = 7;
const int ECO = 8;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
  digitalWrite(TRIG, LOW);
}

void loop() {
  // 1. Pulso de disparo: 10 microsegundos en HIGH.
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  // 2. Práctica: cuánto tiempo pasa ECHO en HIGH (en microsegundos).
  unsigned long duracion = pulseIn(ECO, HIGH);
  Serial.print("Eco: ");
  Serial.print(duracion);
  Serial.println(" us");
  delay(500);
}
