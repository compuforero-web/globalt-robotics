"""Envío de correos del aula (verificación, recuperación y aviso de cuenta existente).

Los enlaces llevan el token en el fragmento (#...): el navegador no lo envía al servidor, así que no aparece en
registros de nginx ni de la API. Este módulo NUNCA registra el contenido, el enlace ni la clave SMTP; ante un
fallo solo anota el tipo de correo y la clase del error.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formatdate, make_msgid
from urllib.parse import quote

registro = logging.getLogger('aula.correo')
FIRMA = '\n\n— GLOBALT ROBOTICS\nEste mensaje se envió automáticamente; no respondas a esta dirección.\n'


class ErrorEnvio(Exception):
    """No se pudo entregar el correo al servidor SMTP."""


def listo(config) -> bool:
    """Configuración mínima para enviar enlaces."""
    return (config.correo_modo == 'smtp' and bool(config.smtp_host) and bool(config.correo_remitente)
            and config.url_publica.startswith(('https://', 'http://')) and config.smtp_tls in ('starttls', 'ssl', 'ninguno'))


def problemas_produccion(config) -> list[str]:
    """Motivos por los que esta configuración de correo no sirve para el registro real."""
    faltan = []
    if not listo(config):
        faltan.append('correo sin configurar (AULA_CORREO_MODO, AULA_SMTP_HOST, AULA_CORREO_REMITENTE, AULA_URL_PUBLICA)')
    if config.smtp_tls == 'ninguno':
        faltan.append('AULA_SMTP_TLS=ninguno solo vale para el buzón de pruebas local')
    if not config.url_publica.startswith('https://'):
        faltan.append('AULA_URL_PUBLICA debe usar https://')
    if config.permitir_textos_prueba:
        faltan.append('AULA_PERMITIR_TEXTOS_PRUEBA=true solo vale para pruebas')
    return faltan


def pagina(config, curso: str | None = None) -> str:
    """Dirección del aula, conservando el curso elegido."""
    return f'{config.url_publica}/aula/' + (f'?curso={quote(curso)}' if curso else '')


def enlace(config, accion: str, token: str, curso: str | None = None) -> str:
    return f'{pagina(config, curso)}#{accion}={token}'


def enviar(config, destino: str, asunto: str, texto: str, tipo: str) -> None:
    """Entrega síncrona al servidor SMTP configurado. Lanza ErrorEnvio si falla."""
    if not listo(config):
        raise ErrorEnvio('correo no configurado')
    mensaje = EmailMessage()
    mensaje['From'] = config.correo_remitente
    mensaje['To'] = destino
    mensaje['Subject'] = asunto
    mensaje['Date'] = formatdate(localtime=False)
    mensaje['Message-ID'] = make_msgid(domain=config.correo_remitente.rsplit('@', 1)[-1].strip('> ') or None)
    mensaje['Auto-Submitted'] = 'auto-generated'
    mensaje.set_content(texto + FIRMA)
    try:
        if config.smtp_tls == 'ssl':
            smtp = smtplib.SMTP_SSL(config.smtp_host, config.smtp_puerto, timeout=15,
                                    context=ssl.create_default_context())
        else:
            smtp = smtplib.SMTP(config.smtp_host, config.smtp_puerto, timeout=15)
        with smtp:
            smtp.set_debuglevel(0)   # nunca volcar la conversación (contendría el enlace)
            if config.smtp_tls == 'starttls':
                smtp.starttls(context=ssl.create_default_context())
            if config.smtp_usuario:
                smtp.login(config.smtp_usuario, config.smtp_clave)
            smtp.send_message(mensaje)
    except (OSError, smtplib.SMTPException) as fallo:
        registro.warning('No se pudo enviar el correo de %s (%s).', tipo, type(fallo).__name__)
        raise ErrorEnvio(type(fallo).__name__) from None


# ---------- Textos (operativos, no legales) ----------
def texto_verificacion(nombre, url, horas):
    return (f'Hola, {nombre}:\n\nPara terminar de crear tu cuenta del Aula de GLOBALT ROBOTICS, abre este enlace y '
            f'escribe la contraseña que elegiste:\n\n{url}\n\nEl enlace sirve una sola vez y vence en {horas} horas. '
            'Si no fuiste tú, ignora este mensaje: sin abrir el enlace no se crea ninguna cuenta.')


def texto_cuenta_existente(url):
    return ('Hola:\n\nAlguien intentó crear una cuenta del Aula de GLOBALT ROBOTICS con esta dirección, pero ya '
            f'tiene una cuenta. Si fuiste tú, inicia sesión aquí:\n\n{url}\n\nSi no recuerdas la contraseña, usa '
            '«¿Olvidaste tu contraseña?» en esa página. Si no fuiste tú, ignora este mensaje: tu cuenta no cambió.')


def texto_recuperacion(url, minutos):
    return ('Hola:\n\nRecibimos una solicitud para cambiar la contraseña de tu cuenta del Aula de GLOBALT ROBOTICS. '
            f'Abre este enlace para elegir una nueva:\n\n{url}\n\nEl enlace sirve una sola vez y vence en {minutos} '
            'minutos. Al cambiarla se cierran las sesiones abiertas. Si no lo pediste, ignora este mensaje: tu '
            'contraseña no cambia.')
