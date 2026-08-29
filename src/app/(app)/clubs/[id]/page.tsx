import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { signedUrlsFor } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { CLUB_KIND_LABELS, isClubKind } from "@/lib/categories";
import { formatMeetAt } from "@/lib/meetTime";
import { addClubComment, deleteClubPost } from "../actions";

export const dynamic = "force-dynamic";

/** T13 / R18, R20. No reservation, so comments are always open. (AC11) */
export default async function ClubPostPage({
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
    .from("club_posts")
    .select(
      "id, title, description, kind, meet_at, created_at, author_id, " +
        "author:author_id (nickname), " +
        "images:club_post_images (storage_path, sort_order), " +
        "comments:club_comments (id, body, created_at, author:author_id (nickname))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  type Post = {
    id: string;
    title: string;
    description: string;
    kind: string;
    meet_at: string | null;
    created_at: string;
    author_id: string;
    author: { nickname: string } | null;
    images: { storage_path: string; sort_order: number }[];
    comments: {
      id: string;
      body: string;
      created_at: string;
      author: { nickname: string } | null;
    }[];
  };
  const post = data as unknown as Post;
  const kind = isClubKind(post.kind) ? post.kind : "club";
  const kindLabel = CLUB_KIND_LABELS[kind];
  const isAuthor = post.author_id === profile.id;
  const isAdmin = profile.role === "admin";
  const canDelete = isAuthor || isAdmin;

  const images = [...post.images].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedUrlsFor(
    supabase,
    "club-images",
    images.map((i) => i.storage_path),
  );
  const comments = [...post.comments].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  return (
    <main className={`club-detail-page club-kind-${kind}`}>
      <Link href={kind === "club" ? "/clubs" : `/clubs?kind=${kind}`} className="club-detail-back">
        ← {kindLabel} 목록으로
      </Link>

      {errorCode ? (
        <p className="notice notice-error">
          {errorCode === "empty-comment"
            ? "댓글 내용을 입력해 주세요."
            : errorCode === "delete"
              ? "글을 삭제하지 못했습니다."
              : "댓글을 저장하지 못했습니다."}
        </p>
      ) : null}

      <header className="club-detail-hero">
        <div className="club-detail-kicker">
          <span className="club-detail-kind-icon" aria-hidden="true">{kind === "flash" ? "⚡" : "👥"}</span>
          <span>{kindLabel}</span>
        </div>
        <h1>{post.title}</h1>
        <div className="club-detail-byline">
          <span className="club-author-avatar" aria-hidden="true">{post.author?.nickname?.slice(0, 1) ?? "?"}</span>
          <div><strong>{post.author?.nickname ?? "알 수 없음"}</strong><small>{formatDateTime(post.created_at)}</small></div>
        </div>
      </header>

      {post.meet_at ? (
        <section className="club-detail-schedule">
          <span aria-hidden="true">🗓️</span>
          <div><small>모임 일정</small><strong>{formatMeetAt(post.meet_at)}</strong></div>
        </section>
      ) : null}

      {images.length > 0 ? (
        <div className="thumb-grid club-detail-images">
          {images.map((image, index) => {
            const url = urls.get(image.storage_path);
            return url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={image.storage_path}
                src={url}
                alt={`${post.title} 사진 ${index + 1}`}
                className="thumb"
              />
            ) : null;
          })}
        </div>
      ) : null}

      <section className="club-detail-content">
        <div className="club-detail-section-title"><span aria-hidden="true">✦</span><h2>모임 소개</h2></div>
        <p>{post.description}</p>
      </section>

      {canDelete ? (
        <div className="row club-detail-actions">
          <form action={deleteClubPost}>
            <input type="hidden" name="post_id" value={post.id} />
            <input type="hidden" name="kind" value={kind} />
            <ConfirmSubmitButton
              className="btn-danger"
              pendingLabel="삭제 중…"
              message={
                isAuthor
                  ? `이 ${kindLabel} 글을 삭제할까요? 사진과 댓글도 함께 사라집니다.`
                  : "운영자 권한으로 다른 선생님의 글을 삭제합니다. 사진과 댓글도 함께 사라집니다. 계속할까요?"
              }
            >
              {isAuthor ? "삭제" : "운영자 삭제"}
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : null}

      <div className="club-comments-heading">
        <div><span>CONVERSATION</span><h2>댓글 <em>{comments.length}</em></h2></div>
        <p>참여 의사와 궁금한 점을 편하게 남겨 주세요.</p>
      </div>

      {comments.length === 0 ? (
        <p className="muted">
          아직 댓글이 없습니다. 참여하고 싶다면 댓글로 알려 주세요.
        </p>
      ) : (
        <ul className="list-reset">
          {comments.map((comment) => (
            <li key={comment.id} className="club-comment-card">
              <span className="club-comment-avatar" aria-hidden="true">{comment.author?.nickname?.slice(0, 1) ?? "?"}</span>
              <div className="grow">
                <div className="spread">
                  <strong>{comment.author?.nickname ?? "알 수 없음"}</strong>
                  <span className="muted">{formatDateTime(comment.created_at)}</span>
                </div>
                <p>{comment.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form action={addClubComment} className="club-comment-form">
        <input type="hidden" name="post_id" value={post.id} />
        <div className="club-detail-section-title"><span aria-hidden="true">💬</span><label htmlFor="body">댓글 쓰기</label></div>
        <textarea
          id="body"
          name="body"
          rows={3}
          placeholder="참여 의사나 궁금한 점을 남겨 주세요"
          style={{ minHeight: 90 }}
        />
        <SubmitButton className="btn-primary" pendingLabel="등록 중…">
          댓글 등록
        </SubmitButton>
      </form>
    </main>
  );
}
