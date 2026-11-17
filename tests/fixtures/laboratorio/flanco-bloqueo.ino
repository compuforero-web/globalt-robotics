// Otra solución: responde al primer flanco e ignora cualquier cambio durante 40 ms (bloqueo).
int anterior = HIGH;
unsigned long bloqueo = 0;
int cuenta = 0;
bool encendido = false;

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Pulsaciones: 0");
}

void loop() {
  int lectura = digitalRead(2);
  if (lectura != anterior) {
    if (millis() - bloqueo >= 40) {
      if (lectura == LOW) {
        cuenta++;
        encendido = !encendido;
        digitalWrite(13, encendido);
        Serial.print("Pulsaciones: ");
        Serial.println(cuenta);
      }
    }
    bloqueo = millis();
    anterior = lectura;
  }
}
