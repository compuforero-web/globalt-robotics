// Ejemplo: if / else if / else elige una sola rama, la primera que se cumple.
// No usa el sensor: clasifica tres distancias de prueba.
void setup() {
  Serial.begin(9600);
  int pruebas[] = {5, 25, 60};
  for (int i = 0; i < 3; i++) {
    int d = pruebas[i];
    Serial.print(d);
    if (d < 15) {
      Serial.println(" cm: muy cerca");
    } else if (d <= 40) {
      Serial.println(" cm: a media distancia");
    } else {
      Serial.println(" cm: lejos");
    }
  }
}

void loop() { }
