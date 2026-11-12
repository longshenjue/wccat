"use client";

import { useState } from "react";

type InsightImageProps = {
  alt?: string;
  label: string;
  src: string;
};

export function InsightImage({ alt = "", label, src }: InsightImageProps) {
  const [status, setStatus] = useState<"pending" | "visible" | "hidden">("pending");

  if (status === "hidden") {
    return null;
  }

  return (
    <div className={status === "visible" ? "insight-visual is-visible" : "insight-visual is-pending"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Insight images are dynamic external/proxied assets. */}
      <img
        alt={alt}
        onError={() => setStatus("hidden")}
        onLoad={(event) => {
          const image = event.currentTarget;
          const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
          const area = image.naturalWidth * image.naturalHeight;
          const isUsefulCover =
            image.naturalWidth >= 220 &&
            image.naturalHeight >= 120 &&
            area >= 42_000 &&
            ratio >= 0.75 &&
            ratio <= 3;
          setStatus(isUsefulCover ? "visible" : "hidden");
        }}
        src={src}
      />
      <span>{label}</span>
    </div>
  );
}
