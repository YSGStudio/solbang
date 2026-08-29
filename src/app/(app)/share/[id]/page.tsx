import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { StatusTag } from "@/components/StatusTag";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { TipsPdfButton } from "@/components/TipsPdfButton";
import { signedUrlsFor } from "@/lib/storage";
import { formatCarbon, formatDateTime } from "@/lib/format";
import {
  SCHOOL_LEVEL_LABELS,
  type SchoolLevel,
  type ShareStatus,
} from "@/lib/categories";
import {
  addShareComment,
  cancelReservation,
  completeSharePost,
  deleteSharePost,
  reserveSharePost,
} from "../actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  reserve: "예약하지 못했습니다. 다른 선생님이 먼저 예약했을 수 있습니다.",
  cancel: "예약을 취소하지 못했습니다.",
  complete: "나눔 완료로 바꾸지 못했습니다. 예약된 글만 완료할 수 있습니다.",
  comment:
    "댓글을 저장하지 못했습니다. 예약한 선생님과 글쓴이만 쓸 수 있습니다.",
  "empty-comment": "댓글 내용을 입력해 주세요.",
  delete: "글을 삭제하지 못했습니다. 글쓴이만 삭제할 수 있습니다.",
  "edit-completed": "나눔이 완료된 글은 수정할 수 없습니다.",
};

