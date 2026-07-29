"use client";

import { useCallback, useRef, useState, type CSSProperties } from "react";
import { YachiyoCharacter } from "@/features/character";
import { useVideoAmplitude } from "./useVideoAmplitude";
import { VIDEO_SRC } from "./constants";
import styles from "./StarSongStage.module.css";

/** 動画（ネオン枠の表示領域） + 動画の横に、ホームと同じ大きさで並ぶヤチヨ */
export function StarSongStage() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { setup, resume, getAmplitude } = useVideoAmplitude();

  // rAF ごとに呼ばれるため setState ではなく CSS カスタムプロパティへ直接反映する
  const handleAmplitude = useCallback((amp: number) => {
    stageRef.current?.style.setProperty("--amp", amp.toFixed(3));
  }, []);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    setup(video);
    resume();
    video.play().catch(() => {});
  };

  // 動画そのものが唯一の再生コントロール（クリックで再生⇔一時停止）
  const handleToggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      handlePlay();
    } else {
      video.pause();
    }
  };

  return (
    <div ref={stageRef} className={styles.stage}>
      <div className={styles.row}>
        <div className={styles.panel}>
          <div className={styles.panelInner}>
            <div className={styles.videoFrame} onClick={handleToggle}>
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                playsInline
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
                className={styles.video}
              />

              {!isPlaying && (
                <button
                  type="button"
                  className={styles.playOverlay}
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePlay();
                  }}
                  aria-label="動画を再生してヤチヨの歌を聴く"
                >
                  <span className={styles.playRing} />
                  <span className={styles.playIcon}>▶</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 動画の横に、ホームの常設キャラクター表示と同じ大きさで配置。
            動画パネルと対になるネオン枠。名前は上、イコライザーは下に配置する */}
        <div className={styles.characterArea}>
          <div className={styles.characterPanel}>
            <div className={styles.characterPanelInner}>
              <div className={styles.nameTag}>月見ヤチヨ</div>
              <div className={styles.characterStage}>
                <YachiyoCharacter
                  getAmplitude={getAmplitude}
                  onAmplitude={handleAmplitude}
                  placeholder={<div className={styles.placeholder} />}
                />
              </div>
              <div className={styles.equalizer} aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className={styles.bar}
                    style={{ "--i": i } as CSSProperties}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
