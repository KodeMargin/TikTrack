#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# TikTrack - Local macOS Build, Sign & Publish to KodeMargin/TikTrack-Release
#
# Uses 0 GitHub Actions minutes and does NOT require `gh` CLI!
# Uploads directly via GitHub REST API using `RELEASE_REPO_TOKEN` (or `GITHUB_TOKEN`),
# which can be exported in your shell or saved in `.env.local`.
# If no token is provided (or `--build-only` is passed), all built & signed files
# are saved to `desktop-agent/release-output/<TAG>/` for manual drag-and-drop upload.
#
# Usage:
#   npm run release:macos                   # Both Apple Silicon (ARM64) & Intel (x86_64) (default)
#   npm run release:macos -- v0.2.1         # Explicit tag + both architectures
#   npm run release:macos -- --arm64-only   # Apple Silicon (ARM64) only
#   npm run release:macos -- --build-only   # Build & sign locally without uploading
# =============================================================================

# Ensure rustup/cargo binaries are in PATH even in non-interactive shells
if [ -d "$HOME/.cargo/bin" ]; then
  export PATH="$HOME/.cargo/bin:$PATH"
fi

RELEASE_REPO="${RELEASE_REPO:-KodeMargin/TikTrack-Release}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AGENT_DIR="$ROOT_DIR/desktop-agent"
TAURI_CONF="$AGENT_DIR/src-tauri/tauri.conf.json"
KEY_FILE="${TAURI_SIGNING_KEY_FILE:-$HOME/.tauri/tiktrack.key}"

# Load RELEASE_REPO_TOKEN / TAURI_SIGNING_PRIVATE_KEY_PASSWORD from .env.local if present
if [ -f "$ROOT_DIR/.env.local" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      RELEASE_REPO_TOKEN=*|GITHUB_TOKEN=*|TAURI_SIGNING_PRIVATE_KEY_PASSWORD=*)
        key="${line%%=*}"
        val="${line#*=}"
        val="${val%\"}"
        val="${val#\"}"
        val="${val%\'}"
        val="${val#\'}"
        if [ -z "${!key:-}" ]; then
          export "$key=$val"
        fi
        ;;
    esac
  done < "$ROOT_DIR/.env.local"
fi

TAG=""
BUILD_INTEL=true
BUILD_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --all|--intel)
      BUILD_INTEL=true
      ;;
    --arm64-only)
      BUILD_INTEL=false
      ;;
    --build-only)
      BUILD_ONLY=true
      ;;
    v*)
      TAG="$arg"
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: npm run release:macos -- [vX.Y.Z] [--arm64-only] [--build-only]"
      exit 1
      ;;
  esac
done

# 1. Resolve version & tag from tauri.conf.json if not explicitly passed
APP_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version)" "$TAURI_CONF")"
if [ -z "$TAG" ]; then
  TAG="v$APP_VERSION"
fi

GH_TOKEN="${RELEASE_REPO_TOKEN:-${GITHUB_TOKEN:-}}"

echo "==> TikTrack Local macOS Release"
echo "    Version:     $APP_VERSION"
echo "    Release Tag: $TAG"
echo "    Target Repo: $RELEASE_REPO"
echo "    Targets:     aarch64-apple-darwin$( $BUILD_INTEL && echo ' + x86_64-apple-darwin' )"
if $BUILD_ONLY || [ -z "$GH_TOKEN" ]; then
  echo "    Upload Mode: Local output only (set RELEASE_REPO_TOKEN in .env.local or env to auto-upload)"
else
  echo "    Upload Mode: Auto-upload via GitHub REST API (no gh CLI needed)"
fi
echo ""

# 2. Check required tools
for cmd in node npm cargo rustup; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is not installed or not in PATH."
    if [ "$cmd" = "cargo" ] || [ "$cmd" = "rustup" ]; then
      echo ""
      echo "Install Rust on macOS by running:"
      echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
      echo "Then restart your terminal (or run: source \"\$HOME/.cargo/env\") and try again."
    fi
    exit 1
  fi
done

# 3. Load Tauri updater signing key
if [ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]; then
  if [ ! -f "$KEY_FILE" ]; then
    echo "Error: Signing key not found at $KEY_FILE and TAURI_SIGNING_PRIVATE_KEY is not set."
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_FILE")"
  echo "==> Loaded signing key from $KEY_FILE"
fi

# 4. Ensure Rust targets are installed
rustup target add aarch64-apple-darwin >/dev/null
if $BUILD_INTEL; then
  rustup target add x86_64-apple-darwin >/dev/null
fi

# 5. Install desktop-agent dependencies if needed
cd "$AGENT_DIR"
if [ ! -d "node_modules" ]; then
  echo "==> Installing desktop-agent npm dependencies..."
  npm ci
