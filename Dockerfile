FROM python:3.15.0-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    EVOLOOM_WORKSPACE=/workspace \
    HOME=/home/evoloom

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /bin/bash evoloom

WORKDIR /app
COPY requirements.lock.txt pyproject.toml README.md LICENSE THIRD_PARTY_NOTICES.md ./
COPY LICENSES ./LICENSES
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY agents ./agents
RUN pip install --no-cache-dir --no-deps . \
    && mkdir -p /workspace /home/evoloom/.evoloom \
    && chown -R evoloom:evoloom /workspace /home/evoloom

USER evoloom
WORKDIR /workspace

ENTRYPOINT ["evoloom"]
CMD ["--help"]
