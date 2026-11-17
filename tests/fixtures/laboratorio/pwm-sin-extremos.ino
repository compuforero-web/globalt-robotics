// Fallo: el brillo va de 40 a 210, sin llegar a los extremos.
void setup() { }
void loop() {
  for (int v = 40; v <= 210; v++) { analogWrite(9, v); delay(6); }
  for (int v = 210; v >= 40; v--) { analogWrite(9, v); delay(6); }
}
