# TikTrack - VS Code Extension (Phase 2 Milestone 2.2)

Covers **`F2-010` through `F2-016`** and **Section 5.5 Acceptance Scenarios**:

- **Workspace & Branch Task Suggestion (`F2-010`, `F2-011`):** Reads Git repository remote and active branch name (e.g., `feature/DEV-101-gist-exclusion`) to suggest linking active work sessions to `DEV-101`. Developers can confirm or override the task mapping at any time.
- **Coarse 1-Minute Edit & Save Buckets (`F2-010`):** Emits `files_touched_count`, `language_ids`, and `save_count`. Never collects source code, file contents, or raw Git diffs.
- **Debug Session Lifecycle (`F2-012`):** Records debugger start/stop, duration, and breakpoint hit counts to substantiate multi-hour zero-commit debugging sessions.
- **Test Execution Artifacts (`F2-013`):** Captures local test runner pass/fail counts and execution duration.
- **Opt-In Terminal Command Categories (`F2-016`):** Disabled by default; when explicitly enabled by the developer, maps executables to coarse categories (`build`, `test`, `version_control`, `package_manager`) without capturing arguments, environment variables, or terminal output.
- **Local Privacy Audit & One-Click Disconnect (`F2-035`, Section 5.5):** Developers can inspect every queued event locally and disconnect the integration at any time.

