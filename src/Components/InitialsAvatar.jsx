import { useEffect, useRef, useState } from "react";
import { speechSignal } from "../utils/voices";

/**
 * InitialsAvatar: Professional initials-based avatar for the AI recruiter.
 * Displays recruiter initials with a subtle gradient background from persona tint.
 * Includes a speaking ring animation synchronized with TTS via speechSignal.
 */
export default function InitialsAvatar({ persona, _phase, className = "" }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speakRef = useRef(false);
  const rafRef = useRef(0);

  const initials = persona?.name
    ?.split(" ")
    .map((w) => w[0]?.toUpperCase())
    .join("")
    .slice(0, 2) || "AI";

  const gradient = persona?.tint
    ? `linear-gradient(160deg, ${persona.tint[0]}, ${persona.tint[1]})`
    : "linear-gradient(160deg, #3b82f6, #8b5cf6)";

  // Sync speaking state with speechSignal for accurate TTS visualization
  useEffect(() => {
    const checkSpeaking = () => {
      const speaking = speechSignal.speaking;
      if (speaking !== speakRef.current) {
        speakRef.current = speaking;
        setIsSpeaking(speaking);
      }
      rafRef.current = requestAnimationFrame(checkSpeaking);
    };
    rafRef.current = requestAnimationFrame(checkSpeaking);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      className={`initials-avatar ${isSpeaking ? "speaking" : ""} ${className}`}
      style={{ background: gradient }}
      role="img"
      aria-label={`${persona?.name || "Recruiter"}, ${persona?.title || "AI Recruiter"}`}
      aria-live="polite"
    >
      <span className="initials">{initials}</span>
      {isSpeaking && <span className="speaking-ring" aria-hidden="true" />}
    </div>
  );
}