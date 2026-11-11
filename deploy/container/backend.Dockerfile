# Use a reviewed immutable python:3.12-slim digest, not a local hireos image.
# Build context is an isolated, reviewed backend source snapshot.
ARG PYTHON_IMAGE
FROM ${PYTHON_IMAGE}
ARG SOURCE_REVISION
ARG SOURCE_FINGERPRINT
RUN test "${#SOURCE_REVISION}" -eq 40 && test "${#SOURCE_FINGERPRINT}" -eq 64 \
    && case "$SOURCE_REVISION$SOURCE_FINGERPRINT" in *[!0-9a-f]*) exit 2 ;; esac
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HOME=/tmp
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev tesseract-ocr tesseract-ocr-deu poppler-utils \
    libgl1 libglib2.0-0 libpango-1.0-0 libpangocairo-1.0-0 libcairo2 \
    libgdk-pixbuf-2.0-0 libffi-dev libxml2 libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml constraints-py312.txt ./
COPY app ./app
# Core login/HR/OCR needs no torch. Missing embeddings report unavailable, never fake vectors.
ARG INCLUDE_EMBEDDINGS=false
RUN case "$INCLUDE_EMBEDDINGS" in \
      false) pip install --no-cache-dir -c constraints-py312.txt . ;; \
      true) pip install --no-cache-dir torch==2.14.0+cpu --index-url https://download.pytorch.org/whl/cpu \
        && pip install --no-cache-dir -c constraints-py312.txt '.[embeddings]' ;; \
      *) exit 2 ;; \
    esac
COPY alembic ./alembic
COPY alembic.ini ./alembic.ini
RUN groupadd --gid 10001 palmscout && useradd --uid 10001 --gid 10001 --no-create-home palmscout \
    && mkdir -p /data/uploads /app/static && chown 10001:10001 /data/uploads
LABEL org.opencontainers.image.title="palmscout API" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      io.palmscout.source-fingerprint="${SOURCE_FINGERPRINT}" \
      io.palmscout.embeddings-included="${INCLUDE_EMBEDDINGS}"
USER 10001:10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
