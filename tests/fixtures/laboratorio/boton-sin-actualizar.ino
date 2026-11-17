// Fallo: olvida actualizar la lectura anterior (repite el mensaje mientras está pulsado).
int anterior = HIGH;

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(2);
  digitalWrite(13, lectura == LOW ? HIGH : LOW);
  if (lectura != anterior) {
    Serial.println(lectura == LOW ? "Pulsado" : "Suelto");
    delay(20);
  }
}
