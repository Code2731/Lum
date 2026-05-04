# LUM — Code Intelligence 고도화 전략 (Phase 137~143)

작성일: 2026-05-04
선행: `NEXT_PHASES.md` (Phase 129~136, 자연어→도구 실행 격차)
대상 실행자: Codex (또는 후속 Claude 세션)

이 문서는 **R_AND_D_ITEMS.md §2 (Advanced Code Intelligence)** 의 단기 실행 계획입니다. NEXT_PHASES.md(자연어 표면)와 직교 — 병렬 진행 가능.

---

## 0. 진단 — 가장 중요한 발견

`src-tauri/src/commands/repo_map.rs:1-330` 감사 결과:

> **LUM은 이미 tree-sitter 0.23 + 4개 언어 grammar(Rust/TS-TSX/JS/Python) + Aider 스타일 PageRank(damping=0.85, 20 iter)가 구현되어 있다.**

`Cargo.toml:60-64` 의존성 + `repo_map.rs:20-270`의 `Symbol { name, kind, file, line }` + `build_graph_and_rank()` BFS PageRank 모두 동작. 외부 리서치에서 "1주짜리 흉내내기 우선순위 1번"으로 권한 기법이 **이미 절반 완성**.

따라서 진짜 격차는 좁혀짐:

| 영역 | 현 상태 | 갭 | 우선도 |
|---|---|---|---|
| 청킹 | 고정 600자 + 100자 overlap (`rag.rs:9-10`) | 함수/클래스 경계 무시 → 검색 정밀도 손실 | 높음 |
| 인덱싱 트리거 | 수동 `index_project` 전체 재색인 (`rag.rs:137-222`) | mtime/notify 미사용, 증분 0 | 높음 |
| 검색 | cosine > 0.5 단일 (`rag.rs:243`), 재순위 없음 | 식별자 정확매칭 부재 (`parse_url` 같은 검색 약함) | 높음 |
| ReAct 도구 | grep만 가능, semantic codebase 검색 ✗ (`react_agent.rs:81-96`) | "auth 관련 함수 찾아줘" → shell+grep만 | **즉시 닫힘** |
| 호출 그래프 | 파일 수준 PageRank만 (`repo_map.rs:199`) | "이 함수 caller 전체" multi-hop 불가 | 중간 |
| Repo Map 컨텍스트 | active_file 가중치 X | Aider personalized PageRank 미적용 | 중간 |
| Reference 정밀도 | tree-sitter syntax만 | 동명이인 함수 분리 불가 (Foo::bar resolution X) | 낮음 |

**충격 발견 #2**: `react_agent.rs`의 도구 목록에 `query_codebase`가 없음. ReAct가 코드베이스를 의미 검색하려면 `shell + grep`만 가능. `rag.rs::search_codebase` Tauri 커맨드는 *프론트엔드에서만* 호출됨. 1일짜리 작업으로 즉시 닫힘.

---

## 1. 전략 — 2단계 7 페이즈

### Stage A — 좁혀진 핵심 격차 (1.5~2주, Phase 137~140)
저비용·즉시 효과. 기존 인프라(tree-sitter + PageRank) 그대로 활용.

### Stage B — 차별화 레이어 (2~4주, Phase 141~143)
호출 그래프 multi-hop, 정밀 reference, 시각화. 진짜 모트.

---

## 2. Phase 137 — AST 기반 청킹 + ReAct semantic 검색 도구 (1주)

**근거**: 가장 ROI 높은 묶음. 기존 tree-sitter를 `rag.rs`에 끌어와 600자 고정 청킹을 함수/클래스 경계로 교체 + ReAct가 의미 검색을 직접 호출.

### 2-A. AST 청킹 (3-4일)
- **변경**: `src-tauri/src/commands/rag.rs:170-200` 청킹 루프
- 신규 fn `chunk_by_ast(content, lang) -> Vec<(String, usize)>`:
  - tree-sitter Query로 함수/클래스/메서드 노드 추출 (이미 `repo_map.rs:51-92`에 정의 쿼리 존재 — 그대로 재사용)
  - 각 노드 byte_range 슬라이스 → 청크
  - 함수 사이 코드(top-level imports, const, comment)는 별도 "module_header" 청크
  - 임계 초과 함수(>2000자)는 함수 내부에서 600자 fallback 청킹
