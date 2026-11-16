// Solución de referencia del reto «Semáforo» (pruebas).
const int VERDE = 2;
const int AMARILLO = 3;
const int ROJO = 4;

void fase(int pin, const char *nombre, unsigned long ms) {
  digitalWrite(VERDE, LOW);
  digitalWrite(AMARILLO, LOW);
  digitalWrite(ROJO, LOW);
  digitalWrite(pin, HIGH);
  Serial.println(nombre);
  delay(ms);
}

void setup() {
  pinMode(VERDE, OUTPUT);
  pinMode(AMARILLO, OUTPUT);
  pinMode(ROJO, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  fase(VERDE, "Verde", 3000);
  fase(AMARILLO, "Amarillo", 1000);
  fase(ROJO, "Rojo", 3000);
}
