"use client";

import { useEffect, useRef, useState } from "react";

type ShareToMacButtonProps = {
  className?: string;
  label?: string;
  sharePath?: string;
};

export function ShareToMacButton({
  className,
  label = "Send setup to your Mac",
  sharePath = "/safari",
}: ShareToMacButtonProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  function showFeedback(message: string) {
    setFeedback(message);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setFeedback(null), 3_500);
  }

  async function shareSetup() {
    const url = new URL(sharePath, window.location.origin).toString();
    const shareData = {
      title: "Homeboard for Safari",
      text: "Open this on your Mac to connect Homeboard to Safari.",
      url,
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        showFeedback("Sent");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const field = document.createElement("textarea");
        field.value = url;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      showFeedback("Link copied — send it to your Mac");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      showFeedback("Couldn’t share · copy this page’s link");
    }
  }

  return (
    <button className={className} type="button" onClick={shareSetup}>
      <span>{feedback ?? label}</span>
      <span aria-hidden="true">{feedback ? "✓" : "↗"}</span>
    </button>
  );
}
