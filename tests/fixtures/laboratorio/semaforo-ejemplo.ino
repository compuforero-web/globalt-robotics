// GLOBALT Robotics · Lección 2: semáforo en la protoboard
// LED verde en D2, amarillo en D3 y rojo en D4, cada uno con su resistencia de 220 Ω.

const int LED_VERDE = 2;
const int LED_AMARILLO = 3;
const int LED_ROJO = 4;

void setup() {
  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_AMARILLO, OUTPUT);
  pinMode(LED_ROJO, OUTPUT);
  Serial.begin(9600);
  Serial.println("Semaforo listo");
}

void loop() {
  // Por ahora solo se enciende el verde. Completa el ciclo del semáforo.
  digitalWrite(LED_VERDE, HIGH);
  Serial.println("Verde");
  delay(3000);
  digitalWrite(LED_VERDE, LOW);
  delay(1000);
}
