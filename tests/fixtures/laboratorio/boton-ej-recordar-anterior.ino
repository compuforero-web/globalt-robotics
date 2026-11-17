// Ejemplo: guarda el valor anterior y escribe solo cuando cambia.
// Aquí lo que cambia es el segundo actual (millis() / 1000), no un botón.
unsigned long anterior = 0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  unsigned long ahora = millis() / 1000;
  if (ahora != anterior) {
    Serial.print("Nuevo segundo: ");
    Serial.println(ahora);
    anterior = ahora;
  }
}
