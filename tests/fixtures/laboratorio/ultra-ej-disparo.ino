// Ejemplo: el HC-SR04 ignora un pulso TRIG de menos de 10 microsegundos.
// Mira en el circuito «Último pulso TRIG» y lo que devuelve pulseIn.
void setup() {
  Serial.begin(9600);
  pinMode(7, OUTPUT);
  pinMode(8, INPUT);
}

void loop() {
  digitalWrite(7, HIGH);
  delayMicroseconds(2);          // demasiado corto
  digitalWrite(7, LOW);
  Serial.println(pulseIn(8, HIGH));
  delay(200);
}
