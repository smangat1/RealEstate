"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type WaitlistSuccessOverlayProps = {
  open: boolean;
  message: string;
};

export function WaitlistSuccessOverlay({ open, message }: WaitlistSuccessOverlayProps) {
  const [isVisible, setIsVisible] = useState(open);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    setIsVisible(open);
  }, [open]);

  useEffect(() => {
    if (!isVisible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isVisible]);

  function dismiss() {
    setIsVisible(false);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("success");
    nextParams.delete("notice");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  if (!isVisible) return null;

  return (
    <div className="waitlist-success-overlay" onClick={dismiss}>
      <div className="waitlist-success-card" onClick={(event) => event.stopPropagation()}>
        <div className="waitlist-success-check" aria-hidden="true">
          <svg viewBox="0 0 64 64" role="presentation">
            <circle cx="32" cy="32" r="30" />
            <path d="M19 33.5 28 42.5 46 24.5" />
          </svg>
        </div>
        <div className="home-badge">Waitlist joined</div>
        <h2>You’re in.</h2>
        <p>{message}</p>
        <button type="button" className="account-primary-button" onClick={dismiss}>
          Keep exploring
        </button>
      </div>
    </div>
  );
}
