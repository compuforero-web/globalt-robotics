// Fallo: todo en un loop con delay(250): el brillo tarda hasta 250 ms en seguir al potenciómetro.
void setup() {
  Serial.begin(9600);
}

void loop() {
  int lectura = analogRead(A0);
  analogWrite(9, map(lectura, 0, 1023, 0, 255));
  Serial.println(lectura);
  delay(250);
}
