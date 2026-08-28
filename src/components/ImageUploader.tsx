"use client";

import { useRef, useState } from "react";

/**
 * T8. File picker with a live count and preview, capped at `max`
 * (4 for share posts, 2 for clubs). The cap is repeated in the Server Action
 * and again in a database trigger — this layer is only for the person using it.
 * (R10, R19)
 */
export function ImageUploader({
  name = "images",
  max,
  min = 0,
  label = "사진",
}: {
  name?: string;
  max: number;
  min?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ url: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length > max) {
      setError(`사진은 최대 ${max}장까지 첨부할 수 있습니다. (${files.length}장 선택됨)`);
      event.target.value = "";
      setPreviews([]);
      return;
    }

    setError(null);
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    setPreviews(
      files.map((file) => ({ url: URL.createObjectURL(file), name: file.name })),
    );
  }

  return (
    <div className="field">
      <label htmlFor={name}>
        {label} ({min > 0 ? `${min}~${max}장` : `최대 ${max}장`})
        {min > 0 ? " *" : ""}
      </label>
      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={max > 1}
        required={min > 0}
        onChange={handleChange}
      />

      {error ? (
        <p className="notice notice-error" style={{ marginTop: 8 }}>
          {error}
        </p>
      ) : null}

      {previews.length > 0 ? (
        <>
          <p className="muted" style={{ marginTop: 8 }}>
            {previews.length}장 선택됨
          </p>
          <div className="thumb-grid">
            {previews.map((preview) => (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={preview.url}
                className="thumb"
                src={preview.url}
                alt={preview.name}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
