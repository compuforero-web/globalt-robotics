const int LED = 13;
void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
  for (int i = 1; i <= 5; i++) {
    Serial.print("Latido ");
    Serial.println(i);
  }
}
void loop() {
  digitalWrite(LED, HIGH);
  delay(200);
  digitalWrite(LED, LOW);
  delay(800);
}
