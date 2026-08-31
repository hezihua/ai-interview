FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8766 \
    PYTHONPATH=/app/agent

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent /app/agent
COPY server/server.py /app/server.py
COPY server/extract.py /app/extract.py

EXPOSE 8766

CMD ["python", "server.py"]
