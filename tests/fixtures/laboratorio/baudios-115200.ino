const int LED = 13;
int latidos = 0;
void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  latidos++;
  digitalWrite(LED, HIGH);
  Serial.print("Latido ");
  Serial.println(latidos);
  delay(200);
  digitalWrite(LED, LOW);
  delay(800);
}
