#!/data/data/com.termux/files/usr/bin/sh
# Compatibility gate for the phone. Run INSIDE Termux, from the project directory in $HOME.
# Writes termux-smoke-<date>.log — paste its summary into COMPATIBILITY.md.
# Read-only for the system: no root, no proot, no global installs.
set -u
LOG="termux-smoke-$(date +%Y%m%d-%H%M).log"
step() {
  name="$1"; shift
  printf '\n=== %s: %s\n' "$name" "$*" | tee -a "$LOG"
  if "$@" >>"$LOG" 2>&1; then echo "RESULT $name: OK" | tee -a "$LOG"; else echo "RESULT $name: FAILED (see $LOG)" | tee -a "$LOG"; fi
}
echo "date: $(date -Iseconds)" | tee "$LOG"
step env-check node scripts/env-check.ts
step install npm ci --no-audit --no-fund
step native-rollup node -e "require('@rollup/rollup-android-arm64'); console.log('rollup native ok')"
step native-esbuild node -e "console.log(require('esbuild').version, require('esbuild').transformSync('let a:number=1',{loader:'ts'}).code)"
step typecheck npx tsc --noEmit -p .
step unit-tests node --test tests/*.test.ts
step build npm run build
step preview-start sh -c 'npx vite preview >/dev/null 2>&1 & echo $! > .preview.pid; sleep 4; curl -sf http://127.0.0.1:4173/ >/dev/null; kill $(cat .preview.pid); rm -f .preview.pid'
step dev-start sh -c 'npx vite >/dev/null 2>&1 & echo $! > .dev.pid; sleep 5; curl -sf http://127.0.0.1:5173/src/main.tsx >/dev/null; kill $(cat .dev.pid); rm -f .dev.pid'
echo
grep '^RESULT' "$LOG"
echo "Now open http://127.0.0.1:5173 in Chrome on the phone (npm run dev) and check HMR by editing src/pages/Home.tsx."
