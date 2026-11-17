// Fallo: detecta el flanco y alterna el LED, pero sin antirrebote.
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
  }
  anterior = lectura;
}
