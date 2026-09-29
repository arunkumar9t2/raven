#!/usr/bin/env bash
# Drives an interactive Claude Code session in tmux with the Raven plugin loaded,
# so the mod can be exercised and its pane captured without a human at the keyboard.
# File checkpointing is off so the built-in diff panel does not auto-open over Raven's panes.
#
#   scripts/cc.sh start [workdir]   launch (default workdir: a throwaway git repo)
#   scripts/cc.sh type <text>       type text into the composer and press Enter
#   scripts/cc.sh keys <key>...     send raw tmux keys (Enter, Escape, Down, C-c …)
#   scripts/cc.sh click <col> <row> left-click at 1-based screen cell (SGR mouse)
#   scripts/cc.sh cap               print the visible screen
#   scripts/cc.sh stop              kill the session
set -euo pipefail

SESSION=${RAVEN_TMUX_SESSION:-raven-e2e}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PLUGIN="$ROOT/plugins/raven"
SANDBOX=${RAVEN_SANDBOX:-/tmp/raven-sandbox}

sandbox() {
  rm -rf "$SANDBOX" && mkdir -p "$SANDBOX" && cd "$SANDBOX"
  git init -q
  printf 'hello\nold line\n' > a.txt
  git add -A && git -c user.email=raven@local -c user.name=raven commit -qm init
  printf 'hello\nnew line\n' > a.txt
}

case "${1:-}" in
  start)
    workdir=${2:-}
    if [[ -z "$workdir" ]]; then sandbox; workdir=$SANDBOX; fi
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    tmux new-session -d -s "$SESSION" -x "${RAVEN_COLS:-200}" -y "${RAVEN_ROWS:-50}" -c "$workdir" \
      "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1 claude --model ${RAVEN_MODEL:-haiku} --plugin-dir '$PLUGIN' ${RAVEN_CLAUDE_ARGS:-}"
    sleep 5
    if tmux capture-pane -t "$SESSION" -p | grep -q "trust this folder"; then
      tmux send-keys -t "$SESSION" Down && sleep 0.3 && tmux send-keys -t "$SESSION" Enter
      sleep 4
    fi
    ;;
  type)
    shift
    tmux send-keys -t "$SESSION" -l "$*" && sleep 0.5 && tmux send-keys -t "$SESSION" Enter
    ;;
  click)
    tmux send-keys -t "$SESSION" -l $'\e[<0;'"$2;$3M" && sleep 0.1
    tmux send-keys -t "$SESSION" -l $'\e[<0;'"$2;$3m"
    ;;
  keys) shift; tmux send-keys -t "$SESSION" "$@" ;;
  cap) tmux capture-pane -t "$SESSION" -p | sed -e 's/[[:space:]]*$//' | cat -s ;;
  stop) tmux kill-session -t "$SESSION" 2>/dev/null || true ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
