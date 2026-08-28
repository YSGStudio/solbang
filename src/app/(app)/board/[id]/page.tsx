import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmitButton } from "@/components/ConfirmSubmitButton";
import { signedUrlsFor } from "@/lib/storage";
import { formatDateTime } from "@/lib/format";
import { addBoardComment, deleteBoardPost } from "../actions";

export const dynamic = "force-dynamic";

const ERROR_MESSAGES: Record<string, string> = {
  comment: "댓글을 저장하지 못했습니다.",
  "empty-comment": "댓글 내용을 입력해 주세요.",
  delete: "글을 삭제하지 못했습니다. 글쓴이만 삭제할 수 있습니다.",
};

export default async function BoardPostPage({
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
    .from("board_posts")
    .select(
      "id, title, description, created_at, author_id, " +
        "author:author_id (nickname), " +
        "images:board_post_images (storage_path, sort_order), " +
        "comments:board_comments (id, body, created_at, author:author_id (nickname))",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  type Post = {
    id: string;
    title: string;
    description: string;
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
  const isAuthor = post.author_id === profile.id;
  const isAdmin = profile.role === "admin";
  const canDelete = isAuthor || isAdmin;

  const images = [...post.images].sort((a, b) => a.sort_order - b.sort_order);
  const urls = await signedUrlsFor(
    supabase,
    "board-images",
    images.map((i) => i.storage_path),
  );
  const comments = [...post.comments].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );

  return (
    <main>
      <p className="muted">
        <Link href="/board">← 게시판</Link>
      </p>

      {errorCode && ERROR_MESSAGES[errorCode] ? (
        <p className="notice notice-error">{ERROR_MESSAGES[errorCode]}</p>
      ) : null}

      <h1>{post.title}</h1>
      <p className="muted">
        {post.author?.nickname ?? "알 수 없음"} · {formatDateTime(post.created_at)}
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
              />
            ) : null;
          })}
        </div>
      ) : null}

      <div className="card">
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{post.description}</p>
      </div>

      {canDelete ? (
        <div className="row">
          <form action={deleteBoardPost}>
            <input type="hidden" name="post_id" value={post.id} />
            <ConfirmSubmitButton
              className="btn-danger"
              pendingLabel="삭제 중…"
              message={
                isAuthor
                  ? "이 글을 삭제할까요? 사진과 댓글도 함께 사라집니다."
                  : "운영자 권한으로 다른 선생님의 글을 삭제합니다. 사진과 댓글도 함께 사라집니다. 계속할까요?"
              }
            >
              {isAuthor ? "삭제" : "운영자 삭제"}
            </ConfirmSubmitButton>
          </form>
        </div>
      ) : null}

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

      <form action={addBoardComment} className="card">
        <input type="hidden" name="post_id" value={post.id} />
        <label htmlFor="body">댓글 쓰기</label>
        <textarea
          id="body"
          name="body"
          rows={3}
          placeholder="생각을 남겨 주세요"
          style={{ minHeight: 90 }}
        />
        <SubmitButton className="btn-primary" pendingLabel="등록 중…">
          댓글 등록
        </SubmitButton>
      </form>
    </main>
  );
}
