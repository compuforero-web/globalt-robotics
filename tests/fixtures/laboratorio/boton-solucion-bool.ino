// Otra solución: variable bool, saludo al arrancar y texto en minúsculas con más palabras.
bool estabaPulsado = false;

void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("Listo");
}

void loop() {
  bool pulsado = !digitalRead(2);
  if (pulsado != estabaPulsado) {
    estabaPulsado = pulsado;
    digitalWrite(13, pulsado);
    if (pulsado) Serial.println("boton pulsado");
    else Serial.println("boton suelto");
  }
  delay(5);
}
