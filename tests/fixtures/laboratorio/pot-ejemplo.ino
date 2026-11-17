// GLOBALT Robotics · Lección 6: leer un potenciómetro
// Potenciómetro de 10 kΩ: extremos a 5 V y GND, cursor en A0. LED con 220 Ω en D9.

const int POT = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  // Práctica: mueve el potenciómetro y mira cómo cambia la lectura.
  int lectura = analogRead(POT);   // 0 … 1023
  Serial.print("A0 = ");
  Serial.println(lectura);
  delay(500);
}
