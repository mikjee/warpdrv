#!/bin/bash
set -e

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) export CXXFLAGS="/std:c++20" ;;
  *)                    export CXXFLAGS="-std=c++20" ;;
esac

# Bundle format selection.
# Pass bundle formats as arguments: ./release.sh deb appimage
# Defaults to 'deb' only if no arguments given.
# AppImage is excluded by default because it takes a long time to build.
# Default bundle formats per platform (set after platform detection below).
# Pass bundle formats as arguments to override: ./release.sh deb appimage
# AppImage is excluded by default on Linux because it takes a long time to build.
BUNDLE_FORMATS_ARGS=("$@")

REPO_ROOT="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
RELEASE_JSON="$REPO_ROOT/release.json"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"
SERVER_DIR="$REPO_ROOT/packages/server"
APP_DIR="$REPO_ROOT/packages/app"

# Get target triple
TARGET_TRIPLE=$(rustc --print host-tuple 2>/dev/null || rustc -Vv | grep host | cut -d' ' -f2)
echo "Target: $TARGET_TRIPLE"

# Detect platform and set platform-specific variables
case "$TARGET_TRIPLE" in
	*-windows-*)
		PLATFORM="windows"
		PKG_TARGET="node24-win-x64"
		SIDECAR_EXT=".exe"
		;;
	*-linux-*)
		PLATFORM="linux"
		PKG_TARGET="node24-linux-x64"
		SIDECAR_EXT=""
		;;
	*-darwin-*)
		PLATFORM="macos"
		case "$TARGET_TRIPLE" in
			aarch64*) PKG_TARGET="node24-macos-arm64" ;;
			x86_64*)  PKG_TARGET="node24-macos-x64" ;;
		esac
		SIDECAR_EXT=""
		;;
	*)
		echo "ERROR: Unsupported platform: $TARGET_TRIPLE"
		exit 1
		;;
esac

echo "Platform: $PLATFORM ($PKG_TARGET)"

# Resolve bundle formats now that platform is known
case "$PLATFORM" in
	windows) DEFAULT_FORMATS=("msi") ;;
	macos)   DEFAULT_FORMATS=("dmg") ;;
	linux)   DEFAULT_FORMATS=("deb") ;;
