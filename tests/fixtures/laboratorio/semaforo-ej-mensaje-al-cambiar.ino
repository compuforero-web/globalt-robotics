// Ejemplo: la línea se escribe en el mismo instante en que cambia el LED.
const int LED = 2;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED, HIGH);
  Serial.println("encendido");   // justo después del cambio, antes de esperar
  delay(500);
  digitalWrite(LED, LOW);
  Serial.println("apagado");
  delay(500);
}
