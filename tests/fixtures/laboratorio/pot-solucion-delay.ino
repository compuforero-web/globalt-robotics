// Otra solución: divide entre 4 y reparte la espera en pasos de 10 ms para que el brillo responda a tiempo.
int contador = 0;

void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0);
  analogWrite(9, v / 4);
  if (contador == 0) Serial.println(v);
  contador = (contador + 1) % 25;
  delay(10);
}
