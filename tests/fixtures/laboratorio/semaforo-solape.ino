// Fallo: enciende el siguiente LED 100 ms antes de apagar el anterior.
void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); Serial.begin(9600); }
void loop() {
  digitalWrite(2, HIGH); Serial.println("verde"); delay(2900);
  digitalWrite(3, HIGH); Serial.println("amarillo"); delay(100); digitalWrite(2, LOW); delay(900);
  digitalWrite(4, HIGH); Serial.println("rojo"); delay(100); digitalWrite(3, LOW); delay(2900);
  digitalWrite(4, LOW);
}
