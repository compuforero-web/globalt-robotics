// Mide el PWM: cada 200 ms cambia el valor en D9, D5 y D3 (0, 1, 64, 128, 191, 254, 255).
const int V[] = {0, 1, 64, 128, 191, 254, 255};
void setup() { }
void loop() { for (int i = 0; i < 7; i++) { analogWrite(9, V[i]); analogWrite(5, V[i]); analogWrite(3, V[i]); delay(200); } }
