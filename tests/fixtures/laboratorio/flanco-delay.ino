// Bloqueante: tras detectar el flanco espera con delay(50). Funciona con este guion (se acepta),
// aunque la lección recomienda millis() para no detener el programa.
int anterior = HIGH;
int pulsaciones = 0;
bool led = false;

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(2);
  if (anterior == HIGH && lectura == LOW) {
    pulsaciones++;
    led = !led;
    digitalWrite(13, led);
    Serial.print("Pulsaciones: ");
    Serial.println(pulsaciones);
    delay(50);
    lectura = digitalRead(2);
  }
  if (lectura != anterior) { delay(50); lectura = digitalRead(2); }
  anterior = lectura;
}
