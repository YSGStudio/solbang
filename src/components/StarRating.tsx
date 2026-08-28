"use client";

import { useState } from "react";

/**
 * R24. One row of 1-5 stars per question. Renders as real radio inputs so it
 * works without JavaScript and reads correctly to a screen reader; the buttons
 * are the visual layer on top.
 */
export function StarRating({
  name,
  label,
  defaultValue = 0,
}: {
  name: string;
  label: string;
  defaultValue?: number;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <fieldset
      className="card"
      style={{ border: "1px solid var(--border)", marginBottom: 10 }}
    >
      <legend className="muted" style={{ padding: "0 6px" }}>
        {label}
      </legend>
      <div className="spread">
        <div className="stars" role="radiogroup" aria-label={label}>
          {[1, 2, 3, 4, 5].map((score) => (
            <label
              key={score}
              className="star-btn"
              data-on={value >= score}
              style={{ position: "relative", cursor: "pointer" }}
            >
              <input
                type="radio"
                name={name}
                value={score}
                checked={value === score}
                onChange={() => setValue(score)}
                style={{
                  position: "absolute",
                  opacity: 0,
                  width: 1,
                  height: 1,
                }}
              />
              <span aria-hidden="true">{value >= score ? "★" : "☆"}</span>
              <span className="sr-only" style={{ display: "none" }}>
                {score}점
              </span>
            </label>
          ))}
        </div>
        <span className="muted">{value > 0 ? `${value}점` : "선택 안 함"}</span>
      </div>
    </fieldset>
  );
}