/** T11 / R12, R13, R14, R15. */
export default async function SharePostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await requireApprovedProfile();
  const { id } = await params;
  const { error: errorCode } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("share_posts")
    .select(
      "id, title, description, usage_tips, condition, school_level, category, " +
        "subject, status, carbon_g, " +
        "created_at, author_id, reserved_by, reserved_at, completed_at, " +
        "author:author_id (nickname), reserver:reserved_by (nickname), " +
        "item_type:item_type_id (label), " +
        "images:share_post_images (storage_path, sort_order), " +
        "comments:share_comments (id, body, created_at, author_id, author:author_id (nickname))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  type Post = {
    id: string;
    title: string;
    description: string;
    usage_tips: string;
    condition: string;
    school_level: SchoolLevel;
    category: string;
    subject: string;
    status: ShareStatus;
    carbon_g: number;
    created_at: string;
    author_id: string;
    reserved_by: string | null;
    reserved_at: string | null;
    completed_at: string | null;
    author: { nickname: string } | null;
    reserver: { nickname: string } | null;
    item_type: { label: string } | null;
    images: { storage_path: string; sort_order: number }[];
    comments: {
      id: string;
      body: string;
      created_at: string;
      author_id: string;
      author: { nickname: string } | null;
    }[];
  };

  const post = data as unknown as Post;

  const images = [...post.images].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedUrlsFor(
    supabase,
    "share-images",
    images.map((i) => i.storage_path),
  );
  const comments = [...post.comments].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  const isAuthor = post.author_id === profile.id;
  const isReserver = post.reserved_by === profile.id;
  const canReserve = post.status === "available" && !isAuthor;
  const canCancel = post.status === "reserved" && (isReserver || isAuthor);
  const canComplete = post.status === "reserved" && isAuthor;
  // The author may rewrite the post until it is completed; deleting it stays
  // available afterwards, since the row is theirs either way.
  const canEdit = isAuthor && post.status !== "completed";
  // Migration 12: administrators may remove any post for moderation. They
  // still cannot edit one — only the author can.
  const isAdmin = profile.role === "admin";
  const canDelete = isAuthor || isAdmin;
  // R15 (migration 13): commenting is earned by reserving.
  //   나눔중   아무도 쓸 수 없다 — 예약이 곧 문의 자격이다.
  //   예약중   예약자와 글쓴이만.
  //   나눔완료 예약자와 글쓴이만, 마무리를 위해.
  // Reading is never restricted, and existing comments are never removed.
  const commentsOpenToMe =
    post.status !== "available" && (isReserver || isAuthor);
  const commentsBlocked = !commentsOpenToMe;

  return (
    <main>
      <p className="muted">
        <Link href="/share">← 나눔 목록</Link>
      </p>

      {errorCode && ERROR_MESSAGES[errorCode] ? (
        <p className="notice notice-error">{ERROR_MESSAGES[errorCode]}</p>
      ) : null}

      <header className="share-detail-header">
        <div className="row" style={{ gap: 6 }}>
          <StatusTag status={post.status} />
          <span className="tag tag-plain">{SCHOOL_LEVEL_LABELS[post.school_level]}</span>
          <span className="tag tag-plain">{post.category}</span>
          <span className="tag tag-plain">{post.subject}</span>
        </div>
        <h1>{post.title}</h1>
        <div className="share-detail-byline">
          <strong>{post.author?.nickname ?? "알 수 없음"}</strong>
          <span>{formatDateTime(post.created_at)}</span>
        </div>
      </header>

      {images.length > 0 ? (
        <div className="thumb-grid share-detail-images">
          {images.map((image, index) => {
            const url = urls.get(image.storage_path);
            return url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={image.storage_path}
                src={url}
                alt={`${post.title} 사진 ${index + 1}`}
                className="thumb"
                style={{ aspectRatio: "1 / 1" }}
              />
            ) : null;
          })}
        </div>
      ) : null}

      <section className="share-detail-section">
        <h2>물건 설명</h2>
        <p className="share-detail-copy">{post.description}</p>
      </section>

      {post.usage_tips ? (
        <section className="share-detail-section share-detail-tip">
          <div className="share-detail-section-heading">
            <h2>활용 팁</h2>
            {isReserver ? (
              <TipsPdfButton href={`/share/${post.id}/tips-pdf`} />
            ) : null}
          </div>
          <p className="share-detail-copy">{post.usage_tips}</p>
        </section>
      ) : null}

      <section className="share-detail-section">
        <h2>물건 정보</h2>
        <dl className="share-detail-facts">
          <div><dt>물건 상태</dt><dd>{post.condition}</dd></div>
          <div><dt>품목 유형</dt><dd>{post.item_type?.label ?? "미분류"}</dd></div>
          <div><dt>분류</dt><dd>{SCHOOL_LEVEL_LABELS[post.school_level]} · {post.category} · {post.subject}</dd></div>
          <div><dt>예상 탄소 절감</dt><dd>{formatCarbon(post.carbon_g)}</dd></div>
        </dl>
      </section>

      {post.status === "reserved" && post.reserver ? (
        <p className="notice notice-warn">
          {post.reserver.nickname} 선생님이 예약했습니다
          {post.reserved_at ? ` (${formatDateTime(post.reserved_at)})` : ""}.
        </p>
      ) : null}
      {post.status === "completed" ? (
        <p className="notice notice-info">
          나눔이 완료되었습니다
          {post.completed_at ? ` (${formatDateTime(post.completed_at)})` : ""}.
          이 글의 상태는 더 이상 바뀌지 않습니다.
        </p>
      ) : null}

      <div className="row">
        {canReserve ? (
          <form action={reserveSharePost}>
            <input type="hidden" name="post_id" value={post.id} />
            <SubmitButton className="btn-primary" pendingLabel="예약 중…">
              예약하기
            </SubmitButton>
          </form>
        ) : null}

        {canCancel ? (
          <form action={cancelReservation}>
            <input type="hidden" name="post_id" value={post.id} />
            <SubmitButton className="" pendingLabel="취소 중…">
              예약 취소
            </SubmitButton>
          </form>
        ) : null}

        {canComplete ? (
          <form action={completeSharePost}>
            <input type="hidden" name="post_id" value={post.id} />
            <SubmitButton className="btn-primary" pendingLabel="처리 중…">
              나눔 완료로 바꾸기
            </SubmitButton>
          </form>
        ) : null}

        {canEdit ? (
          <Link href={`/share/${post.id}/edit`} className="btn">
            수정하기
          </Link>
        ) : null}

        {canDelete ? (
          <form action={deleteSharePost}>
            <input type="hidden" name="post_id" value={post.id} />
            <ConfirmSubmitButton
              className="btn-danger"
              pendingLabel="삭제 중…"
              message={
                !isAuthor
                  ? "운영자 권한으로 다른 선생님의 글을 삭제합니다. 사진과 댓글도 함께 사라집니다. 계속할까요?"
                  : post.status === "reserved"
                    ? "예약한 선생님이 있는 글입니다. 정말 삭제할까요? 사진과 댓글도 함께 사라집니다."
                    : "이 글을 삭제할까요? 사진과 댓글도 함께 사라집니다."
              }
            >
              {isAuthor ? "삭제" : "운영자 삭제"}
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </div>

      <h2>댓글 {comments.length}개</h2>

      {comments.length === 0 ? (
        <p className="muted">아직 댓글이 없습니다.</p>
      ) : (
        <ul className="list-reset">
          {comments.map((comment) => (
            <li key={comment.id} className="card">
              <div className="spread">
                <strong>{comment.author?.nickname ?? "알 수 없음"}</strong>
                <span className="muted">{formatDateTime(comment.created_at)}</span>
              </div>
              <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form action={addShareComment} className="card">
        <input type="hidden" name="post_id" value={post.id} />
        <label htmlFor="body">댓글 쓰기</label>

        {/* R15 / AC8: say why it is closed, not just that it is. */}
        {post.status === "available" ? (
          <p className="notice notice-warn">
            {isAuthor
              ? "나눔중인 글에는 댓글을 쓸 수 없습니다. 예약이 들어오면 예약한 선생님과 이야기할 수 있습니다."
              : "예약한 뒤에야 댓글을 쓸 수 있습니다. 먼저 위에서 예약해 주세요."}
          </p>
        ) : commentsBlocked ? (
          <p className="notice notice-warn">
            예약한 선생님과 글쓴이만 댓글을 쓸 수 있습니다. 예약이 취소되면 다음
            예약자에게 넘어갑니다. 위의 댓글은 그대로 남습니다.
          </p>
        ) : (
          <p className="notice notice-info">
            {post.status === "reserved"
              ? "예약한 선생님과 글쓴이끼리만 이야기할 수 있습니다."
              : "나눔이 끝난 글입니다. 두 분끼리 마무리 이야기를 나눌 수 있습니다."}
          </p>
        )}

        <textarea
          id="body"
          name="body"
          rows={3}
          disabled={commentsBlocked}
          placeholder={
            post.status === "available"
              ? "예약한 뒤에 문의할 수 있습니다"
              : commentsBlocked
                ? "예약한 선생님과 글쓴이만 쓸 수 있습니다"
                : "주고받을 시간과 장소를 정해 보세요"
          }
          style={{ minHeight: 90 }}
        />
        <SubmitButton
          className="btn-primary"
          disabled={commentsBlocked}
          pendingLabel="등록 중…"
        >
          댓글 등록
        </SubmitButton>
      </form>
    </main>
  );
}
