import { superviseServices } from './service-supervisor.mjs';

const port = Number(process.env.PORT ?? 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}
const controller = new AbortController();
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => controller.abort());
}
const services = [{
  name: 'web', command: process.execPath,
  args: ['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', String(port)]
}];
if (process.env.WCCAT_WORKER_ENABLED !== 'false') {
  services.push({name: 'worker', command: process.execPath, args: ['--import', 'tsx', 'scripts/hourly-refresh.ts']});
}
console.log(`[WcCAT] starting ${services.map(service => service.name).join(' + ')} on port ${port}`);
process.exitCode = await superviseServices(services, {signal: controller.signal});
