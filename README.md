# 솔방울 (shareSchool)

승인된 현직 교사만 이용하는 나눔·모임·게시판 플랫폼. 구현 계약서는 `prdFile/prd.md`.

## 스택

- Next.js 15 (App Router) + React 19 + TypeScript
- Supabase (Postgres, Auth, Storage) — ORM 없이 `@supabase/supabase-js` + `@supabase/ssr`
- 카카오 로컬 REST API (키워드 장소 검색, `category_group_code=SC4`)

## 설정

### 1. 사전 작업 (PRD `Pre-Work`)

1. Supabase 프로젝트 생성. Auth → Email 제공자 활성화, confirm email 켜기.
2. Storage 버킷 `share-images`, `club-images`를 **비공개**로 생성.
   `supabase/migrations/0008_storage.sql`이 버킷과 정책을 만들어 주므로,
   마이그레이션을 적용하면 수동 생성은 필요 없다.
3. 카카오 개발자 콘솔에서 REST API 키와 JavaScript 키를 확인하고, Web 플랫폼 도메인을 등록.
4. `.env.example`을 `.env.local`로 복사해 값을 채운다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # 서버 전용
KAKAO_REST_API_KEY=          # 서버 전용. NEXT_PUBLIC_ 접두사 금지
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY= # 카카오맵 JavaScript SDK용 공개 키
```

### 2. 마이그레이션

`supabase/migrations/`의 SQL을 번호순으로 적용한다.

```bash
supabase db push          # 또는 대시보드 SQL 에디터에 순서대로 붙여넣기
psql "$DATABASE_URL" -f supabase/seed.sql   # 품목 유형 + 기본 평가 질문
```

| 파일 | 만드는 것 |
| --- | --- |
| `0001_profiles_schools.sql` | `schools`, `profiles`, `is_approved()`, `is_admin()`, `nickname_available()`, 가입 트리거, 권한 상승 차단 트리거, RLS |
| `0002_categories.sql` | `is_valid_category()`, `touch_updated_at()` |
| `0003_share.sql` | `item_types`, `share_posts`, `share_post_images`, `share_comments` + 사진 개수·상태 전이·예약중 댓글 트리거 + RLS |
| `0004_clubs.sql` | `club_posts`, `club_post_images`, `club_comments` + 사진 2장 트리거 + RLS |
| `0005_school_reviews.sql` | `school_review_questions`, `school_reviews`, `school_review_answers`, `school_rating_summary` 뷰 + RLS |
| `0006_search_cache.sql` | `school_search_cache`, `school_search_cache_items` + 읽기 전용 RLS |
| `0007_user_carbon_totals.sql` | `user_carbon_totals` 뷰 |
| `0009_carbon_integrity.sql` | `carbon_g` 스냅샷 강제 트리거(위조 차단), `user_carbon_totals` 본인 한정 |
| `0008_storage.sql` | Storage 버킷 2개와 objects 정책 (storage 스키마가 없으면 자동 skip) |
| `0015_curriculum_standards.sql` | `share_posts.unit`/`standards`(중등 수업교구 전용), 과목에 '정보' 추가 |
| `0014_taxonomy_rework.sql` | 분류 개편(학급경영·수업교구·교사용품 + 학년군/교과목), `item_types.category`, 품목 21종 |
| `0013_comments_require_reservation.sql` | 나눔글 댓글은 예약으로 얻는 권한 (나눔중=전원 불가, 예약중·완료=예약자·글쓴이) |
| `0012_admin_delete.sql` | 운영자의 모든 글 삭제 권한 (나눔·소모임·게시판 + Storage 객체) |
| `0011_review_scope_and_reserved_comments.sql` | `my_school_id()`, 본인 학교만 별점 평가(R24), 예약중 댓글은 예약자·글쓴이만(R15) |
| `0010_categories_boards.sql` | 나눔 3단계 분류(`is_valid_share_category()`, `subject`), `usage_tips`/`condition`, `club_posts.kind`(소모임·번개모임), `board_*` 3개 테이블 + RLS, `board-images` 버킷 |

되돌리기: 신규 프로젝트 전제이므로 `drop schema public cascade; create schema public;`
후 재적용이 가장 확실하다. 개별 롤백 스크립트는 두지 않았다.

### 3. 최초 관리자

관리자 승격 화면은 MVP에 없다. 대시보드에서 사용자를 만든 뒤 직접 바꾼다.

```sql
update public.profiles set role = 'admin', status = 'approved'
where email = '<관리자 이메일>';
```

### 4. 실행

```bash
npm install
npm run dev
```

## 검증

```bash
npm run typecheck   # tsc --noEmit
npm run build       # next build
npm test            # 검색 캐시 단위 테스트 (AC17-AC21)
npm run db:test     # 마이그레이션 + RLS/제약 조건 SQL 테스트 (AC1,3-11,13-17,22)
```

`npm run db:test`는 Docker가 없는 환경을 위해 `npx supabase db reset` 대신
로컬 Postgres(`/opt/homebrew/opt/postgresql@17`)에 일회용 클러스터를 띄우고
`supabase/test-harness.sql`로 Supabase의 `auth` 스키마와 역할을 흉내 낸 뒤
모든 마이그레이션과 `supabase/tests/rls_and_constraints.sql`을 적용한다.
Auth, Storage, PostgREST는 이 경로로 검증되지 않는다.

시드 계정 (실제 Supabase 프로젝트 필요):

```bash
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node --experimental-strip-types scripts/seed.ts
```

## 설계 메모

- **승인 게이트는 이중.** `middleware.ts`는 리다이렉트만 한다. 실제 차단은
  RLS의 `is_approved()`다. 미들웨어에 규칙을 추가하고 데이터가 보호된다고
  가정하면 안 된다.
- **규칙은 DB에서 강제.** 사진 장수, 상태 전이, 예약중 댓글 차단, 학교급-카테고리
  짝, 닉네임 고유성은 모두 트리거와 제약 조건이다. 폼 검증은 UX용이다.
- **카카오 호출은 한 곳.** `src/lib/kakao.ts`만 `dapi.kakao.com`을 호출하고,
  이를 쓰는 곳은 `app/api/schools/search/route.ts` 하나다. 캐시가 새지 않고
  호출 횟수를 셀 수 있어야 하기 때문이다.
- **`schools`와 캐시 테이블에는 쓰기 정책이 없다.** 정책이 없으면 RLS가 거부하므로
  사용자 세션으로는 INSERT/UPDATE가 불가능하다. 쓰기는 서비스 롤 클라이언트만 한다.
- **카테고리 매핑은 두 곳에 산다.** `src/lib/categories.ts`와
  `supabase/migrations/0010_categories_boards.sql`의
  `is_valid_share_category()`. 바꿀 때 반드시 둘 다 고친다.
- **나눔 분류의 세부 축은 조합에 따라 달라진다.** 학교급(초등/중등) ×
  카테고리(학급경영/수업교구/교사용품)이고, 세부 항목은 `수업교구`일 때만
  붙는다. 초등이면 학년군(1-2/3-4/5-6), 중등이면 교과목이다. 학급경영과
  교사용품에는 세부 항목이 없고 두 칼럼 모두 null 이어야 한다.
- **CHECK 는 NULL 을 통과시킨다.** `is_valid_share_taxonomy()`가 `coalesce(…,
  false)`로 감싸여 있는 이유다. 감싸지 않으면 학년군이 비었을 때 식 전체가
  NULL 이 되어 필수 항목이 필수가 아니게 된다.
- **성취기준 목록은 DB가 아니라 파일에 있다.**
  `src/lib/curriculum/secondaryInformatics.ts`. 교육과정 문서에서 온 고정
  자료여서 사용자가 고치는 값이 아니고, 개정되면 파일만 갈아끼운다. 글에는
  고른 코드만 저장한다. 그 대가로 DB는 "어떤 조합에서 값이 있을 수 있는가"와
  모양·개수까지만 보증하고, 코드가 그 단원 소속인지는 앱의
  `standardsAreInUnit()`이 막는다.
- **품목유형은 카테고리별 목록이다.** `item_types.category`로 갈린다. 탄소
  계수는 재질·무게 기반 기존 8종 값을 물려받아 쓰고, 새 숫자를 지어내지 않는다.
- **분류는 나눔에만 있다.** 소모임·번개모임·게시판에는 분류도 검색 상자도 없다.
  소모임 분류 체계는 이후 작업이다.
- **별점 평가는 본인 학교만.** `my_school_id()`를 쓰는 RLS 정책이 경계이고,
  화면에서 폼을 감추는 것은 안내용이다. (R24, 마이그레이션 11)
- **댓글은 예약으로 얻는 권한이다.** 나눔중인 글에는 글쓴이를 포함해 아무도
  댓글을 쓸 수 없고, 예약이 걸리면 예약자와 글쓴이만 쓸 수 있다. 나눔완료 뒤에도
  두 사람만 남는다. 예약을 취소하면 나눔중으로 돌아가 잠금이 풀리고, 다음 사람이
  예약하면 권한이 그쪽으로 넘어간다. 이미 달린 댓글은 어떤 경우에도 지워지지
  않고 읽기는 늘 열려 있다. (R15, 마이그레이션 13)
- **운영자는 지울 수만 있고 고칠 수는 없다.** 마이그레이션 12는 DELETE 정책만
  넓혔다. 남의 글 수정은 여전히 `guard_share_post_transition()`이 막는다.
- **소모임과 번개모임은 한 테이블이다.** `club_posts.kind`로 갈리고, 하단 탭이
  아니라 `/clubs` 안의 서브탭이다.
