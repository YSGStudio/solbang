import PDFDocument from "pdfkit";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { requireApprovedProfile } from "@/lib/auth";
import { SCHOOL_LEVEL_LABELS, type SchoolLevel } from "@/lib/categories";
import { formatDateTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_REGULAR_PATH = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
);
const FONT_BOLD_PATH = path.join(
  process.cwd(),
  "node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff",
);

type ReportPost = {
  title: string;
  description: string;
  usageTips: string;
  schoolLevel: SchoolLevel;
  category: string;
  subject: string;
  condition: string;
  itemType: string;
  authorName: string;
  createdAt: string;
};

const PAGE_LEFT = 48;
const CONTENT_WIDTH = 499;
const PAGE_BOTTOM = 775;

function drawPageHeader(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill("#ffffff");
  doc.rect(0, 0, doc.page.width, 82).fill("#1f7a4d");
  doc.font("NotoSansKRBold").fillColor("#ffffff").fontSize(18).text("나눔 활용 보고서", PAGE_LEFT, 27);
  doc.font("NotoSansKR").fontSize(9).fillColor("#d9f2e5").text("교사 나눔터", PAGE_LEFT, 54);
  doc.restore();
  doc.x = PAGE_LEFT;
  doc.y = 108;
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  const y = doc.y;
  doc.rect(PAGE_LEFT, y + 2, 5, 20).fill("#1f7a4d");
  doc.font("NotoSansKRBold").fillColor("#16191d").fontSize(15).text(title, PAGE_LEFT + 14, y);
  if (subtitle) {
    doc.font("NotoSansKR").fillColor("#667085").fontSize(9).text(subtitle, PAGE_LEFT + 14, y + 23);
    doc.y = y + 49;
  } else {
    doc.y = y + 34;
  }
}

function safeFilename(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|\r\n]/g, " ").trim().slice(0, 60);
  return `${cleaned || "나눔-활용팁"}.pdf`;
}

