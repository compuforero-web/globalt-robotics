// Referencia de prueba: estados y lectura periódica, no se muestra en la lección.
const int IN1=2, IN2=4, IN3=10, IN4=11, ENA=5, ENB=6;
int estado=0;
unsigned long inicio=0, medida=0;
void motores(int a, int b) {
  digitalWrite(IN1,a>0); digitalWrite(IN2,a<0);
  digitalWrite(IN3,b>0); digitalWrite(IN4,b<0);
  analogWrite(ENA,a==0?255:180); analogWrite(ENB,b==0?255:180);
}
void setup() {
  Serial.begin(9600);
  pinMode(7,OUTPUT); pinMode(8,INPUT);
  pinMode(IN1,OUTPUT); pinMode(IN2,OUTPUT);
  pinMode(IN3,OUTPUT); pinMode(IN4,OUTPUT);
  motores(0,0);
}
void loop() {
  unsigned long ahora=millis();
  if(ahora-medida>=210) {
    medida=ahora;
    digitalWrite(7,LOW); delayMicroseconds(2);
    digitalWrite(7,HIGH); delayMicroseconds(10); digitalWrite(7,LOW);
    unsigned long eco=pulseIn(8,HIGH,30000);
    int cm=eco/58;
    if(eco==0) { estado=4; motores(0,0); }
    else if(estado==4) { estado=0; }
    if(eco!=0) {
      if(estado==0 && cm<=25) { estado=1; inicio=millis(); motores(0,0); }
      if(estado==3 && cm>40) estado=0;
      if(estado==0) motores(1,1);
    }
    Serial.print("Distancia: "); Serial.println(cm);
  }
  ahora=millis();
  if(estado==1 && ahora-inicio>=30) { estado=2; inicio=ahora; motores(-1,-1); }
  if(estado==2 && ahora-inicio>=400) { estado=3; motores(1,-1); }
}
