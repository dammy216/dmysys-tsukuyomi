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
import { useSceneStore } from "@/features/root/store";

type ControlBarProps = {
  /** この環境で録画(MediaRecorder + captureStream)が使えるか */
  recorderSupported: boolean;
  /** 録画中か */
  isRecording: boolean;
  /** 録画の開始/停止 */
  onToggleRecord: () => void;
};

/*
  ピル型トグルボタンの共通クラス。押下状態は各ボタンの aria-pressed を
  そのまま aria-pressed: バリアントで拾う（JS 側で active クラスを足さない）。
*/
const PILL_LAYOUT =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 " +
  "text-[0.8rem] font-bold cursor-pointer transition duration-200 " +
  "disabled:opacity-35 disabled:cursor-not-allowed " +
  "max-sm:text-[0.72rem] max-sm:min-h-10 max-sm:px-2.5 max-sm:py-1.5";

const CYAN_IDLE =
  "text-white/75 bg-hud/6 border-hud/25 " +
  "hover:bg-hud/14 hover:border-hud/60 hover:text-white " +
  "disabled:hover:bg-hud/6 disabled:hover:border-hud/25 disabled:hover:text-white/75";

const CYAN_PRESSED =
  "aria-pressed:bg-hud/18 aria-pressed:border-hud aria-pressed:text-hud " +
  "aria-pressed:shadow-[0_0_16px_rgb(93_227_230/0.5)]";

/** 通常のトグル（かぐや / ヤチヨ / 空 / カメラ切替） */
const PILL_CYAN = `${PILL_LAYOUT} ${CYAN_IDLE} ${CYAN_PRESSED}`;

/*
  「星降る海」はシーン全体を演出モードへ切り替える主役ボタンなので、
  ピンク寄りのアクセント色にして押せることが一目で分かるようにする。
*/
const PILL_PINK =
  `${PILL_LAYOUT} ` +
  "text-[#ffbedc]/85 bg-hud-pink/8 border-hud-pink/35 " +
  "hover:bg-hud-pink/18 hover:border-hud-pink/70 hover:text-white " +
  "aria-pressed:bg-hud-pink/22 aria-pressed:border-hud-pink aria-pressed:text-[#ff8fc4] " +
  "aria-pressed:shadow-[0_0_20px_rgb(250_5_119/0.6)] " +
  // 読み込み中は disabled。ホバーで色が動かないよう明示的に戻す
  "disabled:hover:bg-hud-pink/8 disabled:hover:border-hud-pink/35 disabled:hover:text-[#ffbedc]/85";

/*
  録画ボタン。待機中はシアンのピル、録画中(aria-pressed)は赤で点滅させて
  「録れている」ことを一目で分かるようにする。
*/
const PILL_REC =
  `${PILL_LAYOUT} ${CYAN_IDLE} motion-reduce:animate-none ` +
  "aria-pressed:text-hud-rec aria-pressed:bg-hud-rec/16 aria-pressed:border-hud-rec " +
  "aria-pressed:shadow-[0_0_16px_rgb(255_91_110/0.5)] aria-pressed:animate-record " +
  "aria-pressed:hover:bg-hud-rec/26 aria-pressed:hover:border-hud-rec aria-pressed:hover:text-white";

const GROUP = "flex items-center gap-1.5";
const GROUP_LABEL =
  "text-hud/70 text-[10px] font-extrabold tracking-[0.12em] pr-1 whitespace-nowrap max-sm:hidden";
