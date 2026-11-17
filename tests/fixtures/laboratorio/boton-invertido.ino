// Fallo: lógica sin invertir (LED encendido con el botón suelto).
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
  digitalWrite(LED, lectura);
  if (lectura != anterior) {
    Serial.println(lectura == LOW ? "Pulsado" : "Suelto");
    anterior = lectura;
  }
}
