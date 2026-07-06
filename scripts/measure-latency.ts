export {}; // 모듈 스코프 격리 (전역 main 충돌 방지)

/** 레이턴시 분해: route → 첫 텍스트(TTFT) → 완료. 어디서 시간이 가는지 본다. */
async function main() {
  const q = process.argv[2] ?? "온라인에서 산 옷 단순변심으로 환불 며칠 안에 가능해?";
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: q }] }),
  });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let firstText = false;
  let toolCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split("\n\n");
    buf = parts.pop() ?? "";
    for (const p of parts) {
      if (!p.startsWith("data: ")) continue;
      const ev = JSON.parse(p.slice(6));
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      if (ev.type === "route") marks[`route(${ev.route})`] = +el;
      if (ev.type === "tool_use" && marks[`tool호출#${++toolCount}`] === undefined) marks[`tool호출#${toolCount}`] = +el;
      if (ev.type === "text_delta" && !firstText) { firstText = true; marks["★첫텍스트(TTFT)"] = +el; }
      if (ev.type === "done") marks["완료"] = +el;
    }
  }
  console.log(`Q: ${q}\n`);
  for (const [k, v] of Object.entries(marks)) console.log(`  ${v.toFixed(1).padStart(5)}s  ${k}`);
}
main();
