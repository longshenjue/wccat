import "./load-env";
import { fetchSource } from "../src/lib/ingest";
import { getActiveSources } from "../src/lib/sources";

async function main() {
  const results = await Promise.all(
    getActiveSources().map(async (source) => {
      const items = await fetchSource(source);
      return {
        source: source.displayName,
        id: source.id,
        count: items.length,
        first: items[0]?.title ?? "无数据"
      };
    })
  );

  console.table(results);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
