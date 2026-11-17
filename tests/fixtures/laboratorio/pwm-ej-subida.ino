// Ejemplo: el brillo sube poco a poco y vuelve a 0 de golpe.
const int LED = 9;

void setup() { }

void loop() {
  for (int v = 0; v <= 255; v += 5) {
    analogWrite(LED, v);
    delay(20);
  }
  delay(500);
}