async function pdfBuffer(
  post: ReportPost,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_LEFT,
    info: { Title: post.title, Subject: "나눔 물품 활용 보고서", Author: post.authorName },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.registerFont("NotoSansKR", FONT_REGULAR_PATH);
  doc.registerFont("NotoSansKRBold", FONT_BOLD_PATH);
  drawPageHeader(doc);

  doc.font("NotoSansKR").fillColor("#1f7a4d").fontSize(10).text("SHARE ITEM REPORT");
  doc.moveDown(0.45).font("NotoSansKRBold").fillColor("#16191d").fontSize(25).text(post.title, {
    width: CONTENT_WIDTH,
    height: 72,
    lineGap: 5,
    ellipsis: true,
  });
  doc.moveDown(0.45).font("NotoSansKR").fillColor("#667085").fontSize(9).text(
    `${post.authorName} 선생님 · ${formatDateTime(post.createdAt)}`,
  );
  doc.moveDown(1);

  const categoryText = `${SCHOOL_LEVEL_LABELS[post.schoolLevel]}  ·  ${post.category}  ·  ${post.subject}`;
  const categoryY = doc.y;
  doc.roundedRect(PAGE_LEFT, categoryY, CONTENT_WIDTH, 38, 8).fill("#e6f3ec");
  doc.font("NotoSansKRBold").fillColor("#1f7a4d").fontSize(11).text(categoryText, PAGE_LEFT + 14, categoryY + 12, {
    width: CONTENT_WIDTH - 28,
  });
  doc.y = categoryY + 58;

  sectionTitle(doc, "물건 정보");
  const infoY = doc.y;
  doc.roundedRect(PAGE_LEFT, infoY, CONTENT_WIDTH, 94, 10).fillAndStroke("#f7f8fa", "#dfe3e8");
  const infoRows = [
    ["물건 상태", post.condition],
    ["품목 유형", post.itemType],
    ["카테고리", categoryText],
  ];
  infoRows.forEach(([label, value], index) => {
    const rowY = infoY + 10 + index * 26;
    doc.font("NotoSansKR").fillColor("#667085").fontSize(9).text(label, PAGE_LEFT + 16, rowY, { width: 76 });
    doc.font("NotoSansKRBold").fillColor("#16191d").fontSize(10).text(value, PAGE_LEFT + 104, rowY, {
      width: CONTENT_WIDTH - 122,
    });
    if (index < infoRows.length - 1) {
      doc.strokeColor("#e5e7eb").moveTo(PAGE_LEFT + 16, rowY + 19).lineTo(PAGE_LEFT + CONTENT_WIDTH - 16, rowY + 19).stroke();
    }
  });
  doc.y = infoY + 110;

  sectionTitle(doc, "운영자 활용 팁", "예약한 선생님을 위한 물품 활용 가이드");
  const tipsY = doc.y;
  const desiredTipsHeight = doc.heightOfString(post.usageTips, { width: CONTENT_WIDTH - 40, lineGap: 5 }) + 34;
  const tipsHeight = Math.max(82, Math.min(desiredTipsHeight, 154, PAGE_BOTTOM - tipsY - 126));
  doc.roundedRect(PAGE_LEFT, tipsY, CONTENT_WIDTH, tipsHeight, 10).fillAndStroke("#f0f8f4", "#b8dfca");
  doc.font("NotoSansKR").fillColor("#24332b").fontSize(10).text(post.usageTips, PAGE_LEFT + 20, tipsY + 16, {
    width: CONTENT_WIDTH - 40,
    height: tipsHeight - 30,
    lineGap: 5,
    paragraphGap: 6,
    ellipsis: true,
  });
  doc.y = tipsY + tipsHeight + 14;

  sectionTitle(doc, "물건 설명");
  const descriptionHeight = Math.max(24, PAGE_BOTTOM - doc.y);
  doc.font("NotoSansKR").fillColor("#343a40").fontSize(10).text(post.description, {
    width: CONTENT_WIDTH,
    height: descriptionHeight,
    lineGap: 5,
    paragraphGap: 6,
    ellipsis: true,
  });

  doc.strokeColor("#dfe3e8").moveTo(PAGE_LEFT, 802).lineTo(PAGE_LEFT + CONTENT_WIDTH, 802).stroke();
  doc.font("NotoSansKR").fillColor("#8a939f").fontSize(8).text(
    "교사 나눔터 · 1 / 1",
    PAGE_LEFT,
    812,
    { width: CONTENT_WIDTH, align: "right", lineBreak: false },
  );
  doc.end();
  return completed;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await requireApprovedProfile();
  const { id } = await params;
  const supabase = await createClient();
  const { data: post } = await supabase
    .from("share_posts")
    .select(
      "id, title, description, usage_tips, school_level, category, subject, condition, created_at, reserved_by, " +
        "author:author_id (nickname), item_type:item_type_id (label)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!post) return new Response("나눔 글을 찾을 수 없습니다.", { status: 404 });
  const sharePost = post as unknown as {
    id: string;
    title: string;
    description: string;
    usage_tips: string;
    school_level: SchoolLevel;
    category: string;
    subject: string;
    condition: string;
    created_at: string;
    reserved_by: string | null;
    author: { nickname: string } | null;
    item_type: { label: string } | null;
  };
  if (sharePost.reserved_by !== profile.id) {
    return new Response("예약한 사용자만 활용 팁을 다운로드할 수 있습니다.", { status: 403 });
  }
  if (!sharePost.usage_tips?.trim()) {
    return new Response("등록된 활용 팁이 없습니다.", { status: 404 });
  }

  const pdf = await pdfBuffer(
    {
      title: sharePost.title,
      description: sharePost.description,
      usageTips: sharePost.usage_tips,
      schoolLevel: sharePost.school_level,
      category: sharePost.category,
      subject: sharePost.subject,
      condition: sharePost.condition,
      itemType: sharePost.item_type?.label ?? "미분류",
      authorName: sharePost.author?.nickname ?? "알 수 없음",
      createdAt: sharePost.created_at,
    },
  );
  const filename = safeFilename(sharePost.title);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="share-tips.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
