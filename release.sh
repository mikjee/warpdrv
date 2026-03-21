#!/bin/bash
set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
RELEASE_JSON="$REPO_ROOT/release.json"

if [ ! -f "$RELEASE_JSON" ]; then
	echo "Error: release.json not found at $RELEASE_JSON"
	exit 1
fi

CURRENT_VERSION=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$RELEASE_JSON','utf8')).version)")
echo "Current version: $CURRENT_VERSION"

# Ask for new version
read -p "New version (or press Enter to keep $CURRENT_VERSION): " NEW_VERSION
if [ -z "$NEW_VERSION" ]; then
	NEW_VERSION="$CURRENT_VERSION"
fi

# Ask for release notes
read -p "Release notes: " NOTES

# Update release.json
node -e "
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('$RELEASE_JSON', 'utf8'));
r.version = '$NEW_VERSION';
r.notes = '$NOTES';
fs.writeFileSync('$RELEASE_JSON', JSON.stringify(r, null, '\t') + '\n');
"

# Update tauri.conf.json version
TAURI_CONF="$REPO_ROOT/packages/desktop/src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF" ]; then
	node -e "
	const fs = require('fs');
	const c = JSON.parse(fs.readFileSync('$TAURI_CONF', 'utf8'));
	c.version = '$NEW_VERSION';
	fs.writeFileSync('$TAURI_CONF', JSON.stringify(c, null, '\t') + '\n');
	"
fi

# Update root package.json version
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('$REPO_ROOT/package.json', 'utf8'));
p.version = '$NEW_VERSION';
fs.writeFileSync('$REPO_ROOT/package.json', JSON.stringify(p, null, '\t') + '\n');
"

echo ""
echo "Version bumped to $NEW_VERSION"
echo ""

# Build frontend
echo "Building frontend..."
cd "$REPO_ROOT"
npm run build

# Build Tauri
echo "Building Tauri desktop app..."
cd "$REPO_ROOT/packages/desktop"
npx tauri build

echo ""
echo "============================================"
echo "  Build complete: v$NEW_VERSION"
echo "============================================"
echo ""
echo "Artifacts:"

BUNDLE_DIR="$REPO_ROOT/packages/desktop/src-tauri/target/release/bundle"
if [ -d "$BUNDLE_DIR/appimage" ]; then
	echo "  AppImage: $(ls "$BUNDLE_DIR/appimage/"*.AppImage 2>/dev/null)"
fi
if [ -d "$BUNDLE_DIR/deb" ]; then
	echo "  Deb:      $(ls "$BUNDLE_DIR/deb/"*.deb 2>/dev/null)"
fi

echo ""
echo "Next steps:"
echo "  1. Test the build locally"
echo "  2. Create a GitHub release tagged v$NEW_VERSION"
echo "  3. Upload the artifacts above to the release"
echo "  4. Commit and push release.json (so update check works)"
echo ""
