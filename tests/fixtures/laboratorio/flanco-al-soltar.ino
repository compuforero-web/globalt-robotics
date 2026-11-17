// Fallo: antirrebote correcto, pero cuenta al soltar (flanco de subida).
const int BOTON = 2;
const int LED = 13;
const unsigned long ESPERA = 30;
int lecturaAnterior = HIGH;
int estado = HIGH;
unsigned long ultimoCambio = 0;
int pulsaciones = 0;
int led = LOW;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  if (lectura != lecturaAnterior) ultimoCambio = millis();
  lecturaAnterior = lectura;
  if (millis() - ultimoCambio >= ESPERA && lectura != estado) {
    estado = lectura;
    if (estado == HIGH) {
      pulsaciones++;
      led = (led == LOW) ? HIGH : LOW;
      digitalWrite(LED, led);
      Serial.print("Pulsaciones: ");
      Serial.println(pulsaciones);
    }
  }
}
