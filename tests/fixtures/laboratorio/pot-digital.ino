// Fallo: enciende o apaga D9 con un umbral en lugar de PWM.
const int POT = A0;
const int LED = 9;
unsigned long ultimo = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(POT);
  pinMode(LED, OUTPUT);
  digitalWrite(LED, lectura > 511 ? HIGH : LOW);
  if (millis() - ultimo >= 250) {
    ultimo += 250;
    Serial.print("Lectura: ");
    Serial.println(lectura);
  }
}
