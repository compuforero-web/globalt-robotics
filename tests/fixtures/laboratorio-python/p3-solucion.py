def estado(v):
    if v >= 7.0:
        return "OK"
    elif v >= 6.4:
        return "BAJA"
    return "CRÍTICA"


def promedio(valores):
    if not valores:
        return 0.0
    return sum(valores) / len(valores)


def bajo_umbral(valores, umbral):
    resultado = []
    for v in valores:
        if v < umbral:
            resultado.append(v)
    return resultado


linea = input("Tensiones separadas por espacios: ")
valores = [float(x) for x in linea.split()]
if not valores:
    print("Sin lecturas")
else:
    print("Lecturas:", sorted(valores))
    print(f"Promedio: {promedio(valores):.2f}")
    print(f"Máxima: {max(valores)} | Mínima: {min(valores)}")
    print("Por debajo de 7.0:", bajo_umbral(valores, 7.0))
    print("Estados:", ", ".join([estado(v) for v in valores]))
