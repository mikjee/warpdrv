#!/bin/bash
set -e

# Bundle format selection.
# Pass bundle formats as arguments: ./release.sh deb appimage
# Defaults to 'deb' only if no arguments given.
# AppImage is excluded by default because it takes a long time to build.
if [ $# -eq 0 ]; then
	BUNDLE_FORMATS=("deb")
else
	BUNDLE_FORMATS=("$@")
fi

echo "Bundle formats: ${BUNDLE_FORMATS[*]}"

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
RELEASE_JSON="$REPO_ROOT/release.json"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"
SERVER_DIR="$REPO_ROOT/packages/server"
APP_DIR="$REPO_ROOT/packages/app"

# Get target triple
TARGET_TRIPLE=$(rustc --print host-tuple 2>/dev/null || rustc -Vv | grep host | cut -d' ' -f2)
echo "Target: $TARGET_TRIPLE"

# Read current version
CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RELEASE_JSON','utf8')).version)")
echo "Current version: $CURRENT_VERSION"

# Ask for new version
read -p "New version (Enter to keep $CURRENT_VERSION): " NEW_VERSION
if [ -z "$NEW_VERSION" ]; then
	NEW_VERSION="$CURRENT_VERSION"
fi

read -p "Release notes: " NOTES

# Bump versions everywhere
node -e "
const fs = require('fs');
const files = [
	['$RELEASE_JSON', (r) => { r.version = '$NEW_VERSION'; r.notes = '$NOTES'; return r; }],
	['$DESKTOP_DIR/tauri.conf.json', (r) => { r.version = '$NEW_VERSION'; return r; }],
	['$REPO_ROOT/package.json', (r) => { r.version = '$NEW_VERSION'; return r; }],
];
for (const [path, transform] of files) {
	if (fs.existsSync(path)) {
		const data = JSON.parse(fs.readFileSync(path, 'utf8'));
		fs.writeFileSync(path, JSON.stringify(transform(data), null, '\t') + '\n');
		console.log('  Updated', path);
	}
}
"

echo ""
echo "=== Step 1/4: Building frontend ==="
cd "$APP_DIR"
npx vite build
echo "Frontend built to $APP_DIR/dist/"

echo ""
echo "=== Step 2/4: Building server binary ==="
cd "$SERVER_DIR"

# Bundle with esbuild
npx esbuild src/index.ts \
	--bundle \
	--outfile=dist/server.cjs \
	--format=cjs \
	--platform=node \
	--target=node22 \
	--minify=false

# Compile to standalone binary with pkg
cp "$REPO_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node" "$SERVER_DIR/dist/better_sqlite3.node"

npx @yao-pkg/pkg dist/server.cjs \
	--target node24-linux-x64 \
	--output dist/warpcore-server \
	--compress GZip

echo "Server binary: $SERVER_DIR/dist/warpcore-server"
ls -lh "$SERVER_DIR/dist/warpcore-server"

echo ""
echo "=== Step 3/4: Preparing Tauri sidecar ==="
mkdir -p "$DESKTOP_DIR/binaries"
cp "$SERVER_DIR/dist/warpcore-server" "$DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"
cp "$SERVER_DIR/dist/better_sqlite3.node" "$DESKTOP_DIR/binaries/better_sqlite3.node"
chmod +x "$DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"

rm -r "$DESKTOP_DIR/app-dist" 2>/dev/null || true
cp -r "$APP_DIR/dist" "$DESKTOP_DIR/app-dist"

echo "Sidecar: $DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"
echo "Frontend: $DESKTOP_DIR/app-dist/"

echo ""
echo "=== Step 4/4: Building Tauri app ==="
cd "$DESKTOP_DIR"

# Build only the requested bundle formats
BUNDLE_ARGS=""
for fmt in "${BUNDLE_FORMATS[@]}"; do
	BUNDLE_ARGS="$BUNDLE_ARGS --bundles $fmt"
done

npx tauri build $BUNDLE_ARGS

echo ""
echo "============================================"
echo "  Build complete: v$NEW_VERSION"
echo "============================================"