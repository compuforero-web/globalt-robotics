// GLOBALT Robotics · Lección 1: LED intermitente y monitor serie
// El LED externo está en el pin digital 13 (D13) con una resistencia de 220 Ω.

const int PIN_LED = 13;        // pin donde conectamos el LED

void setup() {
  pinMode(PIN_LED, OUTPUT);    // D13 entregará voltaje: lo configuramos como salida
  Serial.begin(9600);          // abre el monitor serie a 9600 baudios
  Serial.println("Hola, soy tu Arduino Nano");
}

void loop() {
  digitalWrite(PIN_LED, HIGH); // 5 V en D13: el LED se enciende
  Serial.println("LED encendido");
  delay(1000);                 // espera 1000 ms (1 segundo)

  digitalWrite(PIN_LED, LOW);  // 0 V en D13: el LED se apaga
  Serial.println("LED apagado");
  delay(1000);
}