- 비지원 언어(Go/C++/Java/Ruby 등)는 기존 600자 fallback 유지
- 임베딩 키에 `kind` 메타 추가: `[fn:foo|src/bar.rs]\n<body>`

### 2-B. `query_codebase` ReAct 도구 (1일)
- **변경**: `src-tauri/src/commands/react_agent.rs:81-96` BASE_PROMPT + `parse_action` + `run_tool`
- 신규 ACTION:
  ```
  - query_codebase(query, limit?) — 코드베이스 의미 검색 (top-K 청크)
  ```
- 내부 호출: `commands::rag::search_codebase(query, limit.unwrap_or(5))` 직접 invoke
- 결과 truncation: 기존 `TOOL_OUTPUT_LIMIT=4000` 적용
- 회귀 가드 3건: 도구 등록 / 결과 truncation / 인덱스 미생성 시 에러 메시지

### 2-C. 증분 인덱싱 (2-3일)
- **변경**: `src-tauri/src/memory.rs` 또는 신규 `commands/index_state.rs`
- 인덱스 영속에 `file_mtime: HashMap<PathBuf, SystemTime>` 추가
- `index_project` 진입 시 mtime 비교 → 변경된 파일만 재청킹·재임베딩
- 삭제된 파일의 청크는 인덱스에서 제거
- 초기화는 첫 호출 시 mtime 맵 비어있어 자연스럽게 전체 인덱싱

### 수용 기준
- [ ] AST 청킹: 1000줄 Rust 파일 → 함수당 1청크 + module_header 1청크 검증.
- [ ] query_codebase: ReAct 시나리오 "encoding 관련 함수 찾아" → 실제 함수 청크 5개 반환.
- [ ] 증분: 1파일 수정 후 reindex → 해당 파일 청크만 교체, 나머지 unchanged.
- [ ] `cargo test` 회귀 가드 8건 (AST 청킹 4 + query_codebase 3 + 증분 1).

### 주의
- 기존 인덱스 호환성 — 첫 시작 시 청크 형식 다르면 자동 재인덱싱 트리거.
- 임베딩 호출 비용 — 증분이 핵심. 풀 reindex는 1만 파일급에서 분 단위 소요.

---

## 3. Phase 138 — BM25 + Dense + RRF 하이브리드 검색 (1~1.5주)

**근거**: dense 단독은 식별자 정확매칭(`parse_url`, `JWT_SECRET`)에서 BM25/trigram에 압도적 패배. 2026 표준은 RRF 융합.

### 변경 범위
- **의존성**: `tantivy = "0.22"` (Rust 네이티브 BM25, 임베디드, 1.0 안정)
- 신규 `src-tauri/src/commands/index_lexical.rs`
  - `LexicalIndex` — tantivy로 청크 텍스트+심볼명+파일경로 색인
  - `search_lexical(query, limit)` BM25 score 반환
- `rag.rs::search_codebase` 수정:
  - 1) dense top-20 + lexical top-20 병렬 호출
  - 2) RRF: `score(d) = Σ 1/(60 + rank_r(d))`
  - 3) 융합 후 limit 자르기
- 토글: `commands/config.rs`에 `rag_lexical_enabled: bool` 기본 `true`

### 수용 기준
- [ ] "JWT_SECRET" 검색 시 정확 식별자 매칭이 top-3에 들어옴 (dense 단독 실패 검증).
- [ ] "auth 관련 함수" 검색 시 dense top-5와 결과 거의 동일 (semantic 우세 케이스 회귀 X).
- [ ] tantivy 인덱스 영속 (`~/.lum_lexical/`), 증분 업데이트 동기화.
- [ ] 회귀 가드 5건.

### 주의
- tantivy는 별도 디스크 인덱스 — 청크 변경 시 dense + lexical 둘 다 갱신 필요. 트랜잭션은 best-effort (실패 시 reindex 권장 메시지).
- BM25 토큰화는 코드용 커스텀 — `_`/`.`/`::`/`->` 분리해 식별자 partial 매칭.

---

## 4. Phase 139 — 호출/import 그래프 + multi-hop 도구 (1~1.5주)

**근거**: "이 함수 변경이 영향 미치는 모든 호출처" 가 LUM 차별화 1순위 질의. 기존 PageRank는 파일 수준이라 *함수→함수* call edge가 없음.

