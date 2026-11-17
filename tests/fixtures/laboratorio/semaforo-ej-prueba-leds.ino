// Ejemplo: enciende cada LED un momento, de uno en uno, y lo anuncia.
const int PINES[] = {4, 3, 2};               // rojo, amarillo, verde
const char *NOMBRES[] = {"rojo", "amarillo", "verde"};

void setup() {
  for (int i = 0; i < 3; i++) pinMode(PINES[i], OUTPUT);
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 3; i++) {
    Serial.print("Probando ");
    Serial.println(NOMBRES[i]);
    digitalWrite(PINES[i], HIGH);
    delay(300);
    digitalWrite(PINES[i], LOW);
  }
  delay(700);
}
