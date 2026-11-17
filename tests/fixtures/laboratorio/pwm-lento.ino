// Fallo: cada respiración dura unos 5 s.
void setup() { }
void loop() {
  for (int v = 0; v <= 255; v++) { analogWrite(9, v); delay(10); }
  for (int v = 255; v >= 0; v--) { analogWrite(9, v); delay(10); }
}
