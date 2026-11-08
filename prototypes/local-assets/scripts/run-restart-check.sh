#!/bin/bash
# INK-PROT-021 独立真实进程中断检查入口；任一断言/子进程异常均非零退出。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/scripts/run-restart-check.py"
