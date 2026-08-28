import { requireApprovedProfile } from "@/lib/auth";
import { isClubKind, type ClubKind } from "@/lib/categories";
import { NewClubPostForm } from "./form";

export const dynamic = "force-dynamic";

/** T13 / R18, R19. */
export default async function NewClubPostPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  await requireApprovedProfile();
  const { kind: rawKind } = await searchParams;
  const kind: ClubKind = isClubKind(rawKind) ? rawKind : "club";

  return <NewClubPostForm kind={kind} />;
}
