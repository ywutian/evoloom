FROM python:3.12.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    BEAR_WORKSPACE=/workspace \
    HOME=/home/bear

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /bin/bash bear

WORKDIR /app
COPY requirements.lock.txt pyproject.toml README.md ./
RUN pip install --no-cache-dir -r requirements.lock.txt

COPY agents ./agents
RUN pip install --no-cache-dir --no-deps . \
    && mkdir -p /workspace /home/bear/.bear-code /home/bear/.bear \
    && chown -R bear:bear /workspace /home/bear

USER bear
WORKDIR /workspace

ENTRYPOINT ["bear-code"]
CMD ["--help"]