fi

# 6. Build macOS target(s)
TARGETS=("aarch64-apple-darwin")
if $BUILD_INTEL; then
  TARGETS+=("x86_64-apple-darwin")
fi

OUT_DIR="$AGENT_DIR/release-output/$TAG"
mkdir -p "$OUT_DIR"

UPLOAD_FILES=()
PLATFORM_MANIFEST_ARGS=()

cleanup_stale_tiktrack_volumes() {
  for vol in /Volumes/TikTrack*; do
    if [ -d "$vol" ]; then
      echo "    Detaching lingering DMG volume: $vol"
      hdiutil detach "$vol" -force >/dev/null 2>&1 || true
    fi
  done
}

for TARGET in "${TARGETS[@]}"; do
  if [ "$TARGET" = "aarch64-apple-darwin" ]; then
    ARCH_LABEL="aarch64"
    UPDATER_KEY="darwin-aarch64"
  else
    ARCH_LABEL="x86_64"
    UPDATER_KEY="darwin-x86_64"
  fi

  echo ""
  echo "==> Building Tauri app for $TARGET..."
  BUILD_OK=false
  for attempt in 1 2 3; do
    cleanup_stale_tiktrack_volumes
    rm -f "$AGENT_DIR/src-tauri/target/$TARGET/release/bundle/dmg"/rw.*.dmg 2>/dev/null || true
    # CI=true passes --skip-jenkins to bundle_dmg.sh, preventing Finder/Spotlight from locking the DMG volume
    if CI=true npm run tauri build -- --target "$TARGET"; then
      BUILD_OK=true
      break
    fi
    if [ "$attempt" -lt 3 ]; then
      echo "    ⚠️  DMG/Tauri bundle attempt $attempt failed (macOS hdiutil busy). Cleaning up and retrying in 3s..."
      cleanup_stale_tiktrack_volumes
      sleep 3
    fi
  done
  if [ "$BUILD_OK" != true ]; then
    echo "Error: Tauri build failed for $TARGET after 3 attempts."
    exit 1
  fi

  BUNDLE_DIR="$AGENT_DIR/src-tauri/target/$TARGET/release/bundle"
  DMG_FILE="$(find "$BUNDLE_DIR/dmg" -maxdepth 1 -name '*.dmg' | head -n 1 || true)"
  TAR_FILE="$(find "$BUNDLE_DIR/macos" -maxdepth 1 -name '*.app.tar.gz' | head -n 1 || true)"
  SIG_FILE="$(find "$BUNDLE_DIR/macos" -maxdepth 1 -name '*.app.tar.gz.sig' | head -n 1 || true)"

  if [ -z "$DMG_FILE" ] || [ -z "$TAR_FILE" ] || [ -z "$SIG_FILE" ]; then
    echo "Error: Expected .dmg, .app.tar.gz, and .app.tar.gz.sig in $BUNDLE_DIR"
    exit 1
  fi

  STAGED_DMG="$OUT_DIR/TikTrack_${APP_VERSION}_${ARCH_LABEL}.dmg"
  STAGED_TAR="$OUT_DIR/TikTrack_${APP_VERSION}_${ARCH_LABEL}.app.tar.gz"
  STAGED_SIG="$OUT_DIR/TikTrack_${APP_VERSION}_${ARCH_LABEL}.app.tar.gz.sig"

  cp "$DMG_FILE" "$STAGED_DMG"
  cp "$TAR_FILE" "$STAGED_TAR"
  cp "$SIG_FILE" "$STAGED_SIG"

  UPLOAD_FILES+=("$STAGED_DMG" "$STAGED_TAR" "$STAGED_SIG")

  TAR_BASENAME="$(basename "$STAGED_TAR")"
  DOWNLOAD_URL="https://github.com/${RELEASE_REPO}/releases/download/${TAG}/${TAR_BASENAME}"
  PLATFORM_MANIFEST_ARGS+=("${UPDATER_KEY}|${DOWNLOAD_URL}|${STAGED_SIG}")
done

# 7. If build-only or no GitHub token, save local files + latest.json snippet and finish
if $BUILD_ONLY || [ -z "$GH_TOKEN" ]; then
  echo ""
  echo "✅ Local build complete! Files saved in:"
  echo "   $OUT_DIR"
  ls -lh "$OUT_DIR"
  echo ""
  echo "To auto-upload next time (no gh CLI needed), add your GitHub PAT to TikTrack/.env.local:"
  echo "  RELEASE_REPO_TOKEN=github_pat_..."
  exit 0
fi

