// GLOBALT Robotics · Lección 5: contar pulsaciones
// Pulsador entre D2 y GND (INPUT_PULLUP) y LED con 220 Ω en D13.
// Práctica: este contador detecta el flanco, pero aún no filtra el rebote.

const int BOTON = 2;
const int LED = 13;
int anterior = HIGH;
int pulsaciones = 0;

void setup() {
  pinMode(BOTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int lectura = digitalRead(BOTON);
  if (anterior == HIGH && lectura == LOW) {   // flanco: de suelto a pulsado
    pulsaciones++;
    Serial.print("Contadas: ");
    Serial.println(pulsaciones);
  }
  anterior = lectura;
}
