// Ejemplo: map() pasa un número de una escala a otra.
// Aquí convierte de 0–1023 a 0–100 (un porcentaje), sin usar el LED.
void setup() {
  Serial.begin(9600);
  for (int x = 0; x <= 1023; x += 341) {
    Serial.print(x);
    Serial.print(" -> ");
    Serial.print(map(x, 0, 1023, 0, 100));
    Serial.println(" %");
  }
}

void loop() { }
