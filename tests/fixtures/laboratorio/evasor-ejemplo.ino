// GLOBALT Robotics · Evasor en banco: primero comprueba el sensor.
const int TRIG = 7, ECHO = 8;
const int IN1 = 2, IN2 = 4, IN3 = 10, IN4 = 11;
const int ENA = 5, ENB = 6;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);
  analogWrite(ENA, 0);
  analogWrite(ENB, 0);
}

void loop() {
  digitalWrite(TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  unsigned long eco = pulseIn(ECHO, HIGH, 30000);
  if (eco == 0) Serial.println("Sin eco: motores parados");
  else {
    Serial.print("Distancia: ");
    Serial.print(eco / 58);
    Serial.println(" cm");
  }
  delay(70);
}
