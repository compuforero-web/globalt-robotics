# Error típico: minutos a partir de las horas ya redondeadas.
capacidad = int(input("Capacidad en mAh: "))
consumo = int(input("Consumo en mA: "))
horas = round(capacidad / consumo, 2)
print(f"Autonomía: {horas:.2f} h")
print(f"Equivale a {int(horas)} h {int((horas - int(horas)) * 60)} min")
print(f"Usable (80 %): {horas * 0.8:.2f} h")
