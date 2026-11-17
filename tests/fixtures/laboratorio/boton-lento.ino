// Fallo: delay(100) en loop(): el LED responde tarde.
const int BOTON = 2;
const int LED = 13;
int anterior = HIGH;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  digitalWrite(LED, lectura == LOW ? HIGH : LOW);
  if (lectura != anterior) {
    Serial.println(lectura == LOW ? "Pulsado" : "Suelto");
    anterior = lectura;
  }
  delay(100);
}
