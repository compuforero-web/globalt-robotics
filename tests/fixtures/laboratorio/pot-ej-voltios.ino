// Ejemplo: cada cuenta del ADC vale unos 5 V / 1024 ≈ 4,9 mV.
void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);
  float voltios = lectura * 5.0 / 1024.0;
  Serial.print(lectura);
  Serial.print(" cuentas = ");
  Serial.print(voltios);
  Serial.println(" V");
  delay(400);
}
