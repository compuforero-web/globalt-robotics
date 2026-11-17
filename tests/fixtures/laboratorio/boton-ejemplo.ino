// GLOBALT Robotics · Lección 4: leer un pulsador
// Pulsador entre D2 y GND (sin resistencia externa) y LED con 220 Ω en D13.

const int BOTON = 2;
const int LED = 13;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);   // resistencia interna: suelto = HIGH
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // Práctica: escribe el estado del botón cada 200 ms.
  int lectura = digitalRead(BOTON);
  Serial.print("D2 = ");
  Serial.println(lectura);
  delay(200);
}
