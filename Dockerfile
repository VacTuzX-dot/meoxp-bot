FROM python:3.11-slim

# Install ffmpeg for music playback and docker-cli for server status
RUN apt-get update && apt-get install -y \
    ffmpeg \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

CMD ["python", "main.py"]
