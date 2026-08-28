"use client";

import {
  PiArrowsOutCardinalBold,
  PiEyeBold,
  PiEyeSlashBold,
  PiMoonStarsBold,
  PiRecordFill,
  PiShootingStarBold,
  PiStopFill,
  PiSunHorizonBold,
  PiVideoCameraBold,
} from "react-icons/pi";
import { useEffect, useState } from "react";
import type { SkyVariant } from "./SkyBackground";
import styles from "./ControlBar.module.css";

type ControlBarProps = {
  showKaguya: boolean;
  showYachiyo: boolean;
  onToggleKaguya: () => void;
  onToggleYachiyo: () => void;
  skyVariant: SkyVariant;
  onChangeSky: (variant: SkyVariant) => void;
  starfallSea: boolean;
  onToggleStarfallSea: () => void;
  starfallFreeCam: boolean;
  onToggleStarfallFreeCam: () => void;
  /** この環境で録画(MediaRecorder + captureStream)が使えるか */
  recorderSupported: boolean;
  /** 録画中か */
  isRecording: boolean;
  /** 録画の開始/停止 */
  onToggleRecord: () => void;
};

/**
 * 録画ボタンの中で経過時間を数える小さな部品。
 * マウント(=録画開始)からの経過を1秒ごとに表示する。ここに閉じ込めることで、
 * 秒更新の再レンダーが ControlBar より上へ波及しない。
 */
function RecordingTime() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = performance.now();
    const id = window.setInterval(() => {
      setSeconds(Math.floor((performance.now() - started) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return <>{`${m}:${s.toString().padStart(2, "0")}`}</>;
}

/** サイト下部の近未来HUD風コントロールバー。キャラクター表示切替と空(黄昏時/夜)の切替をまとめる */
export function ControlBar({
  showKaguya,
  showYachiyo,
  onToggleKaguya,
  onToggleYachiyo,
  skyVariant,
  onChangeSky,
  starfallSea,
  onToggleStarfallSea,
  starfallFreeCam,
  onToggleStarfallFreeCam,
  recorderSupported,
  isRecording,
  onToggleRecord,
}: ControlBarProps) {
  return (
    <div className={styles.dock}>
      <div className={styles.bar}>
        <div className={styles.group}>
          <span className={styles.groupLabel}>CHARACTER</span>
          <button
            type="button"
            className={`${styles.pill} ${showKaguya ? styles.active : ""}`}
            onClick={onToggleKaguya}
            aria-pressed={showKaguya}
          >
            {showKaguya ? <PiEyeBold size={16} /> : <PiEyeSlashBold size={16} />}
            かぐや
          </button>
          <button
            type="button"
            className={`${styles.pill} ${showYachiyo ? styles.active : ""}`}
            onClick={onToggleYachiyo}
            aria-pressed={showYachiyo}
          >
            {showYachiyo ? <PiEyeBold size={16} /> : <PiEyeSlashBold size={16} />}
            ヤチヨ
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.group}>
          <span className={styles.groupLabel}>SKY</span>
          <button
            type="button"
            className={`${styles.pill} ${skyVariant === "dusk" ? styles.active : ""}`}
            onClick={() => onChangeSky("dusk")}
            aria-pressed={skyVariant === "dusk"}
          >
            <PiSunHorizonBold size={16} />
            夕暮れ
          </button>
          <button
            type="button"
            className={`${styles.pill} ${skyVariant === "night" ? styles.active : ""}`}
            onClick={() => onChangeSky("night")}
            aria-pressed={skyVariant === "night"}
          >
            <PiMoonStarsBold size={16} />夜
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.group}>
          <span className={styles.groupLabel}>SCENE</span>
          <button
            type="button"
            className={`${styles.pill} ${styles.starfall} ${starfallSea ? styles.active : ""}`}
            onClick={onToggleStarfallSea}
            aria-pressed={starfallSea}
          >
            <PiShootingStarBold size={16} />
            星降る海
          </button>
          {/* 星降る海モード中だけ意味を持つカメラ切替。それ以外は押せなくする */}
          <button
            type="button"
            className={`${styles.pill} ${starfallFreeCam ? styles.active : ""}`}
            onClick={onToggleStarfallFreeCam}
            disabled={!starfallSea}
            aria-pressed={starfallFreeCam}
          >
            {starfallFreeCam ? (
              <PiArrowsOutCardinalBold size={16} />
            ) : (
              <PiVideoCameraBold size={16} />
            )}
            {starfallFreeCam ? "自由視点" : "アニメーション"}
          </button>
        </div>

        <div className={styles.divider} />

        <div className={styles.group}>
          <span className={styles.groupLabel}>CAPTURE</span>
          {/* 3D画面(WebGLキャンバス)＋星降る海の音声を webm で録画する */}
          <button
            type="button"
            className={`${styles.pill} ${isRecording ? styles.recording : ""}`}
            onClick={onToggleRecord}
            disabled={!recorderSupported}
            aria-pressed={isRecording}
            title={
              recorderSupported
                ? "3D画面＋音声を録画(webm)"
                : "この環境では録画できません"
            }
          >
            {isRecording ? (
              <PiStopFill size={16} />
            ) : (
              <PiRecordFill size={16} />
            )}
            {isRecording ? <RecordingTime /> : "録画"}
          </button>
        </div>
      </div>
    </div>
  );
}
