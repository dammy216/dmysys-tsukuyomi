"use client";

import { useCallback, useRef, useState } from "react";
import { Sandbox3D } from "./Sandbox3D";
import { CharacterOverlay } from "./CharacterOverlay";
import { ControlBar } from "./ControlBar";
import { useStarfallSong } from "./useStarfallSong";
import { useSceneRecorder } from "./useSceneRecorder";
import type { SkyVariant } from "./SkyBackground";

/** 3Dサンドボックスページ本体。キャラ表示・空の見た目の状態を持ち、下部コントロールバーから操作する */
export function SandboxScene() {
  const [showKaguya, setShowKaguya] = useState(false);
  const [showYachiyo, setShowYachiyo] = useState(false);
  const [skyVariant, setSkyVariant] = useState<SkyVariant>("dusk");
  const [starfallSea, setStarfallSea] = useState(false);
  // 星降る海モード中だけ意味を持つ。true でカメラの自動演出を止めて自由視点にする
  const [starfallFreeCam, setStarfallFreeCam] = useState(false);

  /*
    星降る海の映像と音。映像はミュートで流し、音はボーカル／伴奏の
    2ステムを同時に鳴らす。ボーカルの音量はヤチヨの口パクにも使う。
    getSongCaptureStream は録画用の音声トラック(星降る海再生中のみ中身が入る)。
  */
  const {
    videoRef: hologramVideoRef,
    getAmplitude: getSongAmplitude,
    prepareCaptureAudio,
    getCaptureStream: getSongCaptureStream,
  } = useStarfallSong(starfallSea);

  /*
    3D画面の録画。WebGLキャンバス(captureStream)＋星降る海の音声を webm に。
    キャラや下部バーは別DOMなので写らない = 「3D画面だけ」。
    解像度はウィンドウそのまま。綺麗に録りたいときはウィンドウを大きく or F11。
  */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getCanvas = useCallback(() => canvasRef.current, []);
  const recorder = useSceneRecorder({
    getCanvas,
    prepareAudio: prepareCaptureAudio,
    getAudioStream: getSongCaptureStream,
  });

  const toggleKaguya = useCallback(() => setShowKaguya((v) => !v), []);
  const toggleYachiyo = useCallback(() => setShowYachiyo((v) => !v), []);
  const toggleStarfallSea = useCallback(() => {
    /*
      次の状態をここで確定させてから各stateへ流す。
      更新関数の中で別のstateを更新すると、更新関数が純粋でなくなり
      (開発時は二度実行される)予期しない挙動につながる。
    */
    const next = !starfallSea;
    setStarfallSea(next);
    // 歌うヤチヨを見せたいので、演出を始めるときは自動で表示する
    if (next) setShowYachiyo(true);
    // 次に星降る海に入るときは必ずアニメーションモードから始める
    setStarfallFreeCam(false);
  }, [starfallSea]);
  const toggleStarfallFreeCam = useCallback(
    () => setStarfallFreeCam((v) => !v),
    [],
  );

  return (
    <>
      <Sandbox3D
        skyVariant={skyVariant}
        starfallSea={starfallSea}
        starfallFreeCam={starfallFreeCam}
        hologramVideoRef={hologramVideoRef}
        onCanvasReady={(canvas) => {
          canvasRef.current = canvas;
        }}
      />
      <CharacterOverlay
        showKaguya={showKaguya}
        showYachiyo={showYachiyo}
        songActive={starfallSea}
        getSongAmplitude={getSongAmplitude}
      />
      <ControlBar
        showKaguya={showKaguya}
        showYachiyo={showYachiyo}
        onToggleKaguya={toggleKaguya}
        onToggleYachiyo={toggleYachiyo}
        skyVariant={skyVariant}
        onChangeSky={setSkyVariant}
        starfallSea={starfallSea}
        onToggleStarfallSea={toggleStarfallSea}
        starfallFreeCam={starfallFreeCam}
        onToggleStarfallFreeCam={toggleStarfallFreeCam}
        recorderSupported={recorder.supported}
        isRecording={recorder.isRecording}
        onToggleRecord={recorder.toggle}
      />
    </>
  );
}
