"use client";

import { useEffect, useRef, useState } from "react";

/**
 * T8. File picker with drag-and-drop, a live count and previews, capped at
 * `max` (4 for share posts, 2 for clubs and the board). The cap is repeated in
 * the Server Action and again in a database trigger — this layer is only for
 * the person using it. (R10, R19)
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
  const [dragging, setDragging] = useState(false);

  // Object URLs are only freed when the component goes away; replacing the
  // selection revokes the previous batch in `show`.
  useEffect(() => {
    return () => previews.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previews]);

  function show(files: File[]) {
    if (files.length > max) {
      setError(`사진은 최대 ${max}장까지 첨부할 수 있습니다. (${files.length}장 선택됨)`);
      return false;
    }
    setError(null);
    setPreviews((current) => {
      current.forEach((p) => URL.revokeObjectURL(p.url));
      return files.map((file) => ({
        url: URL.createObjectURL(file),
        name: file.name,
      }));
    });
    return true;
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!show(files)) {
      event.target.value = "";
      setPreviews([]);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!inputRef.current) return;

    const dropped = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (dropped.length === 0) {
      setError("이미지 파일만 올릴 수 있습니다.");
      return;
    }
    if (!show(dropped)) return;

    // The form submits the input, not our state, so hand the files over.
    const transfer = new DataTransfer();
    dropped.forEach((file) => transfer.items.add(file));
    inputRef.current.files = transfer.files;
  }

  return (
    <div className="field">
      <label htmlFor={name}>
        {label} ({min > 0 ? `${min}~${max}장` : `최대 ${max}장`})
        {min > 0 ? " *" : ""}
      </label>

      <div
        className={`dropzone${dragging ? " dropzone-active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <span aria-hidden="true" style={{ fontSize: "1.4rem" }}>🖼️</span>
        <span>
          여기로 사진을 끌어다 놓거나 <u>눌러서 선택</u>하세요
        </span>
        <span className="muted" style={{ fontSize: "0.8rem" }}>
          JPG · PNG · WEBP · GIF, 한 장에 5MB까지
        </span>
      </div>

      <input
        ref={inputRef}
        id={name}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple={max > 1}
        required={min > 0}
        onChange={handleChange}
        style={{ marginTop: 8 }}
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
