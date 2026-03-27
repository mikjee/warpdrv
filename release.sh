#!/bin/bash
set -e

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
npx @yao-pkg/pkg dist/server.cjs \
	--target node22-linux-x64 \
	--output dist/warpcore-server \
	--compress GZip

cp "$REPO_ROOT/node_modules/sql.js/dist/sql-wasm.wasm" "$SERVER_DIR/dist/sql-wasm.wasm"
echo "Server binary: $SERVER_DIR/dist/warpcore-server"
ls -lh "$SERVER_DIR/dist/warpcore-server"

echo ""
echo "=== Step 3/4: Preparing Tauri sidecar ==="

mkdir -p "$DESKTOP_DIR/binaries"

cp "$SERVER_DIR/dist/warpcore-server" "$DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"
cp "$REPO_ROOT/node_modules/sql.js/dist/sql-wasm.wasm" "$DESKTOP_DIR/binaries/sql-wasm.wasm"
chmod +x "$DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"

rm -r "$DESKTOP_DIR/app-dist" 2>/dev/null || true
cp -r "$APP_DIR/dist" "$DESKTOP_DIR/app-dist"

echo "Sidecar: $DESKTOP_DIR/binaries/warpcore-server-$TARGET_TRIPLE"
echo "Frontend: $DESKTOP_DIR/app-dist/"

echo ""
echo "=== Step 4/4: Building Tauri app ==="
cd "$DESKTOP_DIR"
npx tauri build

echo ""
echo "============================================"
echo "  Build complete: v$NEW_VERSION"
echo "============================================"
echo ""

BUNDLE_DIR="$DESKTOP_DIR/target/release/bundle"
echo "Artifacts:"
if [ -d "$BUNDLE_DIR/appimage" ]; then
	for f in "$BUNDLE_DIR/appimage/"*.AppImage; do
		echo "  AppImage: $f ($(du -h "$f" | cut -f1))"
	done
fi
if [ -d "$BUNDLE_DIR/deb" ]; then
	for f in "$BUNDLE_DIR/deb/"*.deb; do
		echo "  Deb:      $f ($(du -h "$f" | cut -f1))"
	done
fi

echo ""
echo "Next steps:"
echo "  1. Test: $BUNDLE_DIR/appimage/*.AppImage"
echo "  2. Create GitHub release: v$NEW_VERSION"
echo "  3. Upload the artifacts above"
echo "  4. git add release.json && git commit && git push"
echo ""
