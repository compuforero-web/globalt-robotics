// Fallo: la rampa va a D10 (tiene PWM, pero el LED está en D9).
void setup() { }
void loop() {
  for (int v = 0; v <= 255; v++) { analogWrite(10, v); delay(4); }
  for (int v = 255; v >= 0; v--) { analogWrite(10, v); delay(4); }
}
