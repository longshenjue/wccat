import { spawn } from 'node:child_process';

/** Run sibling services as one container lifecycle; never leave an orphan worker. */
export function superviseServices(commands, { signal, gracePeriodMs = 10000 } = {}) {
  if (signal?.aborted) return Promise.resolve(0);
  if (commands.length === 0) return Promise.resolve(1);
  return new Promise((resolve) => {
    const children = new Set();
    let stopping = false;
    let result = 0;
    let killTimer;
    let finished = false;

    function finish() {
      if (finished || children.size !== 0) return;
      finished = true;
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    }
    function stop(code) {
      if (stopping) return;
      stopping = true;
      result = code;
      for (const child of children) child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        for (const child of children) child.kill('SIGKILL');
      }, gracePeriodMs);
      finish();
    }
    function onAbort() { stop(0); }
    signal?.addEventListener('abort', onAbort, { once: true });

    for (const service of commands) {
      const child = spawn(service.command, service.args, { stdio: 'inherit', env: process.env });
      children.add(child);
      child.once('error', (error) => {
        console.error(`[WcCAT] ${service.name} failed to start: ${error.message}`);
        stop(1);
      });
      child.once('close', (code, terminationSignal) => {
        children.delete(child);
        if (!stopping) {
          console.error(`[WcCAT] ${service.name} exited unexpectedly (${code ?? terminationSignal}); stopping sibling services.`);
          stop(code && code > 0 ? code : 1);
        }
        if (stopping) finish();
      });
    }
  });
}
