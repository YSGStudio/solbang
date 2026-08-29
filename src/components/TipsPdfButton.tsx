"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/** Pull the server's filename out of Content-Disposition, RFC 5987 first. */
function filenameFrom(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : fallback;
}

/**
 * The PDF is generated on demand, so the click has a wait behind it. Fetch it
 * as a blob rather than letting the browser navigate, which is what lets us
 * know when it is actually finished and put a curtain over the page until then.
 */
export function TipsPdfButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hold the page still while the curtain is up.
  useEffect(() => {
    if (!busy) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [busy]);

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(href);
      if (!response.ok) {
        setError(
          response.status === 403
            ? "예약한 선생님만 내려받을 수 있습니다."
            : response.status === 404
              ? "등록된 활용 팁이 없습니다."
              : "PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }

      const blob = await response.blob();
      const name = filenameFrom(
        response.headers.get("content-disposition"),
        "나눔-활용팁.pdf",
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Give the browser a tick to take the blob before it is revoked.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError("PDF를 내려받지 못했습니다. 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-pdf"
        onClick={download}
        disabled={busy}
      >
        {busy ? "준비 중…" : "PDF로 내려받기"}
      </button>

      {error ? (
        <p className="notice notice-error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}

      {busy ? (
        <div
          className="pdf-curtain"
          role="alertdialog"
          aria-modal="true"
          aria-busy="true"
          aria-label="PDF 준비 중"
        >
          <div className="pdf-curtain-card">
            <div className="pdf-curtain-art">
              <Image
                src="/logo.png"
                alt=""
                width={96}
                height={130}
                className="pdf-curtain-mascot"
                priority
              />
              <span className="pdf-curtain-parcel" aria-hidden="true">📦</span>
            </div>
            <p className="pdf-curtain-text">
              솔방울이 나눔꾸러미를 배송중입니다.
            </p>
            <div className="pdf-curtain-track" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
