import "./load-env";
import { applyTopEnv, parseTopArg } from "./args";
import { refreshSnapshot } from "../src/lib/store";

async function main() {
  const top = parseTopArg();
  applyTopEnv(top);
  const snapshot = await refreshSnapshot();

  console.log(
    `WcCAT refreshed ${snapshot.date}: ${snapshot.topics.length} topics from ${snapshot.rawItems.length} raw items${
      top ? `, analyzed top ${top}` : ""
    }.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
