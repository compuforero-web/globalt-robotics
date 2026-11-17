// GLOBALT Robotics · Lección 10: velocidad con ENA
// IN1 en D7, IN2 en D8 y ENA en D9 (se quita el puente de ENA).
// Práctica: observa el motor con ENA a 60, 120 y 255. ¿Gira a 60?

const int IN1 = 7;
const int IN2 = 8;
const int ENA = 9;

void setup() {
  Serial.begin(9600);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  digitalWrite(IN1, HIGH);   // sentido: adelante
  digitalWrite(IN2, LOW);
}

void probar(int valor) {
  Serial.print("ENA = ");
  Serial.println(valor);
  analogWrite(ENA, valor);
  delay(1500);
}

void loop() {
  probar(60);
  probar(120);
  probar(255);
  probar(0);
}
