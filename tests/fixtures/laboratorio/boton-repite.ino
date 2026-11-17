// Fallo: escribe el estado cada 100 ms aunque no cambie.
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(2);
  digitalWrite(13, lectura == LOW);
  Serial.println(lectura == LOW ? "Pulsado" : "Suelto");
  delay(100);
}