### 변경 범위
- **의존성**: 기존 petgraph 0.6 (이미 `repo_map.rs:5`에서 사용 중) 그대로
- 신규 `src-tauri/src/commands/call_graph.rs`
  - `CallGraph { fn_nodes: HashMap<SymbolId, NodeIndex>, edges: Vec<(caller, callee)> }`
  - tree-sitter `call_expression` query 강화 — 호출자 컨텍스트(어느 함수 안인지) 추적
  - `find_callers(symbol_name) -> Vec<{file, fn_name, line}>` BFS 1-hop
  - `find_callees(symbol_name) -> Vec<...>`
  - `trace_dependents(symbol_name, depth=3)` multi-hop BFS — 변경 영향도 분석
- 영속: `~/.lum_call_graph.bin` (bincode + petgraph serde)
- ReAct 도구 신규 3종:
  ```
  - find_callers(symbol)
  - find_callees(symbol)
  - trace_dependents(symbol, depth?)
  ```

### 수용 기준
- [ ] `validate_safe_path` 함수의 callers를 정확히 찾음 (`react_agent.rs` 내 호출 다수).
- [ ] depth=3 dependents가 BFS로 트리 형태 반환.
- [ ] 동명이인 함수는 결과에 `module_path` 명시 + 사용자에게 모호성 경고.
- [ ] 회귀 가드 6건.

### 주의 — 정직한 한계
- tree-sitter는 syntax 파서 — `Foo::bar()` 호출의 `Foo`가 어떤 타입인지 resolve 못 함. **반드시 결과에 "동명이인 가능성" 디스클레이머 표시**.
- 정밀 reference가 필요하면 Phase 142 (SCIP 외부 인덱서 옵트인)로 이관.
- import 추적은 언어별 패턴 다양 — 첫 릴리스는 Rust(`use`) + TS(`import`) + Python(`from/import`) 3종만.

---

## 5. Phase 140 — Repo Map v2: active_file personalized PageRank (3-4일)

**근거**: Aider repo-map의 핵심은 *현재 작업 파일 + 채팅 언급 식별자에 가중치 부여*. 현 LUM PageRank는 균등 weight라 컨텍스트 활용도 낮음.

### 변경 범위
- **변경**: `src-tauri/src/commands/repo_map.rs:199-270` `build_graph_and_rank`
- 시그니처에 `active_file: Option<&Path>` + `mentioned_symbols: &[String]` 추가
- Personalized PageRank:
  - active_file 노드 personalization 50.0
  - mentioned_symbols 매칭 노드 10.0
  - 잘 명명된 식별자(snake_case 3+ 토큰 / CamelCase 2+ 토큰) 1.5
  - 그 외 1.0
- `stream_ai_command`(ai.rs L689 근처)에서 active_file 전달, prompt에서 mentioned 식별자 추출(`\b[A-Z][a-zA-Z]+|\b[a-z]+(_[a-z]+)+`)
- 토큰 예산은 기존 4096 유지

### 수용 기준
- [ ] active_file 가중치 적용 시 해당 파일의 심볼이 결과 상위로 이동.
- [ ] mentioned_symbols=["validate_safe_path"] 전달 시 그 함수 정의·호출처 우선 표시.
- [ ] 회귀 가드 4건.

---

## 6. Phase 141 — Semantic History/Healing Graph 시각화 (1~2주)

**근거**: `R_AND_D_ITEMS.md §2.2`. 시맨틱 히스토리는 데이터로는 있으나 시각화 없음. 사용자가 "내 명령 패턴/거부 케이스 패턴"을 그래프로 봐야 큐레이션 가능.

### 변경 범위
- **의존성 (프론트)**: `reactflow` 또는 `react-force-graph-2d`
- 신규 `src-tauri/src/commands/history_graph.rs`
  - history 명령들의 임베딩 cosine 매트릭스 → MST(minimum spanning tree)로 토폴로지 구성
  - 클러스터(community) 자동 라벨링 — 첫 명령 + frequent token
- 신규 `src/components/HistoryGraphPanel.tsx`
  - force-directed 그래프, 노드=명령, 엣지=유사도, 클러스터 색상
  - healing reject도 동일 그래프에 다른 노드 종류로 오버레이
- 토글 UI: `Ctrl+R` 시맨틱 히스토리 패널에 "그래프 뷰" 탭 추가

