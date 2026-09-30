// Read-only environment check for Termux / any machine. Prints no secrets and no env dump.
import { execSync } from 'node:child_process';
import { statfsSync, existsSync, readFileSync } from 'node:fs';
import { freemem, totalmem, release, cpus } from 'node:os';

const run = (cmd: string) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'n/a'; } };
const gb = (n: number) => `${(n / 1024 ** 3).toFixed(1)} GB`;
const fs = statfsSync(process.cwd());
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const isTermux = !!process.env.TERMUX_VERSION || process.env.PREFIX?.includes('com.termux') || existsSync('/data/data/com.termux');

const rows: [string, string][] = [
  ['process.platform', process.platform],
  ['process.arch', process.arch],
  ['kernel', release()],
  ['Termux', isTermux ? `yes (${process.env.TERMUX_VERSION ?? 'version unknown'})` : 'no'],
  ['Android release', isTermux ? run('getprop ro.build.version.release') : 'n/a'],
  ['node', process.version],
  ['npm', run('npm -v')],
  ['git', run('git --version')],
  ['cpus', String(cpus().length)],
  ['memory free/total', `${gb(freemem())} / ${gb(totalmem())}`],
  ['disk free (cwd)', gb(fs.bavail * fs.bsize)],
  ['project dir', process.cwd()],
  ['project on /sdcard?', /^\/(sdcard|storage)/.test(process.cwd()) ? 'YES — move it to $HOME (symlinks/permissions break there)' : 'no'],
  ['engines.node', pkg.engines?.node ?? 'n/a'],
  ['.env.local present', existsSync('.env.local') ? 'yes (values not shown)' : 'no → demo mode'],
];
for (const [k, v] of rows) console.log(`${k.padEnd(22)} ${v}`);

// Native binaries the build needs, per platform.
const want = process.platform === 'android'
  ? ['@rollup/rollup-android-arm64', '@esbuild/android-arm64']
  : [`@rollup/rollup-${process.platform}-${process.arch}`, `@esbuild/${process.platform}-${process.arch}`];
for (const p of want) {
  const found = existsSync(`node_modules/${p}`) || existsSync(`node_modules/${p}-gnu`) || existsSync(`node_modules/${p}-musl`);
  console.log(`${('native ' + p).padEnd(22)} ${found ? 'installed' : 'MISSING (run npm install on this device)'}`);
}
const [maj, min] = process.versions.node.split('.').map(Number) as [number, number];
if (maj < 22 || (maj === 22 && min < 18)) console.log('\n⚠ Node ≥ 22.18 required (TypeScript type-stripping for scripts/tests, --env-file-if-exists).');
