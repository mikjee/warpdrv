#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLAUDE="$ROOT/CLAUDE.md"

# Check if filelist section exists
if ! grep -q '```filelist' "$CLAUDE"; then
  echo "No ```filelist section found in CLAUDE.md. Nothing to update."
  exit 0
fi

# Generate tree for a single package
generate_tree() {
  local pkg="$1"
  local pkg_dir="$ROOT/packages/$pkg"
  
  echo "### packages/$pkg"
  
  # Find all matching files, get relative paths
  find "$pkg_dir" \( -name '*.ts' -o -name '*.tsx' -o -name '*.scss' -o -name '*.css' -o -name '*.rs' \) -type f -print | \
    sed "s|^$pkg_dir/||" | sort
}

# Build the full filelist content
FILELIST=""
for pkg in $(ls "$ROOT/packages/"); do
  if [ -d "$ROOT/packages/$pkg" ]; then
    FILELIST+="$(generate_tree "$pkg")"$'\n'
  fi
done

# Replace the content inside ```filelist ... ``` in CLAUDE.md
awk -v new_content="$FILELIST" '
  BEGIN { in_block = 0; started = 0 }
  /^```filelist$/ {
    in_block = 1
    if (!started) {
      print
      printf "%s", new_content
      started = 1
    }
    next
  }
  /^```$/ && in_block {
    print
    in_block = 0
    next
  }
  !in_block { print }
' "$CLAUDE" > "$CLAUDE.tmp"

mv "$CLAUDE.tmp" "$CLAUDE"
echo "CLAUDE.md updated."
