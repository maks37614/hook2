import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Check if TypeScript loader (tsx) is already active
const isTsxActive = Boolean(
  process.env.__TSX_BOOTSTRAPPED__ === '1' ||
  process.execArgv.some((arg) => arg.includes('tsx'))
);

if (!isTsxActive) {
  // Plain node was invoked (e.g. `node server.ts` on Render or PaaS)
  // Transparently re-spawn with TSX loader so all TypeScript imports resolve cleanly.
  const scriptPath = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', scriptPath, ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        __TSX_BOOTSTRAPPED__: '1',
      },
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  const forwardSignal = (sig: NodeJS.Signals) => {
    if (child.pid) {
      try {
        process.kill(child.pid, sig);
      } catch {}
    }
  };

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));
  process.on('SIGHUP', () => forwardSignal('SIGHUP'));
} else {
  // TSX loader is active: load and start the server application
  await import('./server/app.ts');
}
