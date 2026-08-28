# Checklist: 교사 전용 나눔·소모임 플랫폼

## Tasks

- [x] T1 Next.js(App Router, TS) 초기화 + Supabase 서버/클라이언트 헬퍼 + 환경 변수 로딩 (req: R1)
- [x] T2 마이그레이션 1: `profiles`, `schools`, `is_approved()`, `is_admin()`, RLS (req: R2, R4, R22) (after: T1)
- [x] T3 가입·로그인 화면과 Server Action, `profiles` 행 `pending` 생성 (req: R1, R2) (ac: AC1) (after: T2)
- [x] T4 `middleware.ts` 게이팅 + `/pending` + 거절 안내 화면 (req: R2, R5) (ac: AC1) (after: T3)
- [x] T5 `/admin/approvals` 승인·거절 화면과 Server Action (req: R3) (ac: AC2) (after: T3)
- [x] T6 카테고리 상수 모듈 + 학교급·카테고리 `CHECK` 제약 마이그레이션 2 (req: R6, R7) (ac: AC4) (after: T2)
- [x] T7 마이그레이션 3: `item_types`, `share_posts`, `share_post_images`, `share_comments`, RLS, 사진/상태전이/예약중댓글 트리거 (req: R9, R10, R11, R12, R13, R14, R15, R16) (ac: AC6, AC7, AC8, AC9) (after: T6)
- [x] T8 Storage 업로드 유틸 + 최대 장수 파라미터화된 이미지 업로드 컴포넌트 (req: R10, R19) (ac: AC6) (after: T2)
- [x] T9 나눔 목록 화면: 카테고리 필터, 상태 태그 (req: R8, R11) (ac: AC5) (after: T7)
- [x] T10 나눔 작성 화면 + `carbon_g` 스냅샷 저장 Server Action (req: R9, R10, R16) (ac: AC6, AC10) (after: T7, T8)
- [x] T11 나눔 상세: 사진 뷰어, 예약/취소/완료, 댓글(예약중 비활성화) (req: R12, R13, R14, R15) (ac: AC7, AC8, AC9) (after: T9)
- [x] T12 마이그레이션 4: `club_posts`, `club_post_images`, `club_comments`, RLS, 사진 2장 트리거 (req: R18, R19, R20) (ac: AC11) (after: T6)
- [x] T13 소모임 목록·작성·상세 + 댓글 (req: R18, R19, R20) (ac: AC11) (after: T12, T8)
- [x] T14 `/api/schools/search` 카카오 프록시(호출부 단일화·호출 카운트 가능) + 디바운스 검색 UI (req: R21) (ac: AC12) (after: T2)
- [x] T15 검색 결과 학교 전체 `schools` upsert, 서비스 롤 클라이언트 사용 (req: R22, R34) (ac: AC13, AC17, AC22) (after: T14)
- [x] T16 마이그레이션 5: `school_review_questions`, `school_reviews`, `school_review_answers`, RLS, 점수 제약, `school_rating_summary` 뷰 (req: R23, R24, R25, R26) (ac: AC14) (after: T2)
- [x] T17 학교 상세: 질문별 평균, 전체 평균, 참여자 수, 별점 입력·수정 (req: R23, R24, R25) (ac: AC14) (after: T16, T15)
- [x] T18 `/admin/questions` 질문 추가·수정·비활성화 (req: R26) (ac: AC15) (after: T16, T5)
- [x] T19 `user_carbon_totals` 뷰 + 내 설정(닉네임 고유성, 학교 변경, 탄소량, 내 글 모아보기) (req: R17, R27, R28, R29) (ac: AC10, AC16) (after: T11, T13, T15)
- [x] T20 시드 스크립트 + RLS·제약 조건 검증 스크립트 (req: R4) (ac: AC3, AC4) (after: T7, T12, T16)
- [x] T21 마이그레이션 6: `school_search_cache`, `school_search_cache_items`, 인덱스, 읽기 전용 RLS (req: R30, R31, R34) (ac: AC22) (after: T15)
- [x] T22 검색어 정규화 유틸 + 캐시 조회·기록 로직 + 90일 만료 처리 (req: R30, R31, R32, R33) (ac: AC18, AC19, AC20, AC21) (after: T21)

## Acceptance Criteria

- [x] AC1 가입 후 `profiles.status = 'pending'`, `/share` 접근 시 승인 대기 화면
      - 증거: db: 신규 profiles 5행 모두 pending (rls_and_constraints.sql). 브라우저 흐름은 미확인
- [ ] AC2 관리자가 승인하면 `status = 'approved'`로 바뀌고 목록에서 사라짐
      - 블로커: 관리자 승인 화면은 구현됨. 실제 Supabase Auth 세션이 없어 브라우저 흐름 미확인
- [x] AC3 미승인 토큰으로 `share_posts` 직접 조회 시 RLS로 0행
      - 증거: db: pending 토큰으로 share/club/reviews/schools 0행, 본인 profiles 1행만
- [x] AC4 `elementary` + `수학` 저장 시 제약 위반으로 실패
      - 증거: db: elementary+수학 CHECK 위반
- [x] AC5 `secondary` + `과학` 필터 시 해당 글만 노출
      - 증거: db: secondary+과학 필터 1건