/* 折り返すと縦線が宙に浮くので、スマホでは仕切りを消して余白で区切る */
const DIVIDER =
  "w-px self-stretch m-0.5 bg-[linear-gradient(180deg,transparent,rgb(93_227_230/0.45),transparent)] max-sm:hidden";

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
  recorderSupported,
  isRecording,
  onToggleRecord,
}: ControlBarProps) {
  const showKaguya = useSceneStore((s) => s.showKaguya);
  const showYachiyo = useSceneStore((s) => s.showYachiyo);
  const skyVariant = useSceneStore((s) => s.skyVariant);
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const starfallFreeCam = useSceneStore((s) => s.starfallFreeCam);
  const onToggleKaguya = useSceneStore((s) => s.toggleKaguya);
  const onToggleYachiyo = useSceneStore((s) => s.toggleYachiyo);
  const onChangeSky = useSceneStore((s) => s.setSkyVariant);
  const onToggleStarfallSea = useSceneStore((s) => s.toggleStarfallSea);
  const onToggleStarfallFreeCam = useSceneStore((s) => s.toggleStarfallFreeCam);

  return (
    <div
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-20 -translate-x-1/2
        rounded-full p-0.5
        bg-[linear-gradient(90deg,var(--color-hud),#7c7ce6_50%,var(--color-hud))]
        shadow-[0_0_30px_rgb(93_227_230/0.35),0_14px_34px_rgb(0_0_0/0.5)]
        max-sm:left-[max(0.75rem,env(safe-area-inset-left))] max-sm:right-[max(0.75rem,env(safe-area-inset-right))] max-sm:translate-x-0"
    >
      <div className="flex items-center gap-2.5 rounded-full bg-hud-glass px-3.5 py-2 backdrop-blur-sm max-sm:flex-wrap max-sm:justify-center max-sm:gap-1.5 max-sm:rounded-[20px]">
        <div className={GROUP}>
          <span className={GROUP_LABEL}>CHARACTER</span>
          <button
            type="button"
            className={PILL_CYAN}
            onClick={onToggleKaguya}
            aria-pressed={showKaguya}
          >
            {showKaguya ? <PiEyeBold size={16} /> : <PiEyeSlashBold size={16} />}
            かぐや
          </button>
          <button
            type="button"
            className={PILL_CYAN}
            onClick={onToggleYachiyo}
            aria-pressed={showYachiyo}
          >
            {showYachiyo ? <PiEyeBold size={16} /> : <PiEyeSlashBold size={16} />}
            ヤチヨ
          </button>
        </div>

        <div className={DIVIDER} />

        <div className={GROUP}>
          <span className={GROUP_LABEL}>SKY</span>
          <button
            type="button"
            className={PILL_CYAN}
            onClick={() => onChangeSky("dusk")}
            aria-pressed={skyVariant === "dusk"}
          >
            <PiSunHorizonBold size={16} />
            夕暮れ
          </button>
          <button
            type="button"
            className={PILL_CYAN}
            onClick={() => onChangeSky("night")}
            aria-pressed={skyVariant === "night"}
          >
            <PiMoonStarsBold size={16} />夜
          </button>
        </div>

        <div className={DIVIDER} />

        <div className={GROUP}>
          <span className={GROUP_LABEL}>SCENE</span>
          <button
            type="button"
            className={PILL_PINK}
            onClick={onToggleStarfallSea}
            aria-pressed={starfallSea}
          >
            <PiShootingStarBold size={16} />
            星降る海
          </button>
          {/* 星降る海モード中だけ意味を持つカメラ切替。それ以外は押せなくする */}
          <button
            type="button"
            className={PILL_CYAN}
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

        <div className={DIVIDER} />

        <div className={GROUP}>
          <span className={GROUP_LABEL}>CAPTURE</span>
          {/* 3D画面(WebGLキャンバス)＋星降る海の音声を webm で録画する */}
          <button
            type="button"
            className={PILL_REC}
            onClick={onToggleRecord}
            disabled={!recorderSupported}
            aria-pressed={isRecording}
            title={
              recorderSupported
                ? "3D画面＋音声を録画(webm)"
                : "この環境では録画できません"
            }
          >
            {isRecording ? <PiStopFill size={16} /> : <PiRecordFill size={16} />}
            {isRecording ? <RecordingTime /> : "録画"}
          </button>
        </div>
      </div>
    </div>
  );
}
