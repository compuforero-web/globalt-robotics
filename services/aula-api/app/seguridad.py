"""Contraseñas (Argon2id), tokens aleatorios y huellas para guardar en la base de datos."""
import hashlib
import hmac
import secrets
import threading

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# Parámetros RFC 9106 (perfil de baja memoria): 64 MiB, 3 pasadas, 4 hilos.
_hasher = PasswordHasher(time_cost=3, memory_cost=64 * 1024, parallelism=4, hash_len=32, salt_len=16, type=Type.ID)
_HASH_FICTICIO = _hasher.hash('clave-ficticia-para-igualar-tiempos')
# Cada operación usa 64 MiB: se limita la concurrencia para que una ráfaga no agote la memoria.
_argon_simultaneos = threading.BoundedSemaphore(4)


def hash_clave(clave: str) -> str:
    with _argon_simultaneos:
        return _hasher.hash(clave)


def verificar_clave(hash_guardado: str | None, clave: str) -> bool:
    """Compara en tiempo similar exista o no el usuario (se usa un hash ficticio)."""
    try:
        with _argon_simultaneos:
            return _hasher.verify(hash_guardado or _HASH_FICTICIO, clave) and hash_guardado is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def necesita_rehash(hash_guardado: str) -> bool:
    return _hasher.check_needs_rehash(hash_guardado)


def token() -> str:
    return secrets.token_urlsafe(32)


def huella(valor: str) -> bytes:
    return hashlib.sha256(valor.encode()).digest()


def iguales(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
