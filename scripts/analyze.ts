import "./load-env";
import { parseTopArg } from "./args";
import { precomputeTopicAnalyses } from "../src/lib/precompute";
import { getSnapshot } from "../src/lib/store";

async function main() {
  const top = parseTopArg();
  const snapshot = await getSnapshot();
  await precomputeTopicAnalyses(snapshot, top);
  console.log(`WcCAT analyzed stored topics for ${snapshot.date}${top ? `, top ${top}` : ""}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
