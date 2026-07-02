export {}; // 모듈 스코프로 격리 (전역 main 충돌 방지)

/** 에이전트 E2E 테스트 — 스트리밍 이벤트를 콘솔에 요약 출력 */
async function main() {
  const question = process.argv[2] ?? "장마철 원룸에서 쓸 제습기 10만원 이하로 추천해줘";
  console.log(`Q: ${question}\n`);

  const res = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      const ev = JSON.parse(part.slice(6));
      switch (ev.type) {
        case "iteration":
          console.log(`\n[오케스트레이터 루프 ${ev.n}회차]`);
          break;
        case "agent_start":
          console.log(`\n  ▶ ${ev.label} 시작 — 과제: ${String(ev.task).slice(0, 80)}…`);
          break;
        case "agent_done":
          console.log(
            `  ■ ${ev.label} 완료${ev.usage ? ` (토큰 ${ev.usage.input_tokens}/${ev.usage.output_tokens})` : ""}`
          );
          break;
        case "verify_start":
          console.log(`  🛡️ 인용 검증 시작`);
          break;
        case "verify_result":
          console.log(
            `  🛡️ 검증 결과: ${ev.passed ? "통과" : "실패→수정"} (판정 ${ev.verdicts?.length ?? 0}건)` +
              (ev.verdicts ?? [])
                .filter((v: { supported: boolean }) => !v.supported)
                .map((v: { citation: string; reason: string }) => `\n     ✘ ${v.citation}: ${v.reason}`)
                .join("")
          );
          break;
        case "tool_use":
          console.log(`    → [${ev.agent ?? "orch"}] ${ev.name}(${JSON.stringify(ev.input).slice(0, 120)})`);
          break;
        case "tool_result":
          console.log(`    ← [${ev.agent ?? "orch"}] ${ev.summary}`);
          break;
        case "text_delta":
          text += ev.text;
          break;
        case "done":
          console.log(`\n[완료] 토큰: in=${ev.usage.input_tokens} out=${ev.usage.output_tokens} cache_read=${ev.usage.cache_read}`);
          break;
        case "error":
          console.log(`\n[오류] ${ev.message}`);
          break;
      }
    }
  }
  console.log(`\n--- 최종 응답 (앞 800자) ---\n${text.slice(0, 800)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
