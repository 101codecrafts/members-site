import { describe, expect, it } from "vitest";
import { runAssistant } from "../assistant";
const live = process.env.LIVE_GATEWAY === "1";
describe.skipIf(!live)("citation rate probe", () => {
  it("cites in most runs", async () => {
    let cited = 0;
    const qs = ["How much does it cost to join 101 Codecrafts?", "Do I need a laptop?", "Can I get a refund?", "Do you issue certificates?", "How much does it cost to join?"];
    await Promise.all(qs.map(async (q) => {
      const run = await runAssistant({ messages: [{ id: "u", role: "user", parts: [{ type: "text", text: q }] }], signedIn: false, toolDeps: { getCourses: async () => [], getEvents: async () => [] } });
      if (run.kind === "stream" && /\[\d\]/.test(await run.result.text)) cited++;
    }));
    console.log("CITED", cited, "/", qs.length);
    expect(cited).toBeGreaterThanOrEqual(4);
  });
});
