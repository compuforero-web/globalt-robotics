// Ejemplo: un for repite un bloque cambiando una variable.
// Aquí cuenta de 0 a 100 de 20 en 20 y espera entre pasos.
void setup() {
  Serial.begin(9600);
  for (int v = 0; v <= 100; v += 20) {
    Serial.println(v);
    delay(100);
  }
  Serial.println("Fin");
}

void loop() { }
