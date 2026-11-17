// Solución alternativa: distancia en float, brillo calculado a mano y aviso cuando pulseIn devuelve 0.
#define TRIG 7
#define ECO 8
#define LED 9

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECO, INPUT);
}

void loop() {
  digitalWrite(TRIG, HIGH);
  delayMicroseconds(15);
  digitalWrite(TRIG, LOW);
  float us = pulseIn(ECO, HIGH, 25000UL);
  if (us == 0) {
    Serial.println("fuera de rango");
    analogWrite(LED, 0);
  } else {
    float cm = us * 0.0343 / 2;
    float nivel = (50.0 - cm) / 40.0;
    if (nivel < 0) nivel = 0;
    if (nivel > 1) nivel = 1;
    analogWrite(LED, (int)(nivel * 255));
    Serial.print("Distancia: ");
    Serial.println(cm);
  }
  delay(120);
}