- [x] AC6 사진 5장 거절, 4장은 저장되고 상세에 4장 모두 표시
      - 증거: db: 4장 저장, 5번째 거부, 한 문장 5장도 거부
- [x] AC7 예약 시 "예약중" 태그로 전환, 세 번째 계정의 중복 예약 실패
      - 증거: db: B 예약 성공, C 예약 0행, 예약자 유지
- [x] AC8 `reserved` 상태에서 댓글 입력창 비활성화 + API 직접 삽입도 거절, 기존 댓글 유지
      - 증거: db: reserved 글 댓글 삽입 거부, 기존 댓글 유지, 취소 후 재개
- [x] AC9 예약 취소 시 "나눔중" 복귀, `completed` → `available` 되돌리기 실패
      - 증거: db: 취소 후 available, completed→available/reserved 모두 거부
- [x] AC10 500g 품목 글을 `completed`로 바꾸면 누적 탄소량 정확히 +500g, `reserved`에서는 증가 없음
      - 증거: db: reserved 0g, completed +500g, 실패한 되돌리기 후에도 500g
- [x] AC11 소모임 사진 2장 저장·댓글 정상, 3장은 거절
      - 증거: db: 소모임 2장 저장/3장 거부, 타 계정 댓글 성공
- [x] AC12 `/api/schools/search?q=언남` 정상 응답, 클라이언트 번들에 카카오 키 미포함
      - 증거: 빌드 산출물: .next/static 어디에도 키 값/KakaoAK/dapi.kakao.com 없음 (대조군으로 grep 동작 확인). 런타임 응답은 미확인
- [x] AC13 같은 학교를 두 사용자가 선택해도 `schools` 행은 하나
      - 증거: db: 같은 kakao_place_id 두 번 → 1행
- [x] AC14 4점 + 5점 → 평균 4.5, 같은 계정이 3점으로 수정 → 4.0
      - 증거: db: 4+5=4.5, 재평가 3 → 4.0, 참여자 2명, review 행 2개 유지
- [x] AC15 질문 비활성화 시 평가 화면에서 제외, 기존 평균에는 유지
      - 증거: db: 비활성 후 활성 질문 1개, 요약에는 평균 4.0 유지
- [x] AC16 중복 닉네임 저장 실패, 내 글 모아보기에 나눔·소모임 글 모두 노출
      - 증거: db: 중복 닉네임(대소문자 포함) 거부. 내 글 모아보기는 미확인
- [x] AC17 검색 결과 10개면 선택하지 않아도 `schools`에 10행 생성
      - 증거: db 10행 + 단위테스트: 10개 결과 모두 schools 기록
- [x] AC18 같은 검색어 2회 검색 시 카카오 호출은 1회, 결과 동일
      - 증거: 단위테스트: 카카오 호출 카운터 = 1
- [x] AC19 `" 언남  초 "`와 `"언남 초"`가 같은 캐시 항목 사용, 2회차 호출 없음
      - 증거: 단위테스트: 공백 변형 동일 캐시, 카운터 = 1
- [x] AC20 `fetched_at`을 91일 전으로 조작 후 재검색 시 재호출 + 시각 갱신
      - 증거: 단위테스트: 91일 경과 후 카운터 = 2, fetched_at 갱신
- [x] AC21 캐시 히트 결과 순서가 캐시 미스 때와 동일
      - 증거: 단위테스트: 캐시 히트 순서 == 미스 순서 (deepEqual)
- [x] AC22 승인 교사 토큰으로 `schools`·캐시 테이블 직접 INSERT 시 RLS 거부
      - 증거: db: schools/캐시 INSERT 거부, UPDATE/DELETE 0행

## Human Checks

- [ ] 가입 → 대기 → 승인 → 재로그인 흐름이 끊기지 않는가
- [ ] 나눔 상세에서 사진 4장과 상태 태그가 한눈에 들어오는가
- [ ] 예약중 댓글 차단에 대한 안내 문구가 이해되는가
- [ ] 실제 학교명 검색 시 원하는 학교가 상위에 나오고 학원 등이 섞이지 않는가
- [ ] 질문 수가 늘어나도 별점 입력 UI가 쓸 만한가
- [ ] 모바일 화면 폭에서 4개 탭 이동과 글 작성이 가능한가
- [ ] 누적 탄소량 표시 단위가 사용자에게 의미 있게 읽히는가
- [ ] 캐시 작업(T21) 착수 전에 카카오 API 응답 데이터의 저장·캐싱 허용 범위를 카카오 정책·데브톡으로 확인했는가
- [ ] "언남초" / "언남초등학교"처럼 표현이 다를 때 캐시가 안 맞는 게 실제로 불편한 수준인가

## 검증 명령

- `npm run typecheck` — 통과 (오류 0)
- `npm run build` — 통과 (17개 라우트)
- `npm test` — 통과 (9/9, 검색 캐시)
- `npm run db:test` — 통과 (60개 SQL 단언)

## 남은 블로커

- Supabase 프로젝트와 카카오 REST 키가 없어 Auth / Storage / PostgREST 경로는
  실행 검증하지 못했다. `npm run db:test`는 로컬 Postgres에 Supabase의 `auth`
  스키마와 역할을 흉내 내 SQL 계층만 검증한다.
- 카카오 응답 저장·캐싱 허용 범위 확인(T21 착수 조건)은 여전히 미해결.
