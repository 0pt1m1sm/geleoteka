"use client";

import { useState, useEffect } from "react";
import { YANDEX_REVIEWS_IFRAME_URL } from "@/lib/yandex";

/**
 * Yandex Maps reviews iframe wrapped with a loading skeleton.
 * Skeleton hides on iframe `onLoad` OR after 4s timeout (covers ad-blocker
 * scenarios where the iframe content is blocked but onLoad still fires
 * unreliably). Width 760 = Yandex widget max for denser content.
 */
export function ReviewsIframeWithSkeleton(): React.ReactElement {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative overflow-x-auto" style={{ minHeight: 800 }}>
      {!loaded && (
        <div
          aria-hidden
          className="absolute inset-0 animate-pulse rounded-lg bg-gradient-to-br from-card via-background-secondary to-card"
        />
      )}
      <iframe
        src={YANDEX_REVIEWS_IFRAME_URL}
        loading="lazy"
        frameBorder="0"
        width="760"
        height="800"
        onLoad={() => setLoaded(true)}
        className={`block mx-auto transition-opacity duration-500 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        title="Отзывы клиентов на Яндекс Картах"
      />
    </div>
  );
}
