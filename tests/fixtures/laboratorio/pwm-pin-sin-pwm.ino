// Fallo: la rampa va al pin 8, que no tiene PWM.
void setup() { pinMode(8, OUTPUT); }
void loop() {
  for (int v = 0; v <= 255; v++) { analogWrite(8, v); delay(4); }
  for (int v = 255; v >= 0; v--) { analogWrite(8, v); delay(4); }
}
