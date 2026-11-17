// Ejemplo: cuatro niveles fijos. Compara el valor con el % que mide el simulador.
const int LED = 9;
const int NIVELES[] = {0, 64, 128, 255};

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 4; i++) {
    analogWrite(LED, NIVELES[i]);
    Serial.print("Valor ");
    Serial.println(NIVELES[i]);
    delay(1500);
  }
}
