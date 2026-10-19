# Duo benchmark artifacts

This is a test-only layer above PR397. Do not merge its recording controls into
production. The manual workflow builds packages; it does not publish a release,
deploy a worker, or modify EAS CLI/build-tools.

## Comparison packages

- main: `6bd437b3c627c77dfaa943de96913b10206986bd`
- PR397: `1e78caeb13f8598dc0bf5413dc24f1e932c0e3c3`
- diagnostic: the exact workflow source commit, including this test layer

The first two packages have no source modifications. All three use one build
worker/compiler image, separate frozen dependency installs, and individual
source/hash/build-environment receipts. The diagnostic package is not a result
for the production PR head.

## Main versus PR397 protocol

Run owned Device Hub sessions sequentially in main / PR / PR / main order, with
at least two sessions per revision. Match the actual CPU count, memory, image,
Simulator runtime, Duo pose, app/fixture hash, full canvas, 60-fps target,
6-Mbps bitrate and recording state. Record the resources through the existing
metrics metadata and grid memory endpoint, which are available on main. Do not
install the new profiling endpoint into the main control.

Connect the same two panel streams within each session, settle for 75 seconds,
then retain three 30-second formal windows with stable peer IDs. Keep profiling
off during those windows. Preserve actual encoder modes/backends as outcomes;
do not force main to use the PR's encoder selection. Keep transport and canvas
readbacks for every boundary. Do not change polling in this experiment.

Use the pinned frame-barcode app for independently counted distinct draw IDs.
Keep source draw/callback telemetry even if it slows down: a slow app under
contention is a performance observation, not grounds to discard the run.
Capture Euxy as a separate workload; its animation is not pixel-matched, so its
cross-VM differences require the reversed-order repeat and remain noisier.

Primary results are decoded FPS and distinct delivered draw IDs/s. Preserve raw
RTP/H264, AU indexes and independently frozen local bounds. Accept a unique-ID
window only after a clean-IDR decode, both-band barcode validation, and matching
AU/FFmpeg/ffprobe counts with no unresolved transport/reference errors. Retain
failed windows and report acceptance counts; never silently average only the
favorable survivors. Native counters remain a separate diagnostic when decoded
content is excluded.

Report duration-weighted mean FPS, per-session/window means, and lowest/highest
one-second rates with their interval definition. These are not 1% lows. Do not
pool different resource cohorts or describe native encoded pictures as unique
app frames. The comparison covers the entire exact PR stack against main.

## Contention controls on the diagnostic package

POST to the authenticated root `/recording/video` endpoint with
`{"benchmarkRecordingMode":"inspect"}` to read recorder counts, pending work,
encode elapsed time and root copy counts. Select:

- `normal`: recorder submissions and root capture copies enabled.
- `encoder-paused`: recorder submissions suppressed; root copies remain.
- `recording-paused`: recorder submissions and root copies suppressed.

Keep the worker-owned recording lease alive throughout. The recorded MP4 can
contain intentional gaps; these are experimental workload controls, not an
ordinary recording-off session. Settle until recorder pending work is zero and
encode counts are frozen before measuring a pause. In recording-paused mode,
also require root copy counts to freeze. Preserve independent active-display
observations and verify panel dimensions/activity are unchanged. Restore normal
mode in `finally` and verify recorder counts resume before closing peers.

Compare normal / encoder-paused / normal, then normal / recording-paused /
normal on one VM with fixed peers and settings. This separates recorder
encode/transfer/writer work from the additional root snapshot cost; it does not
isolate the physical video engine from those other operations.

Separately repeat 1600 / 1400 / 1600, then the reversed order, at 60-fps output
with recording normal. Require completed return controls and clean receiver
windows before claiming a resolution benefit. Production quality defaults stay
unchanged.

The VT probe reports elapsed submit-call time, submit-to-callback time,
callback-to-actor-resume delay, rebuild/extract time and timeouts. Submit-call
time overlaps submit-to-callback; do not add them. Probe counters arrive after
frame delivery and can lag shared-flow samples. Fallback can issue multiple VT
calls per shared frame. They are not CPU or physical GPU utilization.
