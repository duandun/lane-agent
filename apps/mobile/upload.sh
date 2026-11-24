#!/usr/bin/env bash
set -euo pipefail

# 用法: ./upload.sh [user@host]
# 可用环境变量覆盖: REMOTE_DIR=/opt/lane-serve/web ./upload.sh
HOST="${1:-root@59.110.25.186}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lane-serve/web}"

cd "$(dirname "$0")"

if [[ ! -f package.json ]]; then
  echo "请在 web 项目目录下运行（找不到 package.json）" >&2
  exit 1
fi

echo "上传到 $HOST:$REMOTE_DIR ..."
COPYFILE_DISABLE=1 tar czf - \
  --exclude='./node_modules' \
  --exclude='./.tanstack' \
  --exclude='./.git' \
  --exclude='./.idea' \
  --exclude='.DS_Store' \
  . | ssh "$HOST" "mkdir -p '$REMOTE_DIR' && tar xzf - -C '$REMOTE_DIR'"

echo "完成。源码和 dist 已上传到 $HOST:$REMOTE_DIR（nginx 的 root 指向 $REMOTE_DIR/dist/client）"
