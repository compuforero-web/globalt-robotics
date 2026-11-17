// Ejemplo: D2 como INPUT, sin resistencia. Con el botón suelto, mira qué lee.
void setup() {
  pinMode(2, INPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println(digitalRead(2));
  delay(100);
}
