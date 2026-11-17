// Ejemplo: tiempo de ida y vuelta del sonido (343 m/s = 0,0343 cm por microsegundo).
// No usa el sensor: solo hace las cuentas.
void setup() {
  Serial.begin(9600);
  int distancias[] = {10, 50, 100};
  for (int i = 0; i < 3; i++) {
    float ida = distancias[i] / 0.0343;     // microsegundos hasta el obstáculo
    Serial.print(distancias[i]);
    Serial.print(" cm -> ");
    Serial.print(2 * ida);                   // ida y vuelta
    Serial.println(" us");
  }
}

void loop() { }
