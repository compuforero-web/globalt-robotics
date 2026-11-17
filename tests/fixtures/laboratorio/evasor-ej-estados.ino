// Ejemplo independiente: dos estados de un LED, no controla el evasor.
bool encendido = false;
unsigned long cambio = 0;
void setup() { pinMode(13, OUTPUT); }
void loop() {
  unsigned long ahora = millis();
  if (ahora - cambio >= 400) {
    cambio = ahora;
    encendido = !encendido;
    digitalWrite(13, encendido);
  }
}
