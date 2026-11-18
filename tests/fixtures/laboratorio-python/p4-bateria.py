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
