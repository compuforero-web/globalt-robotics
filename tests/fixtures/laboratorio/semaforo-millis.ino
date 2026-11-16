// Variante sin delay(): cambia de fase con millis() (también debe aprobar).
const int PINES[] = {2, 3, 4};
const unsigned long DURACION[] = {3000, 1000, 3000};
const char *NOMBRES[] = {"Luz verde", "Luz amarilla: precaución (amarillo)", "ROJO, alto"};
int fase = -1;
unsigned long inicio = 0;

void setup() {
  for (int i = 0; i < 3; i++) pinMode(PINES[i], OUTPUT);
  Serial.begin(9600);
  Serial.println("Semaforo listo");
}

void loop() {
  if (fase < 0 || millis() - inicio >= DURACION[fase]) {
    if (fase >= 0) digitalWrite(PINES[fase], LOW);
    fase = (fase + 1) % 3;
    digitalWrite(PINES[fase], HIGH);
    inicio = millis();
    Serial.println(NOMBRES[fase]);
  }
}
