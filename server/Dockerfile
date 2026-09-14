FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    API_HOST=0.0.0.0 \
    API_PORT=8766 \
    PYTHONPATH=/app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server/server.py server/config.py server/extract.py server/workbench.py /app/
COPY mcp/workspace.py mcp/tracker.py /app/

EXPOSE 8766

CMD ["python", "server.py"]
