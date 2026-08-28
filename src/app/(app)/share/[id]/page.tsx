import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { StatusTag } from "@/components/StatusTag";
import { SubmitButton } from "@/components/SubmitButton";
import { signedUrlsFor } from "@/lib/storage";
import { formatCarbon, formatDateTime } from "@/lib/format";
import type { ShareStatus } from "@/lib/categories";
import {
  addShareComment,
  cancelReservation,
  completeSharePost,
  reserveSharePost,
} from "../actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  reserve: "예약하지 못했습니다. 다른 선생님이 먼저 예약했을 수 있습니다.",
  cancel: "예약을 취소하지 못했습니다.",
  complete: "나눔 완료로 바꾸지 못했습니다. 예약된 글만 완료할 수 있습니다.",
  comment: "댓글을 저장하지 못했습니다. 예약중인 글에는 댓글을 쓸 수 없습니다.",
  "empty-comment": "댓글 내용을 입력해 주세요.",
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
      "id, title, description, school_level, category, status, carbon_g, " +
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
    category: string;
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
  // R15: comments are closed while reserved, open again once completed.
  const commentsBlocked = post.status === "reserved";

  return (
    <main>
      <p className="muted">
        <Link href="/share">← 나눔 목록</Link>
      </p>

      {errorCode && ERROR_MESSAGES[errorCode] ? (
        <p className="notice notice-error">{ERROR_MESSAGES[errorCode]}</p>
      ) : null}

      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <StatusTag status={post.status} />
        <span className="tag tag-plain">{post.category}</span>
        {post.item_type ? (
          <span className="tag tag-plain">{post.item_type.label}</span>
        ) : null}
      </div>

      <h1>{post.title}</h1>
      <p className="muted">
        {post.author?.nickname ?? "알 수 없음"} · {formatDateTime(post.created_at)}
        {" · "}나눔 완료 시 {formatCarbon(post.carbon_g)} 절감
      </p>

      {images.length > 0 ? (
        <div className="thumb-grid" style={{ margin: "16px 0" }}>
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

      <div className="card">
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{post.description}</p>
      </div>

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
        {commentsBlocked ? (
          <p className="notice notice-warn">
            예약중인 나눔 글에는 새 댓글을 쓸 수 없습니다. 예약이 취소되거나
            나눔이 완료되면 다시 쓸 수 있습니다. 위의 댓글은 그대로 남습니다.
          </p>
        ) : null}

        <textarea
          id="body"
          name="body"
          rows={3}
          disabled={commentsBlocked}
          placeholder={
            commentsBlocked
              ? "예약중에는 댓글을 쓸 수 없습니다"
              : "궁금한 점을 남겨 주세요"
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
