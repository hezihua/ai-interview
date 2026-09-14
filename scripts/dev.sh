#!/usr/bin/env bash
# 本地开发：MCP (8765) + FastAPI (8766) + Next.js (3000)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${ROOT}/.dev"
LOG_DIR="${RUN_DIR}/logs"
PID_DIR="${RUN_DIR}/pids"
VENV_PY="${ROOT}/.venv/bin/python"
WORKSPACE="${ROOT}/workspace"

mkdir -p "$LOG_DIR" "$PID_DIR"

usage() {
  cat <<EOF
用法: $(basename "$0") [start|stop|status]

  start   启动三个服务（默认）
  stop    停止由本脚本启动的进程
  status  查看端口与健康检查

环境:
  需要 ${ROOT}/.env 与 ${ROOT}/.venv
  WORKSPACE_DIR 固定为 ${WORKSPACE}
EOF
}

ensure_prereqs() {
  if [[ ! -x "$VENV_PY" ]]; then
    echo "缺少 .venv，请先: cd $ROOT && python3 -m venv .venv && pip install -r requirements.txt" >&2
    exit 1
  fi
  if [[ ! -f "${ROOT}/.env" ]]; then
    echo "缺少 .env，请先: cp .env.example .env 并填写密钥" >&2
    exit 1
  fi
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return 0
  fi
  local uid shell candidates=()
  uid="$(id -u)"
  # fnm 临时 shell 路径
  for shell in /run/user/"${uid}"/fnm_multishells/*/bin; do
    [[ -x "${shell}/node" ]] && candidates+=("$shell")
  done
  # 稳定 alias / 已安装版本
  for shell in \
    "${HOME}/.fnm/aliases/default/bin" \
    "${HOME}/.fnm/current/bin" \
    "${HOME}/.fnm/node-versions/"*/installation/bin; do
    [[ -x "${shell}/node" ]] && candidates+=("$shell")
  done
  if [[ ${#candidates[@]} -gt 0 ]]; then
    export PATH="${candidates[0]}:${PATH}"
    return 0
  fi
  if [[ -x "${HOME}/.fnm/fnm" ]]; then
    eval "$("${HOME}/.fnm/fnm" env)" && command -v node >/dev/null 2>&1 && return 0
  fi
  echo "未找到 node，请安装 Node.js 或配置 fnm PATH" >&2
  exit 1
}

py_env() {
  # 避免 Cursor/沙箱注入的 /tmp/tmp.* 工作区；必须把 "$@" 传给 env
  env -u WORKSPACE_DIR WORKSPACE_DIR="$WORKSPACE" "$@"
}

port_pids() {
  local port="$1"
  ss -lptn "sport = :${port}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' || true
}

write_pid() {
  local name="$1"
  local pid="$2"
  echo "$pid" >"${PID_DIR}/${name}.pid"
}

read_pid() {
  local name="$1"
  local f="${PID_DIR}/${name}.pid"
  if [[ -f "$f" ]]; then
    cat "$f"
  fi
}

stop_one() {
  local name="$1"
  local pid
  pid="$(read_pid "$name" || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    # 子 shell 启动时顺带收掉进程组，避免留下 next-server 孤儿
    kill -- "-${pid}" 2>/dev/null || kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -f "${PID_DIR}/${name}.pid"
}

kill_port() {
  local port="$1"
  local pid
  for pid in $(port_pids "$port"); do
    kill "$pid" 2>/dev/null || true
  done
}

cmd_stop() {
  stop_one mcp
  stop_one api
  stop_one client
  kill_port 8765
  kill_port 8766
  kill_port 3000
  # Next 16 锁文件：进程已死但 lock 仍在时，新实例会立刻退出
  rm -f "${ROOT}/client/.next/dev/lock"
  # 兜底：本仓库残留的 next-server
  pkill -f "${ROOT}/client/.*next-server" 2>/dev/null || true
  pkill -f "next dev --turbopack --port 3000" 2>/dev/null || true
  sleep 0.5
  echo "已停止"
}

cmd_status() {
  for port in 8765 8766 3000; do
    local pids
    pids="$(port_pids "$port" | tr '\n' ' ')"
    if [[ -n "${pids// /}" ]]; then
      echo ":${port} 监听 pid=${pids}"
    else
      echo ":${port} 未监听"
    fi
  done
  if curl -sf http://127.0.0.1:8766/health >/dev/null 2>&1; then
    echo "Agent API health: ok"
  else
    echo "Agent API health: 不可用"
  fi
  if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "Next.js proxy health: ok"
  else
    echo "Next.js proxy health: 不可用"
  fi
}

cmd_start() {
  ensure_prereqs
  ensure_node

  if [[ ! -d "${ROOT}/client/node_modules" ]]; then
    echo "client/node_modules 不存在，正在 npm install …"
    (cd "${ROOT}/client" && npm install --registry=https://registry.npmmirror.com)
  fi

  cmd_stop
  : >"${LOG_DIR}/mcp.log"
  : >"${LOG_DIR}/api.log"
  : >"${LOG_DIR}/client.log"

  echo "启动 MCP …"
  (
    cd "$ROOT"
    exec env -u WORKSPACE_DIR WORKSPACE_DIR="$WORKSPACE" "$VENV_PY" mcp/server.py
  ) >>"${LOG_DIR}/mcp.log" 2>&1 &
  write_pid mcp $!
  sleep 1
  if ! kill -0 "$(read_pid mcp)" 2>/dev/null; then
    echo "MCP 启动失败，见 ${LOG_DIR}/mcp.log" >&2
    tail -n 40 "${LOG_DIR}/mcp.log" >&2 || true
    exit 1
  fi

  echo "启动 FastAPI …"
  (
    cd "${ROOT}/server"
    exec env -u WORKSPACE_DIR WORKSPACE_DIR="$WORKSPACE" "$VENV_PY" server.py
  ) >>"${LOG_DIR}/api.log" 2>&1 &
  write_pid api $!

  api_ok=0
  for _ in $(seq 1 40); do
    if curl -sf http://127.0.0.1:8766/health >/dev/null 2>&1; then
      api_ok=1
      break
    fi
    if ! kill -0 "$(read_pid api)" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if [[ "$api_ok" -ne 1 ]]; then
    echo "FastAPI 启动失败，见 ${LOG_DIR}/api.log" >&2
    tail -n 40 "${LOG_DIR}/api.log" >&2 || true
    cmd_stop
    exit 1
  fi

  echo "启动 Next.js …"
  (
    cd "${ROOT}/client"
    exec npm run dev
  ) >>"${LOG_DIR}/client.log" 2>&1 &
  write_pid client $!

  client_ok=0
  for _ in $(seq 1 40); do
    if curl -sf http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
      client_ok=1
      break
    fi
    if ! kill -0 "$(read_pid client)" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if [[ "$client_ok" -ne 1 ]]; then
    echo "Next.js 启动失败或健康检查未通过，见 ${LOG_DIR}/client.log" >&2
    tail -n 40 "${LOG_DIR}/client.log" >&2 || true
    # 前端失败时仍保留 API/MCP，便于排查
  fi

  echo ""
  echo "开发环境已启动"
  echo "  前端   http://localhost:3000"
  echo "  API    http://127.0.0.1:8766/health"
  echo "  MCP    http://127.0.0.1:8765/mcp"
  echo "  日志   ${LOG_DIR}/"
  echo ""
  echo "停止: $0 stop"
  echo "跟踪日志: tail -f ${LOG_DIR}/api.log ${LOG_DIR}/mcp.log ${LOG_DIR}/client.log"
  cmd_status
}

ACTION="${1:-start}"
case "$ACTION" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  -h | --help | help) usage ;;
  *)
    echo "未知命令: $ACTION" >&2
    usage >&2
    exit 1
    ;;
esac
