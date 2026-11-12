export type ServiceCommand = { name: string; command: string; args: string[] };
export function superviseServices(commands: ServiceCommand[], options?: {
  signal?: AbortSignal;
  gracePeriodMs?: number;
}): Promise<number>;
