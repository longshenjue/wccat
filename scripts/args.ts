export function parseTopArg(args = process.argv.slice(2)) {
  const raw = args.find((arg) => arg.startsWith("top=") || arg.startsWith("--top="));
  if (!raw) {
    return undefined;
  }

  const value = Number(raw.split("=")[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}

export function applyTopEnv(top?: number) {
  if (top) {
    process.env.WCCAT_ANALYZE_TOPICS = String(top);
  }
}