### 수용 기준
- [ ] 100개 명령 history → 5-15개 클러스터 자동 형성.
- [ ] healing reject 노드는 빨간 색·아이콘 구분.
- [ ] 노드 클릭 → 명령 재실행/healing 상세 모달.

### 주의
- 1만+ 명령 시 force-direct 성능 저하 — 노드 cap 500 + LRU.
- 클라우드 제품엔 없는 기능 — 로컬 데이터 시각화는 LUM 모트 강화.

---

## 7. Phase 142 — SCIP 외부 인덱서 옵트인 (1~3달, 후순위)

**근거**: tree-sitter는 syntax-only. 정밀 reference resolution은 SCIP/LSP 영역. Rust/Go/TypeScript는 SCIP 인덱서가 stable.

### 변경 범위 (스케치)
- 사용자 PATH에 `scip-rust` / `scip-typescript` / `scip-go` 있으면 자동 감지
- worktree 진입 시 백그라운드 인덱싱 (`scip-rust index --output .lum_scip/index.scip`)
- `commands/scip.rs` — protobuf 디코더 + symbol/reference/definition lookup
- ReAct 도구: `precise_callers`/`precise_definition` (tree-sitter 기반의 정밀 버전)
- Phase 139의 모호성 경고가 자동 해소되는 경우 우선순위 표시

### 수용 기준 (개략)
- [ ] SCIP 인덱서 미설치 환경: 기능 비활성, tree-sitter fallback.
- [ ] 설치 환경: 동명이인 함수 호출자 분리 정확.
- [ ] 인덱싱 시간: 100k LOC Rust 1분 이내.

### 주의
- 큰 투자 — Phase 137~140 효과 측정 후 진입 결정.
- Squad worktree마다 별도 인덱스 → 디스크 사용 폭증 가능.

---

## 8. Phase 143 — GraphRAG flat (코드 도메인 LightRAG 변형) (3-4주, 큰 투자)

**근거**: Phase 139가 호출 엣지 관계라면, Phase 143은 *모듈/기능 단위 의미 클러스터링*. "이 repo의 핵심 모듈 5개" 같은 전역 요약 질의.

### 변경 범위 (스케치)
- LightRAG 패턴: entity=모듈/함수, relationship=호출/import, **community summarization 생략** (비용 회피)
- entity 추출은 LLM이 아닌 결정적 — tree-sitter 심볼 + docstring
- 그래프 트래버설 + dense 검색 RRF 융합
- 영속: petgraph 인메모리 + `~/.lum_graph_rag.bin` (Phase 139와 동일 인프라 재사용)

### 수용 기준 (개략)
- [ ] "이 repo에서 인증 흐름 어떻게 돼?" 질의 → 관련 모듈/함수/엣지를 다이어그램+자연어로 설명.
- [ ] 비용: 인덱싱 시 LLM 호출 0건 (entity는 syntactic 추출, summary는 검색 시점 on-demand 1회).
- [ ] 일반 RAG 대비 multi-hop 질의 정확도 +20pp.

### 주의 — 강력한 옵션, 큰 투자
- 풀 GraphRAG (Microsoft 방식)은 corpus당 LLM 토큰 비용 4자리 달러 — LUM 정체성과 충돌. **반드시 LightRAG/flat 버전만**.
- Phase 139 호출 그래프가 잘 동작한 뒤 진입 권장.

---

## 9. 하지 말 것

- **Microsoft GraphRAG 풀 파이프라인 채택** — community summarization으로 LLM 토큰 비용 폭증. flat graph만.
- **LSP daemon 임베드 (rust-analyzer 인프로세스)** — 메모리·CPU 폭증. SCIP CLI spawn이 정답.
- **KuzuDB 1.0 미만에 코어 의존** — schema migration 깨짐 위험. petgraph + bincode가 안전.
- **tree-sitter만으로 정밀 reference 시도** — syntax 파서이지 resolver가 아니다. 동명이인 false positive를 사용자에게 솔직히 표시.
- **벡터 검색만으로 식별자 검색** — `parse_url` 같은 정확 매칭은 BM25 압도. RRF 없이 dense 단독은 안티패턴.

---

## 10. 우선순위 추천

**가장 ROI 높은 묶음**: Phase **137 (AST 청킹 + query_codebase + 증분) + 138 (BM25 RRF) + 140 (personalized PageRank)**.

합쳐 2~3주, "코드 인텔리전스 정밀도" 격차의 *80%* 닫음.

