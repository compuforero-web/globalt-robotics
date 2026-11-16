// GLOBALT Robotics · Lección 3: brillo con PWM
// LED con resistencia de 220 Ω en D9, un pin con PWM (marcado con ~ en la placa).

const int LED = 9;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  analogWrite(LED, 255);   // 100 %: encendido todo el tiempo
  delay(1000);
  analogWrite(LED, 64);    // 25 % del tiempo encendido
  delay(1000);
  analogWrite(LED, 0);     // 0 %: apagado
  delay(1000);
}
