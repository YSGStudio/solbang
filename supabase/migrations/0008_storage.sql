-- Migration 8 (T8): Storage buckets and their policies.
-- Requirements: R10, R19
--
-- Both buckets are private; reads go through signed URLs. Skipped entirely on a
-- plain Postgres (the local test cluster), which has no storage schema.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present - skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values ('share-images', 'share-images', false),
         ('club-images',  'club-images',  false)
  on conflict (id) do nothing;

  -- Approved users read any post image; the post rows themselves are already
  -- gated by RLS, so this does not widen what anyone can find.
  execute $p$
    create policy post_images_read on storage.objects
      for select to authenticated
      using (bucket_id in ('share-images', 'club-images') and public.is_approved())
  $p$;

  -- Writes are confined to a folder named after the uploader's own user id.
  execute $p$
    create policy post_images_insert on storage.objects
      for insert to authenticated
      with check (
        bucket_id in ('share-images', 'club-images')
        and public.is_approved()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;

  execute $p$
    create policy post_images_delete on storage.objects
      for delete to authenticated
      using (
        bucket_id in ('share-images', 'club-images')
        and public.is_approved()
        and (storage.foldername(name))[1] = auth.uid()::text
      )
  $p$;
exception
  when duplicate_object then
    raise notice 'storage policies already exist - skipping';
end
$$;
