// Ejemplo: recorre la tabla del puente H, 1 segundo por combinación.
// Fíjate en el aviso del simulador al pasar de adelante a atrás sin parar.
void setup() {
  Serial.begin(9600);
  pinMode(7, OUTPUT);
  pinMode(8, OUTPUT);
}

void probar(int a, int b) {
  digitalWrite(7, a);
  digitalWrite(8, b);
  Serial.print("IN1=");
  Serial.print(a);
  Serial.print(" IN2=");
  Serial.println(b);
  delay(1000);
}

void loop() {
  probar(HIGH, LOW);
  probar(LOW, HIGH);
  probar(LOW, LOW);
  probar(HIGH, HIGH);
}
