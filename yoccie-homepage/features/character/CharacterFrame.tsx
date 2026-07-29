"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { YachiyoCharacter } from "./YachiyoCharacter";
import styles from "./CharacterFrame.module.css";

/** ヤチヨが大きく登場する専用ページでは、右上の常設フレームは重複するので隠す */
const HIDDEN_ON = ["/song"];

export function CharacterFrame() {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  const handleAmplitude = (amp: number) => {
    frameRef.current?.style.setProperty("--amp", amp.toFixed(3));
  };

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <div ref={frameRef} className={styles.frame} aria-hidden>
      <div className={styles.stage}>
        <YachiyoCharacter
          onAmplitude={handleAmplitude}
          placeholder={<div className={styles.placeholder}>🌙</div>}
        />
      </div>
    </div>
  );
}
