-- apply-0011.sql 까지 실행한 프로젝트에 이 파일만 추가로 Run 하세요.
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run.
--
-- 운영자(role = 'admin')가 나눔·소모임·번개모임·게시판의 모든 글을 삭제할 수
-- 있게 합니다. 수정 권한은 그대로 글쓴이 전용입니다.

-- Migration 12: administrators may delete any post.
--
-- Until now every delete policy was author-only, so moderation was impossible
-- without the service role. Deleting the post row is enough for its images and
-- comments (both cascade), but the stored objects live in Storage and are
-- keyed by the uploader's folder, so that policy has to widen too — otherwise
-- an admin removes the post and leaves the photos orphaned in the bucket.
--
-- Only DELETE is widened. An admin still cannot edit someone else's post: the
-- update policies and guard_share_post_transition() are untouched.

drop policy if exists share_posts_delete on public.share_posts;
create policy share_posts_delete on public.share_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

drop policy if exists club_posts_delete on public.club_posts;
create policy club_posts_delete on public.club_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

drop policy if exists board_posts_delete on public.board_posts;
create policy board_posts_delete on public.board_posts
  for delete to authenticated
  using (
    public.is_approved()
    and (author_id = auth.uid() or public.is_admin())
  );

-- ----------------------------------------------------- storage objects
-- Same three buckets as migration 10, plus the admin escape hatch.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present - skipping';
    return;
  end if;

  drop policy if exists post_images_delete on storage.objects;

  execute $p$
    create policy post_images_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('share-images','club-images','board-images')
        and public.is_approved()
        and (
          (storage.foldername(name))[1] = auth.uid()::text
          or public.is_admin()
        )
      )
  $p$;
end
$$;
