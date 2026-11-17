// Ejemplo: parpadeo con millis(). loop() nunca se detiene,
// así que podría leer un botón a la vez.
const int LED = 13;
unsigned long ultimoCambio = 0;
int estado = LOW;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  if (millis() - ultimoCambio >= 300) {
    ultimoCambio = millis();
    estado = (estado == LOW) ? HIGH : LOW;
    digitalWrite(LED, estado);
  }
}
