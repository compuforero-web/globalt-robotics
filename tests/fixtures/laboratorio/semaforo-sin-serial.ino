// Fallo: luces correctas, sin monitor serie.
void luz(int pin, int ms) { digitalWrite(pin, HIGH); delay(ms); digitalWrite(pin, LOW); }
void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); }
void loop() { luz(2, 3000); luz(3, 1000); luz(4, 3000); }
