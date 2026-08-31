FROM python:3.13-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MCP_TRANSPORT=streamable-http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8765 \
    MCP_PATH=/mcp \
    WORKSPACE_DIR=/app/workspace

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY mcp/workspace.py mcp/fetch_posting.py mcp/tracker.py mcp/server.py ./

EXPOSE 8765

CMD ["python", "server.py"]
