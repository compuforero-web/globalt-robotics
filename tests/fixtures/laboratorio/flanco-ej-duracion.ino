// Ejemplo: guarda el instante del flanco de bajada y, al soltar, escribe la duración.
// Sin antirrebote, cada rebote también cuenta como flanco: observa los valores diminutos.
const int BOTON = 2;
int anterior = HIGH;
unsigned long inicio = 0;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  if (anterior == HIGH && lectura == LOW) inicio = millis();
  if (anterior == LOW && lectura == HIGH) {
    Serial.print("Pulsado durante ");
    Serial.print(millis() - inicio);
    Serial.println(" ms");
  }
  anterior = lectura;
}
