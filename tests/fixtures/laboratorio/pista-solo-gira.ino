// Referencia de prueba: estados y lectura periódica, no se muestra en la lección.
const int IN1=2, IN2=4, IN3=10, IN4=11, ENA=5, ENB=6;
int estado=0;
unsigned long despejado=0;
unsigned long inicio=0, medida=0;
void motores(int a, int b) {
  digitalWrite(IN1,a>0); digitalWrite(IN2,a<0);
  digitalWrite(IN3,b>0); digitalWrite(IN4,b<0);
  analogWrite(ENA,a==0?255:140); analogWrite(ENB,b==0?255:140);
}
void setup() {
  Serial.begin(9600);
  pinMode(7,OUTPUT); pinMode(8,INPUT);
  pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT);
  pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT);
  motores(0,0);
}
void loop() {
 digitalWrite(7,LOW);delayMicroseconds(2);digitalWrite(7,HIGH);delayMicroseconds(10);digitalWrite(7,LOW);
 pulseIn(8,HIGH,30000);
 motores(1,-1);
 delay(75);
}
