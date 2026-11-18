capacidad = int(input("Capacidad en mAh: "))
consumo = int(input("Consumo en mA: "))
horas = capacidad / consumo
total = capacidad * 60 // consumo
print(f"Autonomía: {horas:.2f} h")
print(f"Equivale a {total // 60} h {total % 60} min")
print(f"Usable (80 %): {horas * 0.8:.2f} h")
