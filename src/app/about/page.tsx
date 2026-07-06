import Link from "next/link";

export const metadata = {
  title: "기술 문서 — 쇼핑 컨시어지 · (주)제로 사전과제",
  description: "이창호 · 법령 GraphRAG 기반 AI 커머스 에이전트의 설계와 근거",
};

/**
 * 프로젝트 기술 문서 페이지 — 무엇을, 어떻게, 왜 만들었는지 평가자에게 설명한다.
 * 모든 수치는 저장소의 측정 스크립트(npm run eval / bench / redteam)로 재현 가능하다.
 */
export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa] px-6 py-8 text-[#191919] sm:px-8">
      <div className="mx-auto max-w-3xl">
        {/* 헤더 */}
        <header className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#03c75a] font-black text-white">
                쇼
              </div>
              <span className="text-[15px] font-bold">쇼핑 컨시어지 — 기술 문서</span>
            </div>
            <nav className="flex gap-1.5 text-[13px] font-medium">
              <Link href="/" className="rounded-lg px-3 py-1.5 text-[#4b4b4b] hover:bg-[#f1f3f5]">
                💬 채팅
              </Link>
              <Link href="/admin" className="rounded-lg px-3 py-1.5 text-[#4b4b4b] hover:bg-[#f1f3f5]">
                📊 대시보드
              </Link>
            </nav>
          </div>
          <div className="rounded-xl border border-[#eaecef] bg-white p-5">
            <p className="text-[12px] font-semibold text-[#02b350]">(주)제로 사전과제</p>
            <h1 className="mt-1 text-xl font-bold">
              법령 지식그래프(GraphRAG) 기반 AI 커머스 에이전트
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#4b4b4b]">
              지원자 <b>이창호</b> · 상황 기반 상품 추천과 소비자권리(환불·청약철회·광고규제)
              안내를 하나의 멀티 에이전트로 제공하는 프로토타입입니다. 아래는 각 기술을{" "}
              <b>무엇으로, 어떻게, 왜</b> 구현했는지의 기록이며, 수치는 전부 저장소의 측정
              스크립트로 재현할 수 있습니다.
            </p>
          </div>
        </header>

        {/* 1. 데이터 */}
        <Section title="1. 데이터 — 무엇이 들어갔나" emoji="🗄️">
          <Table
            head={["소스", "내용", "쓰임"]}
            rows={[
              [
                "법제처 국가법령정보센터 Open API",
                "전자상거래법·표시광고법·약관규제법·소비자기본법 현행 XML → 조문 186개, 참조 엣지 258개",
                "Neo4j 지식그래프 (법령→조→항 계층 + REFERS_TO 참조)",
              ],
              [
                "네이버 쇼핑/블로그 검색 API",
                "상품명·가격·판매처·이미지, 블로그 후기 스니펫 (실시간)",
                "상품 검색·후기 근거 — mock 데이터 없음",
              ],
              [
                "Supabase (PostgreSQL)",
                "대화 로그(질문·답변·트레이스·토큰) — 저장 전 PII 마스킹",
                "커머스 인텔리전스 대시보드",
              ],
            ]}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-[#4b4b4b]">
            <b>왜 법령을 그래프로 넣었나:</b> 법령은 태생적으로 그래프입니다. &ldquo;제17조에
            따라&rdquo;, &ldquo;~를 준용한다&rdquo; 같은 참조가 원칙-예외-절차를 연결하는데, 조문
            본문에서 &ldquo;제N조&rdquo; 패턴을 파싱해 REFERS_TO 엣지로 만들었습니다. 별점·리뷰
            수는 네이버 API가 제공하지 않으므로 <b>지어내지 않고</b> 후기의 정성적 근거만
            사용합니다.
          </p>
        </Section>

        {/* 2. 임베딩 */}
        <Section title="2. 임베딩·벡터 검색 — 어떻게, 왜" emoji="🧭">
          <ul className="space-y-2 text-[13px] leading-relaxed text-[#4b4b4b]">
            <li>
              <b>모델:</b> Voyage AI <code className="rounded bg-zinc-100 px-1">voyage-3.5</code>{" "}
              (1024차원). 한국어 포함 다국어 검색(retrieval) 특화 임베딩이라 법령 조문 검색에
              적합하고, 문서용(<code className="rounded bg-zinc-100 px-1">document</code>)과 질의용(
              <code className="rounded bg-zinc-100 px-1">query</code>) 입력 타입을 분리해 비대칭
              검색 품질을 확보했습니다.
            </li>
            <li>
              <b>무엇을 임베딩했나:</b> 조문 단위로{" "}
              <code className="rounded bg-zinc-100 px-1">[법령명 제N조] 제목 + 본문</code>을 문서
              임베딩해 Article 노드 속성으로 저장 — 법령명·조문번호를 텍스트에 포함시켜 &ldquo;
              전자상거래법 환불&rdquo; 같은 질의가 맥락으로 매칭되게 했습니다.
            </li>
            <li>
              <b>어디에 저장했나:</b> Neo4j 벡터 인덱스(코사인 유사도). 별도 벡터 DB를 두지 않은
              이유는 <b>&ldquo;벡터로 진입 → 그래프로 확장&rdquo;이 DB 하나에서 완결</b>되기
              때문입니다. 벡터 DB + 그래프 DB 이중 운영은 프로토타입에서 동기화 비용만 늘립니다.
            </li>
            <li>
              <b>재사용:</b> 같은 벡터 인덱스 기술로 <b>의미 캐시</b>(반복 법령 질문의 보고서
              재사용)도 구현했습니다 — 아래 5번 참고.
            </li>
          </ul>
        </Section>

        {/* 3. GraphRAG */}
        <Section title="3. 왜 GraphRAG인가 — 측정으로 답함" emoji="🕸️">
          <p className="mb-3 text-[13px] leading-relaxed text-[#4b4b4b]">
            단순 벡터 RAG는 질문과 유사한 조문 하나는 잘 찾지만, <b>완전한 답에 필요한
            원칙+예외+단서 조문 묶음</b>은 놓칩니다. 이 프로젝트는 벡터 검색으로 진입점을 찾고
            REFERS_TO 참조를 1홉 순회해 관련 조문을 함께 회수합니다. 자체 평가 하네스(
            <code className="rounded bg-zinc-100 px-1">npm run eval</code>, 17문항)로 측정한
            결과:
          </p>
          <Table
            head={["지표 (동일 벡터 예산, topK=4)", "벡터 단독", "GraphRAG"]}
            rows={[
              ["단일 조문 검색 recall (12문항)", "11/12 (92%)", "11/12 (92%)"],
              ["복합 질의 완전성 (5문항)", "2/5 (40%)", "5/5 (100%)"],
            ]}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-[#4b4b4b]">
            단일 조문 질문에서는 차이가 없습니다 — 정직하게 기록합니다. 가치는 복합 질의에서
            나타납니다. 예: &ldquo;개봉한 노트북 단순변심 환불 돼?&rdquo; → 벡터는 제17조
            제1항(원칙)만 잡지만, 그래프 확장은 제2항 각호(예외)와 단서(확인 개봉 제외), &ldquo;
            표시 없으면 철회 가능&rdquo;(예외의 예외)까지 회수해 3단 논리로 답합니다.
          </p>
        </Section>

        {/* 4. 멀티 에이전트 + 모델 전략 */}
        <Section title="4. 멀티 에이전트 구조와 모델 배치 — 비용은 측정으로" emoji="🤖">
          <p className="mb-3 text-[13px] leading-relaxed text-[#4b4b4b]">
            오케스트레이터에게 서브 에이전트는{" "}
            <code className="rounded bg-zinc-100 px-1">delegate_shopping</code> /{" "}
            <code className="rounded bg-zinc-100 px-1">delegate_law</code>라는 도구입니다
            (agent-as-tool). 역할별 시스템 프롬프트와 도구 부분집합으로 컨텍스트를 분리하고, 두
            영역이 섞인 질문은 같은 턴에 병렬 위임해 레이턴시를 줄입니다.
          </p>
          <Table
            head={["역할", "모델", "왜"]}
            rows={[
              [
                "오케스트레이터 (질문 분해·합성)",
                "Claude Sonnet 5 ($3/$15 per MTok)",
                "합성·표 작성은 Sonnet으로 충분 — Opus 4.8($5/$25) 대비 40%+ 절감, 품질 유지",
              ],
              [
                "쇼핑/법률 서브 에이전트 (조사)",
                "Claude Haiku 4.5 ($1/$5)",
                "도구 호출·요약 위주 작업 — 측정 결과 복합 질문 1건 $0.45→$0.09 (80% 절감)",
              ],
              [
                "인용 검증관 / 후속질문 생성",
                "Sonnet 5 (저 effort) / Haiku 4.5",
                "원문이 주어진 판별 과제라 최고 성능 모델이 불필요",
              ],
            ]}
          />
          <p className="mt-3 text-[13px] leading-relaxed text-[#4b4b4b]">
            추가로 <b>프롬프트 캐싱</b>(시스템 프롬프트+도구 정의)으로 반복 루프의 입력 비용을
            ~90% 절감합니다. 비교 수치는{" "}
            <code className="rounded bg-zinc-100 px-1">npm run bench</code>로 재현됩니다.
          </p>
        </Section>

        {/* 5. 의미 캐시 */}
        <Section title="5. 의미 캐시 — 캐시 키 설계가 핵심" emoji="⚡">
          <ul className="space-y-2 text-[13px] leading-relaxed text-[#4b4b4b]">
            <li>
              법령 질문은 표현만 다를 뿐 의미가 반복됩니다 (&ldquo;환불 며칠?&rdquo; ≈ &ldquo;
              청약철회 기간?&rdquo;). 질문 임베딩이 캐시된 질문과 코사인 유사도{" "}
              <b>0.88 이상</b>이면 법률 서브에이전트 루프 전체를 건너뜁니다.
            </li>
            <li>
              <b>임계값 0.88은 측정으로 결정:</b> 패러프레이즈 유사도 0.897~0.918 vs 다른 쟁점
              0.654~0.784 — 그 사이에 마진 ~0.11을 두고 보수적으로 잡았습니다 (법률 도메인의
              오답 캐시가 더 위험하므로).
            </li>
            <li>
              <b>캐시 키는 LLM이 생성한 검색어가 아니라 사용자 원 질문:</b> 초기에 가변적인 LLM
              질의를 키로 써서 히트율이 낮았고, 안정적인 사용자 입력으로 바꿔 실제 히트를
              달성했습니다.
            </li>
            <li>
              <b>신선도 2중 장치:</b> TTL 7일 + 법령 재수집(ingest) 시 캐시 전체 무효화 — 개정 전
              법령 기준 답변이 재사용되지 않습니다.
            </li>
          </ul>
        </Section>

        {/* 6. 신뢰성 */}
        <Section title="6. 신뢰성 — 그럴듯하지만 틀린 답을 막는 3중 검증" emoji="🛡️">
          <ul className="space-y-2 text-[13px] leading-relaxed text-[#4b4b4b]">
            <li>
              <b>① 결정론적 대조:</b> 보고서가 인용한 &ldquo;○○법 제N조&rdquo;가 이번 조사에서
              실제 그래프에서 검색된 조문 집합에 존재하는지 코드로 확인 — 검색되지 않은 조문
              인용(환각)을 기계적으로 탈락시킵니다.
            </li>
            <li>
              <b>② LLM 크리틱:</b> &ldquo;이 인용을 반박하라&rdquo;는 임무의 검증관이 조문 원문과
              주장을 대조. 실패 시 1회 자동 수정, 검증 자체가 죽으면 원본 폴백(단일 장애점 아님).
            </li>
            <li>
              <b>③ 최종 답변 검증:</b> 오케스트레이터가 합성 중 조문을 바꾸는 경우를 위해, 최종
              답변의 모든 인용을 이번 턴의 검색 조문 집합과 다시 대조하고 미확인 인용은 각주로
              정직하게 고지합니다.
            </li>
            <li>
              <b>프롬프트 인젝션 레드팀</b>(
              <code className="rounded bg-zinc-100 px-1">npm run redteam</code>): 후기·상품
              데이터에 공격 4종을 주입해 방어 ON/OFF 비교. 프로덕션 모델은 방어 없이도 4/4
              방어(negative result로 기록), 약한 모델에서 방어 효과 확인(1건→0건). 데이터
              경계 래핑 + 시스템 규칙의 다층 방어를 유지합니다.
            </li>
            <li>
              <b>PII 마스킹:</b> 카드·주민·전화·이메일을 로그 저장 전 마스킹.
            </li>
          </ul>
        </Section>

        {/* 7. 보안 */}
        <Section title="7. 서비스 보안 — 공개 데모의 공격면 최소화" emoji="🔒">
          <Table
            head={["위협", "방어"]}
            rows={[
              [
                "curl/봇 반복 호출로 API 크레딧 소진 (Denial of Wallet)",
                "IP당 분당 6회·일 100회 레이트리밋 (429 + Retry-After)",
              ],
              [
                "위조된 대화 히스토리·입력 토큰 폭탄",
                "zod 요청 스키마: 역할 제한, 메시지당 4,000자, 최대 24턴",
              ],
              [
                "공개 anon 키로 로그 열람·오염",
                "로그 읽기를 서버 라우트로 이전 + Supabase RLS로 anon SELECT 차단",
              ],
              [
                "오염된 보고서의 캐시 전파·구법령 답변",
                "캐시 TTL 7일 + ingest 시 전체 무효화, 검증 통과 보고서만 저장",
              ],
            ]}
          />
        </Section>

        {/* 한계 */}
        <Section title="8. 알고 있는 한계" emoji="⚖️">
          <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-[#4b4b4b]">
            <li>
              참조 파싱이 &ldquo;제N조&rdquo; 정규식 기반 — 타법 참조·준용 방향성 구분은 다음 단계
              (EXCEPTION_OF, APPLIES_MUTATIS_MUTANDIS 관계 세분화).
            </li>
            <li>평가셋 17문항·저자 작성 gold — 분쟁조정 사례 기반 확장과 LLM 저지 도입 여지.</li>
            <li>레이트리밋이 인메모리라 서버리스 인스턴스별 분리 — 프로덕션은 공유 저장소 필요.</li>
            <li>법률 자문이 아닌 일반 정보 안내이며, 답변에 해당 고지를 포함합니다.</li>
          </ul>
        </Section>

        <footer className="mt-8 border-t border-[#eaecef] pt-4 text-center text-[12px] text-[#767676]">
          (주)제로 사전과제 · 이창호 —{" "}
          <Link href="/" className="text-[#02b350] hover:underline">
            라이브 데모
          </Link>
          {" · "}
          <Link href="/admin" className="text-[#02b350] hover:underline">
            대시보드
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6 rounded-xl border border-[#eaecef] bg-white p-5">
      <h2 className="mb-3 text-[15px] font-bold">
        <span className="mr-1.5">{emoji}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {head.map((h) => (
              <th
                key={h}
                className="border-b border-[#eaecef] bg-[#f7f8fa] px-3 py-2 text-left font-semibold text-zinc-600"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-[#f1f3f5] px-3 py-2 align-top text-[#4b4b4b]">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
