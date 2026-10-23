# Single-device review evidence

Built from Device Hub stack tip `cd69cb5ed13e636b7f53855207e5baf842584bd1` on macOS with an owned iPhone 17 Pro target and a separate iOS 26.5 Safari viewer. Desktop captures used isolated headless Chrome after T3 screenshot capture timed out twice. Mobile captures used agent-device against the Safari viewer. No screenshots were edited.

- `desktop-sidebar-hidden.png`: single-device preview without the left sidebar or selector.
- `desktop-tools-centered.png`: device centered beside Tools at 1402 CSS pixels.
- `narrow-desktop-tools.png`, `narrow-desktop-restored.png`: at 640 CSS pixels the outer frame shrinks from 347 to 250 pixels, then returns to 347 after Tools closes.
- `mobile-sidebar-hidden.png`, `mobile-tools-overlay.png`: iOS Safari with Tools closed/open; the panel overlays on mobile. Touch panel close and fullscreen enter/exit also passed.
- `desktop-measurements.json`: actual DOM measurements from the captured run.
- `cli-output.txt`: command and actual startup output.

The test devices and local server belong to this review run. This is local validation, not hosted EAS acceptance.

Real pinned shutdown/restart also passed: both lifecycle requests returned 200; the API transitioned from its pinned configuration to null, then back to the same pinned UDID. See `reconnect.json` for the redacted result.

`hub-sidebar-hidden.png` shows the Device Hub dashboard from the same stack-tip build, with one pinned live device and no left sidebar. Its refreshed package suite passed 350 tests.
