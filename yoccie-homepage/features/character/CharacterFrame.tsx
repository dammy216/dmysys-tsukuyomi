"use client";

import { useRef } from "react";
import { YachiyoCharacter } from "./YachiyoCharacter";
import styles from "./CharacterFrame.module.css";

export function CharacterFrame() {
  const frameRef = useRef<HTMLDivElement | null>(null);

  const handleAmplitude = (amp: number) => {
    frameRef.current?.style.setProperty("--amp", amp.toFixed(3));
  };

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