# 8. Upload assets & merge latest.json directly via GitHub REST API (no gh CLI required)
echo ""
echo "==> Publishing to https://github.com/$RELEASE_REPO/releases/tag/$TAG via GitHub API..."

RELEASE_REPO="$RELEASE_REPO" \
RELEASE_TAG="$TAG" \
APP_VERSION="$APP_VERSION" \
GH_TOKEN="$GH_TOKEN" \
OUT_DIR="$OUT_DIR" \
node - "${UPLOAD_FILES[@]}" "--MANIFEST--" "${PLATFORM_MANIFEST_ARGS[@]}" <<'NODE_EOF'
const fs = require('fs');
const path = require('path');

const repo = process.env.RELEASE_REPO;
const tag = process.env.RELEASE_TAG;
const version = process.env.APP_VERSION;
const token = process.env.GH_TOKEN;
const outDir = process.env.OUT_DIR;

const args = process.argv.slice(2);
const sepIdx = args.indexOf('--MANIFEST--');
const uploadFiles = args.slice(0, sepIdx);
const manifestEntries = args.slice(sepIdx + 1);

const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'tiktrack-local-release',
};

async function ghJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { ...apiHeaders, ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function uploadAsset(release, filePath) {
  const fileName = path.basename(filePath);
  const existing = (release.assets || []).find((a) => a.name === fileName);
  if (existing) {
    console.log(`    Replacing existing asset: ${fileName}`);
    await fetch(`https://api.github.com/repos/${repo}/releases/assets/${existing.id}`, {
      method: 'DELETE',
      headers: apiHeaders,
    });
  }

  const uploadBase = release.upload_url.replace(/\{.*$/, '');
  const uploadUrl = `${uploadBase}?name=${encodeURIComponent(fileName)}`;
  const buf = fs.readFileSync(filePath);
  const contentType = fileName.endsWith('.json')
    ? 'application/json'
    : 'application/octet-stream';

  console.log(`    Uploading ${fileName} (${(buf.length / (1024 * 1024)).toFixed(2)} MB)...`);
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...apiHeaders,
      'Content-Type': contentType,
      'Content-Length': String(buf.length),
    },
    body: buf,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed uploading ${fileName} (HTTP ${res.status}): ${errText}`);
  }
}

(async () => {
  // 1. Find or create release
  let rel = await ghJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  if (!rel.ok && rel.status === 404) {
    console.log(`    Release ${tag} not found; creating it...`);
    rel = await ghJson(`https://api.github.com/repos/${repo}/releases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        target_commitish: 'main',
        name: `TikTrack Desktop Agent ${tag}`,
        body: `Production release of TikTrack Desktop Agent (${tag}).`,
        draft: false,
        prerelease: false,
      }),
    });
  }
  if (!rel.ok) {
    throw new Error(`Could not fetch/create release ${tag} (HTTP ${rel.status}): ${JSON.stringify(rel.data)}`);
  }

  const release = rel.data;

  // 2. Upload macOS binaries
  for (const filePath of uploadFiles) {
    await uploadAsset(release, filePath);
  }

  // 3. Download existing latest.json (if present) and merge macOS platforms
  let manifest = {
    version,
    notes: `TikTrack Desktop Agent v${version}`,
    pub_date: new Date().toISOString(),
    platforms: {},
  };

  const latestAsset = (release.assets || []).find((a) => a.name === 'latest.json');
  if (latestAsset?.browser_download_url) {
    try {
      const existingRes = await fetch(latestAsset.browser_download_url, {
        headers: { 'User-Agent': 'tiktrack-local-release' },
      });
      if (existingRes.ok) {
        const existingJson = await existingRes.json();
        manifest = {
          ...manifest,
          ...existingJson,
          version,
          pub_date: new Date().toISOString(),
          platforms: { ...(existingJson.platforms || {}) },
        };
      }
    } catch {
      console.log('    Could not parse existing latest.json; creating fresh manifest.');
    }
  }

  for (const item of manifestEntries) {
    const [platformKey, url, sigPath] = item.split('|');
    const signature = fs.readFileSync(sigPath, 'utf8').trim();
    manifest.platforms[platformKey] = { signature, url };
  }

  const latestPath = path.join(outDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('    Merged latest.json platforms:', Object.keys(manifest.platforms).join(', '));

  // Refresh release assets list before replacing latest.json
  const refreshed = await ghJson(`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  await uploadAsset(refreshed.ok ? refreshed.data : release, latestPath);

  console.log(`\n✅ Done! Published to https://github.com/${repo}/releases/tag/${tag}`);
})().catch((err) => {
  console.error('\n❌ GitHub upload failed:', err.message);
  process.exit(1);
});
NODE_EOF
