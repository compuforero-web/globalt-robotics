// Ejemplo: map() también convierte al revés (más grande → más pequeño),
// y constrain() recorta un valor para que no se salga de un rango.
void setup() {
  Serial.begin(9600);
  for (int x = -20; x <= 120; x += 35) {
    int recortado = constrain(x, 0, 100);
    Serial.print(x);
    Serial.print(" -> ");
    Serial.print(recortado);
    Serial.print(" -> ");
    Serial.println(map(recortado, 0, 100, 100, 0));
  }
}

void loop() { }