**가장 작게 시작 가능한 Phase**: **137-B (`query_codebase` ReAct 도구, 1일)**. ReAct가 의미 검색을 직접 못 하는 게 가장 큰 즉시 격차 — 1일 작업으로 즉시 닫힘.

**의존 관계**:
- 137-A (AST 청킹) → 138 (BM25는 청크 단위 색인)
- 137-C (증분) → 138 (lexical 인덱스도 증분 동기)
- 139 (call graph) → 142 (SCIP), 143 (GraphRAG flat)
- 140 (personalized PageRank)는 독립
- 141 (시각화)은 독립

**NEXT_PHASES.md와의 직교성**:
- Phase 129~136 (자연어→도구 표면)과 137~143은 다른 축. 병렬 실행 가능.
- 단 Phase 130-A (desktop 노출, 1일) 같은 micro-phase 먼저 처리 권장 — 사용자 체감 즉시.

---

## 11. 검증된 알고리즘 레퍼런스

각 페이즈가 채택할 정확한 출처:

| Phase | 알고리즘 | 출처 |
|---|---|---|
| 137-A | AST 함수/클래스 경계 청킹 | Cursor codebase indexing (tree-sitter 또는 ~500 토큰) |
| 138 | RRF k=60 | OpenSearch RRF reference, `score = Σ 1/(60+rank)` |
| 139 | tree-sitter call_expression query | 기존 `repo_map.rs:95-120` 확장 |
| 140 | Personalized PageRank weights | Aider repo-map (active 50x, mentioned 10x, well-named 10x) |
| 142 | SCIP protobuf | github.com/sourcegraph/scip |
| 143 | LightRAG flat graph | Maarga 2025-05 비교 분석 (community 제거 변형) |

---

## 12. Codex 핸드오프 가이드

이 문서로 작업 시작:

1. **현 상태 확인**: `git log --oneline | head -10` — Phase 128(`958f05b`)이 최신인지 + `NEXT_PHASES.md` 내용 인지.
2. **선택**: 위 Phase 중 하나 선택. **137-B(`query_codebase` 도구)가 1일 시작점**.
3. **검증**: 해당 Phase의 "변경 범위" 파일들을 `Read`로 확인. 코드 drift 가능.
4. **회귀 가드 먼저**: 수용 기준 테스트를 *코드 작성 전* 작성 (TDD).
5. **단일 Phase = 단일 커밋**: `feat: Phase 13X — 제목 (요약)` 패턴.
6. **CLAUDE.md 갱신 필수**: Backend 섹션에 새 항목 + Key Conventions 규약 명시.
7. **양 테스트 통과**: `cd src-tauri && cargo test` + `npm test`.

---

## 13. 부록 — 외부 리서치 핵심 출처

- [Tree-sitter crate (305+ langs)](https://crates.io/crates/tree-sitter)
- [Aider repo-map (PageRank 알고리즘)](https://aider.chat/2023/10/22/repomap.html)
- [Microsoft GraphRAG 비용 분석](https://www.maargasystems.com/2025/05/12/understanding-graphrag-vs-lightrag-a-comparative-analysis-for-enhanced-knowledge-retrieval/)
- [LightRAG (community-free 변형)](github.com/HKUDS/LightRAG)
- [petgraph serde 영속](https://docs.rs/petgraph/latest/src/petgraph/graph_impl/serialization.rs.html)
- [SCIP (Sourcegraph)](https://github.com/sourcegraph/scip)
- [Tantivy (Rust BM25)](https://github.com/quickwit-oss/tantivy)
- [Hybrid Search RRF (OpenSearch)](https://opensearch.org/blog/introducing-reciprocal-rank-fusion-hybrid-search/)
- [Cursor codebase indexing (Towards Data Science)](https://towardsdatascience.com/how-cursor-actually-indexes-your-codebase/)

내부 감사 인용:
- `src-tauri/src/commands/repo_map.rs:1-330` — 이미 tree-sitter+PageRank
- `src-tauri/src/commands/rag.rs:9-10, 137-247` — 청킹·검색 한계
- `src-tauri/src/commands/react_agent.rs:81-96` — `query_codebase` 부재
- `src-tauri/Cargo.toml:60-64` — tree-sitter 0.23 + 4 grammar
- `src-tauri/src/memory.rs:18-31` — 인덱스 영속, 증분 미지원
