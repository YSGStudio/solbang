import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type ImageBucket = "share-images" | "club-images";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && /^[a-zA-Z0-9]{1,5}$/.test(fromName)) return fromName.toLowerCase();
  return file.type === "image/png" ? "png" : "jpg";
}

/**
 * T8. Uploads into `<userId>/<uuid>.<ext>`, which is what the storage policy
 * in migration 8 keys on. `maxImages` is the caller's limit (4 for share,
 * 2 for clubs); the database triggers enforce the same numbers, so a bypass
 * here still fails on insert. (R10, R19)
 */
export async function uploadPostImages(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  userId: string,
  files: File[],
  maxImages: number,
): Promise<string[]> {
  const real = files.filter((f) => f && f.size > 0);

  if (real.length > maxImages) {
    throw new UploadError(`사진은 최대 ${maxImages}장까지 첨부할 수 있습니다.`);
  }

  const paths: string[] = [];
  for (const file of real) {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new UploadError("JPG, PNG, WEBP, GIF 이미지만 올릴 수 있습니다.");
    }
    if (file.size > MAX_BYTES) {
      throw new UploadError("이미지 한 장은 5MB 이하여야 합니다.");
    }

    const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) {
      // Roll back what we already put in the bucket so a half-uploaded post
      // does not leave orphans behind.
      if (paths.length > 0) {
        await supabase.storage.from(bucket).remove(paths);
      }
      throw new UploadError(`이미지 업로드에 실패했습니다: ${error.message}`);
    }
    paths.push(path);
  }

  return paths;
}

/** Private buckets, so every read needs a short-lived signed URL. */
export async function signedUrlsFor(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, expiresInSeconds);

  if (error || !data) return map;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

export async function removeImages(
  supabase: SupabaseClient<Database>,
  bucket: ImageBucket,
  paths: string[],
): Promise<void> {
  if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
}
