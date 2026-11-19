# TikTrack Release Guide

This guide covers how to release new versions of the **TikTrack Desktop Agent** (macOS, Windows, Linux with in-app auto-updates) and the **TikTrack VS Code Extension**.

---

## Architecture Overview

| Component | Source Repo | Distribution Target | Workflow |
| :--- | :--- | :--- | :--- |
| **Desktop Agent (Tauri v2)** | `KodeMargin/TikTrack` (Private) | `KodeMargin/TikTrack-Release` (Public GitHub Releases) | `.github/workflows/desktop-release.yml` |
| **VS Code Extension** | `KodeMargin/TikTrack` (Private) | Visual Studio Marketplace (+ optional Open VSX) | `.github/workflows/vscode-publish.yml` |

- Source code stays private in `KodeMargin/TikTrack`.
- Compiled desktop installers (`.dmg`, `.exe`/`.msi`, `.AppImage`/`.deb`) and the signed updater manifest (`latest.json`) are published to `KodeMargin/TikTrack-Release`.
- Installed desktop agents automatically check `https://github.com/KodeMargin/TikTrack-Release/releases/latest/download/latest.json` and offer a one-click **Update & Restart** button without requiring manual uninstall.

---

## 1. One-Time Setup

Complete these steps once before your first release.

### A. Initialize the Public Releases Repository
Ensure `KodeMargin/TikTrack-Release` is **public** and has at least one commit on its `main` branch (for example, a `README.md`), because the release workflow targets `releaseCommitish: 'main'`.

### B. Generate Tauri Updater Signing Keys
The Tauri updater cryptographically verifies every update package using an Ed25519 keypair.

```bash
cd desktop-agent
npx tauri signer generate -w ~/.tauri/tiktrack.key
```

> Use `--force` only if you intentionally want to overwrite an existing keypair. **Never overwrite the keypair after users have installed a release**, or existing installations will reject future updates.

Copy the public key to your clipboard and paste it into `desktop-agent/src-tauri/tauri.conf.json` under `plugins.updater.pubkey`:

```bash
cat ~/.tauri/tiktrack.key.pub | pbcopy
```

> **Note:** Use `pbcopy` rather than copying directly from terminal output so no trailing zsh `%` character is included.

### C. Configure GitHub Actions Secrets
In the **private** `KodeMargin/TikTrack` repository, go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret Name | Required For | How to Obtain |
| :--- | :--- | :--- |
| `RELEASE_REPO_TOKEN` | Desktop Agent | GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens** → Resource owner: `KodeMargin`, Repository: `TikTrack-Release`, Permission: **Contents: Read and write**. |
| `TAURI_SIGNING_PRIVATE_KEY` | Desktop Agent | Run `cat ~/.tauri/tiktrack.key \| pbcopy` and paste the full content. |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Desktop Agent | The password entered during `tauri signer generate` (omit if no password was set). |
| `VSCE_PAT` | VS Code Extension | Azure DevOps Personal Access Token with **Marketplace → Manage** scope. |
| `OVSX_PAT` *(optional)* | VS Code Extension | Open VSX Registry access token (if publishing to Open VSX / Cursor / Windsurf). |

---

## 2. Releasing a New Desktop Agent Version

### Step 1: Bump the Version Number
Update the version (for example, `0.2.0` → `0.2.1`) in **all three** files so the updater and bundles stay in sync:

1. `desktop-agent/src-tauri/tauri.conf.json` → `"version": "0.2.1"`
2. `desktop-agent/src-tauri/Cargo.toml` → `version = "0.2.1"`
3. `desktop-agent/package.json` → `"version": "0.2.1"`

### Step 2: Commit & Push to `main`
```bash
git add desktop-agent/src-tauri/tauri.conf.json desktop-agent/src-tauri/Cargo.toml desktop-agent/package.json
git commit -m "chore(desktop): bump version to v0.2.1"
git push origin main
```

### Step 3: Trigger the Release Workflow
Choose either method:

- **Option A — GitHub Actions UI (Recommended):**
  1. Open `KodeMargin/TikTrack` → **Actions** → **Release Desktop App**.
  2. Click **Run workflow**.
  3. Set **Use workflow from** to `main`.
  4. Enter **Release version tag** (e.g., `v0.2.1`).
  5. Click **Run workflow**.

- **Option B — Push a Git Tag:**
  ```bash
  git tag v0.2.1
  git push origin v0.2.1
  ```

### Step 4: Verify the Release
Once all 4 build jobs finish (macOS Apple Silicon, macOS Intel, Windows, Linux):
1. Open `https://github.com/KodeMargin/TikTrack-Release/releases`.
2. Confirm the release contains installers for all platforms **and** `latest.json`.
3. Open an already-installed TikTrack Desktop Agent (or click the download icon in the header) — an **Update v0.2.1 available** banner with **Update & Restart** will appear automatically.

---

## 3. Releasing a New VS Code Extension Version

### Option A — Automatic Publish on Push
Whenever changes inside `vscode-extension/**` are pushed to `main`, `.github/workflows/vscode-publish.yml` runs automatically:
1. Bump `"version"` in `vscode-extension/package.json` (e.g., `0.2.1` → `0.2.2`).
2. Commit and push to `main`.
3. The workflow typechecks, builds, packages `.vsix`, and publishes to Visual Studio Marketplace (if `VSCE_PAT` is configured).

### Option B — Manual Publish via GitHub Actions
1. Open `KodeMargin/TikTrack` → **Actions** → **Publish VS Code Extension**.
2. Click **Run workflow**.
3. Choose **bump**:
   - `none` — publish the version currently in `vscode-extension/package.json`.
   - `patch` / `minor` / `major` — automatically increment the version before publishing.
4. Click **Run workflow**.

> If `VSCE_PAT` is not set, the workflow still builds and uploads `tiktrack-vscode-extension-vsix` as a downloadable workflow artifact (`.vsix`) for manual installation via `code --install-extension <file>.vsix`.

---

## 4. Troubleshooting

- **Updater signature or pubkey error during build:** Verify `plugins.updater.pubkey` in `desktop-agent/src-tauri/tauri.conf.json` and `TAURI_SIGNING_PRIVATE_KEY` in GitHub Secrets do not have extra characters (such as a trailing `%` from zsh) and belong to the same keypair.
- **`403` / `404` when uploading desktop release:** Check that `RELEASE_REPO_TOKEN` has not expired and has **Contents: Read and write** permission on `KodeMargin/TikTrack-Release`, and that `KodeMargin/TikTrack-Release` has an initialized `main` branch.
- **Installed desktop app does not detect the new version:** Confirm the `"version"` in `tauri.conf.json` is strictly greater than the installed version (e.g., `0.2.1 > 0.2.0`) and that `latest.json` is present on the latest release in `KodeMargin/TikTrack-Release`.
- **Desktop app fails to check updates in dev mode:** `npm run tauri dev` uses `http://localhost:1420` for frontend hot-reload only; production builds (`npm run tauri build`) bundle `desktop-agent/dist` directly into the app binary.
