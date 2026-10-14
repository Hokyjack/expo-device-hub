# ENG-28070 local browser evidence

Paired website/serve-sim browser QA captured on October 13, 2026.
The native source was commit 985aa0f251fb8ace48bdb32c1a75f971dbf917d1.
The subsequent CLI validation follow-ups do not alter the preview UI.

- Private authenticated page: website Share = 1, native Share = 0;
  the iframe URL had `disableShare=1`.
- Guest public page: native Share = 1; the iframe URL omitted `disableShare`.

These are unmodified screenshots from an owned local iOS Simulator and session.
Local HTTPS, tunnel, and CSP adapters were used. Hosted EAS orchestration and
native bearer enforcement were not exercised in this paired check. The fixture,
owned processes, and device session were cleaned up after QA.

Published by Codex at Gabe's direction for PR #336.
