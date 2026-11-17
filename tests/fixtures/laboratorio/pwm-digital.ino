// Fallo: PWM hecho a mano con digitalWrite a ~100 Hz.
void setup() { pinMode(9, OUTPUT); }
void pulso(int v) { digitalWrite(9, HIGH); delayMicroseconds(v * 39); digitalWrite(9, LOW); delayMicroseconds((255 - v) * 39); }
void loop() {
  for (int v = 0; v <= 255; v += 2) pulso(v);
  for (int v = 255; v >= 0; v -= 2) pulso(v);
}