esac
if [ ${#BUNDLE_FORMATS_ARGS[@]} -eq 0 ]; then
	BUNDLE_FORMATS=("${DEFAULT_FORMATS[@]}")
else
	BUNDLE_FORMATS=("${BUNDLE_FORMATS_ARGS[@]}")
fi
echo "Bundle formats: ${BUNDLE_FORMATS[*]}"

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
echo "=== Installing dependencies ==="
cd "$REPO_ROOT"
npm install
echo "Dependencies installed"

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
	--minify=false \
	--external:kokoro-js \
	--external:@huggingface/transformers \
	--external:onnxruntime-node \
	--external:tree-sitter \
	--external:tree-sitter-typescript \
	--external:tree-sitter-javascript \
	--external:tree-sitter-python \
	--external:tree-sitter-rust \
	--external:tree-sitter-go \
	--external:tree-sitter-cpp \
	--external:tree-sitter-java \
	--external:tree-sitter-php \
	--external:@node-rs/xxhash \
	--external:ignore
# Compile to standalone binary with pkg
cp "$REPO_ROOT/node_modules/better-sqlite3/build/Release/better_sqlite3.node" "$SERVER_DIR/dist/better_sqlite3.node"
npx @yao-pkg/pkg dist/server.cjs \
	--target "$PKG_TARGET" \
	--output "dist/warpcore-server${SIDECAR_EXT}" \
	--compress GZip
mkdir -p "$SERVER_DIR/dist/node_modules"
node -e "
const fs = require('fs');
const path = require('path');
const ROOT = '$REPO_ROOT/node_modules';
const OUT = '$SERVER_DIR/dist/node_modules';
const visited = new Set();
function resolvePkgDir(name, fromDir) {
	let dir = fromDir;
	while (true) {
		const candidate = path.join(dir, 'node_modules', name);
		if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
		const parent = path.dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
}
function copyDir(src, dest) {
	fs.mkdirSync(dest, { recursive: true });
	for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const s = path.join(src, entry.name);
		const d = path.join(dest, entry.name);
		if (entry.isDirectory()) copyDir(s, d);
		else if (entry.isSymbolicLink()) {
			try { fs.symlinkSync(fs.readlinkSync(s), d); } catch (e) {}
		}
		else fs.copyFileSync(s, d);
	}
}
function walk(pkgDir, relName) {
	if (visited.has(relName)) return;
	visited.add(relName);
	if (!fs.existsSync(path.join(pkgDir, 'package.json'))) {
		console.error('Skip (no package.json):', relName);
		return;
	}
	const dest = path.join(OUT, relName);
	copyDir(pkgDir, dest);
	const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
	const deps = { ...(pj.dependencies || {}), ...(pj.optionalDependencies || {}), ...(pj.peerDependencies || {}) };
	for (const depName of Object.keys(deps)) {
		if (visited.has(depName)) continue;
		const resolved = resolvePkgDir(depName, pkgDir);
		if (!resolved) {
			console.error('Cannot resolve dep:', depName, 'from', relName);
			continue;
		}
		walk(resolved, depName);
	}
}
for (const top of ['kokoro-js', '@huggingface/transformers', 'onnxruntime-node', 'sharp']) {
	const dir = path.join(ROOT, top);
	if (!fs.existsSync(dir)) { console.error('Missing top dep:', top); process.exit(1); }
	walk(dir, top);
}
console.log('Runtime deps copied. Total packages:', visited.size);
"

# Copy tree-sitter grammar packages (prebuilt .node in prebuilds/)
for pkg in tree-sitter tree-sitter-typescript tree-sitter-javascript \
  tree-sitter-python tree-sitter-rust tree-sitter-go \
  tree-sitter-cpp tree-sitter-java tree-sitter-php \
  ignore; do
  src="$REPO_ROOT/node_modules/$pkg"
  dst="$SERVER_DIR/dist/node_modules/$pkg"
  if [ -d "$src" ]; then
    mkdir -p "$dst"
    cp -r "$src"/. "$dst/"
  fi
done

# Copy all @node-rs packages (loader + platform-specific .node)
for src in "$REPO_ROOT"/node_modules/@node-rs/*; do
  [ -d "$src" ] || continue
  dst="$SERVER_DIR/dist/node_modules/@node-rs/$(basename "$src")"
  mkdir -p "$dst"
  cp -r "$src"/. "$dst/"
done

case "$PLATFORM" in
	windows) ORT_OS="win32"; ORT_ARCH="x64" ;;
	linux)   ORT_OS="linux"; ORT_ARCH="x64" ;;
	macos)
		ORT_OS="darwin"
		case "$TARGET_TRIPLE" in
			aarch64*) ORT_ARCH="arm64" ;;
			x86_64*)  ORT_ARCH="x64" ;;
		esac
		;;
esac
ORT_BIN_DIR="$SERVER_DIR/dist/node_modules/onnxruntime-node/bin/napi-v3"
for d in "$ORT_BIN_DIR"/*/; do
	os_name=$(basename "$d")
	if [ "$os_name" != "$ORT_OS" ]; then rm -r "$d"; fi
done
for d in "$ORT_BIN_DIR/$ORT_OS"/*/; do
	arch_name=$(basename "$d")
	if [ "$arch_name" != "$ORT_ARCH" ]; then rm -r "$d"; fi
done

echo "Server binary: $SERVER_DIR/dist/warpcore-server"
ls -lh "$SERVER_DIR/dist/warpcore-server"

echo ""
echo "=== Step 3/4: Preparing Tauri sidecar ==="
mkdir -p "$DESKTOP_DIR/binaries"
cp "$SERVER_DIR/dist/warpcore-server${SIDECAR_EXT}" "$DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
cp "$SERVER_DIR/dist/better_sqlite3.node" "$DESKTOP_DIR/binaries/better_sqlite3.node"
mkdir -p "$DESKTOP_DIR/binaries/node_modules"
cp -r "$SERVER_DIR/dist/node_modules/." "$DESKTOP_DIR/binaries/node_modules/"
if [ "$PLATFORM" != "windows" ]; then
	chmod +x "$DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
fi

rm -r "$DESKTOP_DIR/app-dist" 2>/dev/null || true
cp -r "$APP_DIR/dist" "$DESKTOP_DIR/app-dist"

echo "Sidecar: $DESKTOP_DIR/binaries/warpcore-server-${TARGET_TRIPLE}${SIDECAR_EXT}"
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