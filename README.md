# ENG-28070 local Preview evidence

## Authenticated preview without its Share dialog

`private-preview-no-modal.jpg` is an unmodified browser screenshot captured
on October 13, 2026 using Chrome after the shared T3 Preview automation host
reported unavailable. Native source: `448963754d3c54c9c52cd39faed8e4349f9237ec`.
Website source: `3deb4dfd61046cb0c6339f7a84462de17b7b90c4`, whose tree equals
`c937075bd991da14be84a17f6058165b66cbb85d`, before the later readability cleanup.

The actual authenticated page shows Back to session, website Share, and the live
owned iOS Simulator. Website Share count: 1; native Share count: 0; dialogs: 0.
The iframe has a token and no `disableShare` query. The foreground native process
uses `--require-token --disable-share` and omits `--share-url`.

This is local UI evidence with an owned seeded baseline session and HTTPS,
tunnel, base-path, CSP, and frame-ancestor adapters. The shared API did not yet
define the new `publicPreview` field; preference persistence, worker/producer
integration, and hosted EAS acceptance were not tested. Owned fixture, services,
device, and browser tabs were cleaned up; shared services were preserved.

## Earlier captures

The PNGs retained in this branch were captured at native `985aa` and show the
earlier per-page option. That option and its website layer have been removed.
The private PNG is retained only as historical evidence of the website's Share
dialog; it does not establish the current native Share behavior.

Published by Codex under Gabe's direction.
