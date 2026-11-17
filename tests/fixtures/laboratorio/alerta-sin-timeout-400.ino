// Variante válida: pulseIn sin tiempo máximo, pero trata como «Fuera de rango» lo que pasa de 400 cm.
// Con el HC-SR04 (ECHO baja a los 38 ms sin eco) la espera nunca supera unos 39 ms.
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
  long cm = pulseIn(ECO, HIGH) / 58;
  if (cm == 0 || cm > 400) {
    analogWrite(LED, 0);
    Serial.println("Fuera de rango");
  } else {
    analogWrite(LED, constrain(map(cm, 50, 10, 0, 255), 0, 255));
  }
  delay(100);
}
