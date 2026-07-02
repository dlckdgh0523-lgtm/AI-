import { XMLParser } from "fast-xml-parser";

const BASE = "http://www.law.go.kr/DRF";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

/** 법령 검색 — 법령명으로 MST(법령 마스터 번호) 조회 */
export async function searchLaw(query: string) {
  const url = `${BASE}/lawSearch.do?OC=${process.env.LAW_API_OC}&target=law&type=XML&query=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawSearch failed: ${res.status}`);
  const xml = await res.text();
  const doc = parser.parse(xml);
  const items = doc?.LawSearch?.law;
  if (!items) throw new Error(`법령 검색 결과 없음: ${query}\n${xml.slice(0, 500)}`);
  return Array.isArray(items) ? items : [items];
}

/** 법령 본문 조회 — MST로 전체 조문 XML 획득 */
export async function fetchLawBody(mst: string) {
  const url = `${BASE}/lawService.do?OC=${process.env.LAW_API_OC}&target=law&type=XML&MST=${mst}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lawService failed: ${res.status}`);
  const xml = await res.text();
  return parser.parse(xml);
}

export interface ParsedArticle {
  articleNo: string; // 예: "제17조"
  title: string; // 조문제목
  content: string; // 조문 전체 텍스트 (항·호 포함)
  paragraphs: { no: string; content: string }[];
  references: string[]; // 본문에서 발견된 "제N조" 참조
}

/** 법령 XML에서 조문 배열 추출 (실데이터 확인 후 필드명 조정 필요할 수 있음) */
export function parseArticles(lawDoc: unknown): ParsedArticle[] {
  const doc = lawDoc as Record<string, any>;
  const law = doc?.법령;
  if (!law) throw new Error("법령 루트 노드를 찾을 수 없음");

  const rawUnits = law?.조문?.조문단위;
  if (!rawUnits) throw new Error("조문단위를 찾을 수 없음");
  const units = Array.isArray(rawUnits) ? rawUnits : [rawUnits];

  const articles: ParsedArticle[] = [];
  for (const u of units) {
    // 조문여부가 "전문"인 항목(장·절 제목)은 건너뜀
    if (u?.조문여부 && u.조문여부 !== "조문") continue;

    const articleNo = `제${u?.조문번호 ?? ""}조`;
    const title = String(u?.조문제목 ?? "");
    const bodyParts: string[] = [String(u?.조문내용 ?? "")];

    const paragraphs: { no: string; content: string }[] = [];
    const rawParas = u?.항;
    if (rawParas) {
      const paras = Array.isArray(rawParas) ? rawParas : [rawParas];
      for (const p of paras) {
        const pContent: string[] = [String(p?.항내용 ?? "")];
        const rawItems = p?.호;
        if (rawItems) {
          const items = Array.isArray(rawItems) ? rawItems : [rawItems];
          for (const item of items) {
            pContent.push(String(item?.호내용 ?? ""));
          }
        }
        const joined = pContent.filter(Boolean).join("\n");
        paragraphs.push({ no: String(p?.항번호 ?? ""), content: joined });
        bodyParts.push(joined);
      }
    }

    const content = bodyParts.filter(Boolean).join("\n");
    // "제N조" / "제N조의M" 형태 참조 추출 (자기 자신 제외)
    const refs = [...new Set(
      [...content.matchAll(/제(\d+)조(의\d+)?/g)].map((m) => m[0])
    )].filter((r) => r !== articleNo);

    articles.push({ articleNo, title, content, paragraphs, references: refs });
  }
  return articles;
}
