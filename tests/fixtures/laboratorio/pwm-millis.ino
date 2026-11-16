// Variante con millis() y mensajes por serie (también debe aprobar: la serie no es requisito).
const int LED = 9;
void setup() { Serial.begin(9600); Serial.println("Respirando"); }
void loop() {
  unsigned long t = millis() % 2000;                 // un ciclo cada 2 s
  int v = t < 1000 ? map(t, 0, 999, 0, 255) : map(t, 1000, 1999, 255, 0);
  analogWrite(LED, v);
  if (t % 500 == 0) { Serial.print("Brillo: "); Serial.println(v); delay(1); }
}
