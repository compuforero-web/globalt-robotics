# API del aula (desarrollo local). La instalación de producción la define la IA principal.
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /opt/aula
COPY requirements.lock .
RUN pip install --no-deps -r requirements.lock \
 && useradd --system --uid 10002 --no-create-home --shell /usr/sbin/nologin aula
COPY app ./app
COPY migrations ./migrations
USER 10002:10002
EXPOSE 8000
CMD ["sh", "-c", "python -m app.migraciones && exec uvicorn app.main:crear_app --factory --host 0.0.0.0 --port 8000 --proxy-headers"]
