#!/usr/bin/env sh
set -eu

ROOT="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"

# If user provides an explicit node path, use it
if [ -n "${NODE_BIN:-}" ] && [ -x "${NODE_BIN}" ]; then
  exec "${NODE_BIN}" "$ROOT/dist/index.js" "$@"
fi

# If node exists anyway, use it
if command -v node >/dev/null 2>&1; then
  exec node "$ROOT/dist/index.js" "$@"
fi

# NixOS bootstrap: run node from nixpkgs (flakes)
if command -v nix >/dev/null 2>&1; then
  exec nix run nixpkgs#nodejs -- node "$ROOT/dist/index.js" "$@"
fi

echo "Error: Node.js not found. On NixOS either:
- set NODE_BIN=/absolute/path/to/node, or
- ensure 'nix' is available and flakes are enabled." >&2
exit 127
