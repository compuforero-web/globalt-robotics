// Fallo: orden verde → rojo → amarillo.
void luz(int pin, const char *t, int ms) { digitalWrite(pin, HIGH); Serial.println(t); delay(ms); digitalWrite(pin, LOW); }
void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); Serial.begin(9600); }
void loop() { luz(2, "verde", 3000); luz(4, "rojo", 3000); luz(3, "amarillo", 1000); }
