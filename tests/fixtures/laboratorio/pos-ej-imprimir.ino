// Ejemplo: print escribe sin saltar de línea; println termina la línea.
void setup() {
  Serial.begin(9600);
  int grados = 45;
  Serial.print("Angulo: ");
  Serial.println(grados);
}

void loop() { }
