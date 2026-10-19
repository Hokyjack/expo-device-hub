#!/usr/bin/env bash
# Test-only artifact builder. No publish, deploy, worker change or Simulator run.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
diagnostic_head=$(git rev-parse HEAD)
output="$root/release-benchmark"
mkdir -p "$output"
export DUO_BENCH_OUTPUT="$output"
python3 - <<'PY'
import json, os, platform, subprocess
from pathlib import Path
def command(*args):
    return subprocess.check_output(args, text=True).strip()
Path(os.environ['DUO_BENCH_OUTPUT'], 'build-environment.json').write_text(json.dumps({
    'os': platform.platform(), 'architecture': platform.machine(),
    'xcode': command('xcodebuild', '-version'),
    'sdk': command('xcrun', '--show-sdk-version'),
    'swift': command('xcrun', 'swift', '--version'),
    'node': command('node', '--version'), 'bun': command('bun', '--version'),
}, indent=2))
PY
for variant in main pr397 diagnostic; do
  case "$variant" in
    main) revision=6bd437b3c627c77dfaa943de96913b10206986bd ;;
    pr397) revision=1e78caeb13f8598dc0bf5413dc24f1e932c0e3c3 ;;
    diagnostic) revision="$diagnostic_head" ;;
  esac
  checkout=$(mktemp -d "/tmp/duo-benchmark-$variant.XXXXXX")
  git -C "$root" fetch origin "$revision"
  git -C "$root" worktree add --detach "$checkout" "$revision"
  test "$(git -C "$checkout" rev-parse HEAD)" = "$revision"
  (
    cd "$checkout"
    bun install --frozen-lockfile
    cd packages/serve-sim/packages/serve-sim
    bun run build.ts
    npm pack --pack-destination "$output" --json > "$output/$variant-pack.json"
  )
  export DUO_BENCH_VARIANT="$variant" DUO_BENCH_REVISION="$revision"
  python3 - <<'PY'
import hashlib, json, os
from pathlib import Path
root=Path(os.environ['DUO_BENCH_OUTPUT']); label=os.environ['DUO_BENCH_VARIANT']
pack=json.loads((root/f'{label}-pack.json').read_text())[0]
source=root/pack['filename']; target=root/f'{label}-serve-sim.tgz'
source.rename(target)
manifest={
    'variant': label, 'sourceHead': os.environ['DUO_BENCH_REVISION'],
    'filename': target.name, 'bytes': target.stat().st_size,
    'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
    'sourceModifications': 'none', 'buildEnvironment': json.loads((root/'build-environment.json').read_text()),
}
(root/f'{label}-provenance.json').write_text(json.dumps(manifest, indent=2))
PY
  git -C "$root" worktree remove --force "$checkout"
done
