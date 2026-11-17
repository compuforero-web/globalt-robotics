// Fallo: escalones bruscos de 64 cada 250 ms.
void setup() { }
void loop() {
  for (int v = 0; v <= 256; v += 64) { analogWrite(9, v > 255 ? 255 : v); delay(250); }
  for (int v = 192; v > 0; v -= 64) { analogWrite(9, v); delay(250); }
}
