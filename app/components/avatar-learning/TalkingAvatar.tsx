"use client";

import { useEffect, useRef, useState } from "react";

interface TalkingAvatarProps {
  isPlaying: boolean;
  size?: number;
}

// Simulate natural speech mouth movement pattern
function useSpeechMouth(isPlaying: boolean) {
  const [mouthH, setMouthH] = useState(1); // mouth height 1–14
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    // Simulate phoneme rhythm: speak → pause → speak ...
    const loop = () => {
      const speaking = Math.random() > 0.25; // 75% chance mouth is open
      const openAmount = speaking ? 4 + Math.random() * 10 : 1;
      const duration = speaking ? 80 + Math.random() * 140 : 60 + Math.random() * 80;
      setMouthH(openAmount);
      timerRef.current = setTimeout(loop, duration);
    };

    timerRef.current = setTimeout(loop, 0);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying]);

  return isPlaying ? mouthH : 1;
}

// Random blink
function useBlink() {
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      const delay = 2500 + Math.random() * 3000;
      timer = setTimeout(() => {
        setBlinking(true);
        timer = setTimeout(() => {
          setBlinking(false);
          scheduleNext();
        }, 140);
      }, delay);
    };

    scheduleNext();
    return () => clearTimeout(timer);
  }, []);

  return blinking;
}

export default function TalkingAvatar({ isPlaying, size = 90 }: TalkingAvatarProps) {
  const mouthH = useSpeechMouth(isPlaying);
  const blinking = useBlink();

  // Mouth shape: rounded rect, height driven by mouthH
  const mouthCx = 50;
  const mouthCy = 68;
  const mouthW = 16;
  const eyeRy = blinking ? 0.8 : 4.5;

  return (
    <div
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        position: "relative",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 110"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block" }}
      >
        {/* === Body / Shirt === */}
        <ellipse cx="50" cy="115" rx="32" ry="22" fill="#4A90D9" />
        {/* Collar */}
        <path d="M 41 98 Q 50 106 59 98" fill="white" stroke="white" strokeWidth="1" />

        {/* === Neck === */}
        <rect x="44" y="88" width="12" height="14" rx="4" fill="#D4956A" />

        {/* === Face === */}
        <ellipse cx="50" cy="52" rx="30" ry="33" fill="#E8A87C" />

        {/* === Hair (top) === */}
        <ellipse cx="50" cy="23" rx="30" ry="16" fill="#2C1A0E" />
        {/* Hair bun */}
        <circle cx="50" cy="13" r="10" fill="#2C1A0E" />
        {/* Side hair */}
        <ellipse cx="22" cy="45" rx="8" ry="20" fill="#2C1A0E" />
        <ellipse cx="78" cy="45" rx="8" ry="20" fill="#2C1A0E" />

        {/* === Ears === */}
        <ellipse cx="21" cy="53" rx="5" ry="7" fill="#D4956A" />
        <ellipse cx="79" cy="53" rx="5" ry="7" fill="#D4956A" />
        {/* Ear stud (bali) */}
        <circle cx="21" cy="56" r="2" fill="#FFD700" />
        <circle cx="79" cy="56" r="2" fill="#FFD700" />

        {/* === Eyebrows === */}
        <path d="M 33 37 Q 39 34 44 37" stroke="#2C1A0E" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M 56 37 Q 61 34 67 37" stroke="#2C1A0E" strokeWidth="2" fill="none" strokeLinecap="round" />

        {/* === Eyes === */}
        {/* Whites */}
        <ellipse cx="38" cy="45" rx="7" ry={eyeRy * 1.2} fill="white" />
        <ellipse cx="62" cy="45" rx="7" ry={eyeRy * 1.2} fill="white" />
        {/* Iris */}
        <ellipse cx="38" cy="45" rx="4.5" ry={eyeRy} fill="#4A2C0A" />
        <ellipse cx="62" cy="45" rx="4.5" ry={eyeRy} fill="#4A2C0A" />
        {/* Pupil */}
        <ellipse cx="38" cy="45" rx="2" ry={blinking ? 0.4 : 2} fill="#111" />
        <ellipse cx="62" cy="45" rx="2" ry={blinking ? 0.4 : 2} fill="#111" />
        {/* Eye shine */}
        {!blinking && (
          <>
            <circle cx="40" cy="43" r="1.2" fill="white" />
            <circle cx="64" cy="43" r="1.2" fill="white" />
          </>
        )}

        {/* === Nose === */}
        <ellipse cx="50" cy="57" rx="3" ry="2.5" fill="#C97A4A" opacity="0.5" />

        {/* === Mouth === */}
        {/* Lips outer */}
        <ellipse
          cx={mouthCx}
          cy={mouthCy}
          rx={mouthW / 2}
          ry={Math.max(3.5, mouthH / 2 + 2)}
          fill="#C06060"
        />
        {/* Teeth (visible when mouth open) */}
        {mouthH > 3 && (
          <ellipse
            cx={mouthCx}
            cy={mouthCy - 1}
            rx={mouthW / 2 - 2}
            ry={Math.min(mouthH / 2 - 0.5, 5)}
            fill="white"
          />
        )}
        {/* Inner mouth (tongue/dark) */}
        {mouthH > 5 && (
          <ellipse
            cx={mouthCx}
            cy={mouthCy + 1.5}
            rx={mouthW / 2 - 3}
            ry={mouthH / 2 - 3}
            fill="#8B3030"
          />
        )}

        {/* === Glasses === */}
        <rect x="28" y="39" width="18" height="13" rx="5" fill="none" stroke="#444" strokeWidth="1.5" />
        <rect x="54" y="39" width="18" height="13" rx="5" fill="none" stroke="#444" strokeWidth="1.5" />
        <line x1="46" y1="45" x2="54" y2="45" stroke="#444" strokeWidth="1.5" />
        <line x1="22" y1="44" x2="28" y2="44" stroke="#444" strokeWidth="1.5" />
        <line x1="72" y1="44" x2="78" y2="44" stroke="#444" strokeWidth="1.5" />

        {/* === Sound waves (when playing) === */}
        {isPlaying && (
          <>
            <g opacity="0.55">
              <path
                d="M 85 42 Q 90 52 85 62"
                stroke="#4A90D9"
                strokeWidth="2.5"
                fill="none"
                strokeLinecap="round"
              >
                <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />
              </path>
              <path
                d="M 90 36 Q 97 52 90 68"
                stroke="#4A90D9"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
              >
                <animate attributeName="opacity" values="0.3;1;0.3" dur="0.9s" repeatCount="indefinite" />
              </path>
            </g>
          </>
        )}
      </svg>

      {/* Glow ring when playing */}
      {isPlaying && (
        <div
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: "2px solid #4A90D9",
            animation: "avatarPulse 1s ease-in-out infinite",
            opacity: 0.6,
          }}
        />
      )}

      <style>{`
        @keyframes avatarPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0.2; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
