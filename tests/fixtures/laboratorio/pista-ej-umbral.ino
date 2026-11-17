// Ejemplo de lectura: no mueve los motores ni resuelve el reto.
void setup() { Serial.begin(9600); pinMode(7, OUTPUT); pinMode(8, INPUT); }
void loop() {
  digitalWrite(7, LOW); delayMicroseconds(2);
  digitalWrite(7, HIGH); delayMicroseconds(10); digitalWrite(7, LOW);
  unsigned long eco = pulseIn(8, HIGH, 30000);
  if (!eco) Serial.println("Sin eco");
  else if (eco / 58 < 30) Serial.println("Cerca");
  else Serial.println("Lejos");
  delay(70);
}
