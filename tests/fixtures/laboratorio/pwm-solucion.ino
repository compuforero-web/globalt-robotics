// Solución de referencia del reto «LED que respira» (pruebas).
const int LED = 9;
void setup() { pinMode(LED, OUTPUT); }
void loop() {
  for (int v = 0; v <= 255; v++) { analogWrite(LED, v); delay(4); }
  for (int v = 255; v >= 0; v--) { analogWrite(LED, v); delay(4); }
}
