# DevProof Desktop Agent (`desktop-agent`)

Lightweight Tauri v2 + Rust companion tray timer for Phase 1 (`F1-020` – `F1-027`, `D-001` – `D-006`).

## Responsibilities
- **Visible OS Tray Indicator (`F1-027`)**: Always shows `Idle`, `Recording (<work_mode>)`, or `Paused` state transparently in the menu bar / system tray.
- **Monotonic Clock & Crash Recovery (`F1-021`, `F1-022`)**: Uses `std::time::Instant` paired with persisted checkpoint snapshots in `$APP_LOCAL_DATA/devproof_recovery.json` so sleep/wake or unexpected reboot recovers accurately without wall-clock tampering.
- **Offline Event Queue (`F1-026`)**: Buffers session start, transition, and segment envelopes locally when offline and flushes to Supabase Edge Functions (`/functions/v1/sessions-start`, `/functions/v1/sessions-transition`) in deterministic order once connectivity resumes.
- **Strict DPIA Metadata Gate (`F1-028`, `F1-029`)**: Blocks prohibited metadata keys (`keystrokes`, `clipboard`, `window_title`, `url`, `screenshot`) and excluded local process names before persistence or network emission.

## Development
```bash
npm install
npm run tauri dev
```

