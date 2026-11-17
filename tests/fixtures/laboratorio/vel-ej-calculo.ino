// Ejemplo: para recorrer N pasos en T milisegundos,
// cada paso dura T / N. Calcúlalo con decimales.
void setup() {
  Serial.begin(9600);
  float total = 3000;    // ms
  int pasos = 100;
  Serial.print("Cada paso: ");
  Serial.print(total / pasos);
  Serial.println(" ms");
}

void loop() { }
