"use client";

import { TRACKS } from "./constants";
import { useMusic } from "./MusicProvider";
import styles from "./MusicControls.module.css";

/** ホームの音楽再生コントロール（パート別 / 全部 / 停止 / 音量） */
export function MusicControls() {
  const { volume, playTrack, playYouTube, stop, setVolume } = useMusic();

  return (
    <div className={styles.controls}>
      {TRACKS.map((track) => (
        <button
          key={track.id}
          className={styles.button}
          onClick={() => playTrack(track.src)}
        >
          {track.label}
        </button>
      ))}
      <button
        className={`${styles.button} ${styles.youtube}`}
        onClick={playYouTube}
      >
        🎵 全部
      </button>
      <button className={`${styles.button} ${styles.stop}`} onClick={stop}>
        ⏹ 停止
      </button>

      <div className={styles.volume}>
        音量：
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}
