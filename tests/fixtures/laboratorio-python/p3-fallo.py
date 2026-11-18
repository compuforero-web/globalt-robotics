# Error típico: bajo_umbral modifica la lista recibida.
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
    for v in list(valores):
        if v >= umbral:
            valores.remove(v)
    return valores


linea = input()
valores = [float(x) for x in linea.split()]
if not valores:
    print("Sin lecturas")
else:
    print("Lecturas:", sorted(valores))
    print(f"Promedio: {promedio(valores):.2f}")
    print(f"Máxima: {max(valores)} | Mínima: {min(valores)}")
    print("Por debajo de 7.0:", bajo_umbral(list(valores), 7.0))
    print("Estados:", ", ".join([estado(v) for v in valores]))
