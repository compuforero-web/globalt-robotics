// Ejemplo: un parámetro hace que la misma función sirva para varios casos.
void repetir(char simbolo, int veces) {
  for (int i = 0; i < veces; i++) {
    Serial.print(simbolo);
  }
  Serial.println();
}

void setup() {
  Serial.begin(9600);
  repetir('*', 3);
  repetir('-', 10);
}

void loop() { }
