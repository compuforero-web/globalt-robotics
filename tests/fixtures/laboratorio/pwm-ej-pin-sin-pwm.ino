// Ejemplo: D8 no tiene PWM. Observa su indicador: solo se enciende o se apaga.
void setup() {
  pinMode(8, OUTPUT);
}

void loop() {
  analogWrite(8, 100);   // menos de 128 → apagado
  delay(1000);
  analogWrite(8, 200);   // 128 o más → encendido
  delay(1000);
}
