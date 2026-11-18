n = int(input("¿Cuántas lecturas? "))
if n <= 0:
    print("Sin lecturas")
else:
    criticas = 0
    for i in range(1, n + 1):
        v = float(input(f"Lectura {i}: "))
        if v >= 7.0:
            estado = "OK"
        elif v >= 6.4:
            estado = "BAJA"
        else:
            estado = "CRÍTICA"
            criticas += 1
        print(f"Lectura {i}: {v:.1f} V -> {estado}")
    print("Críticas:", criticas)
    print("Cargar antes de competir" if criticas else "Lista para competir")
