"use client";

import { useCallback, useRef } from "react";
import { CharacterOverlay } from "@/features/character-overlay";
import { ControlBar } from "@/features/scene-controls";
import { useStarfallSong } from "@/features/starfall-sea";
import { useSceneRecorder } from "@/features/scene-recording";
import { RootCanvas } from "./RootCanvas";
import { useSceneStore } from "./store";

/**
 * ルート("/")ページ本体。UI 状態は useSceneStore に持ち、ここでは
 * 副作用フック(音・録画)の配線と3レイヤーの合成だけを行う。
 */
export function RootScene() {
  // 音の立ち上げ/停止に starfallSea を渡す必要があるので、ここだけ購読する
  const starfallSea = useSceneStore((s) => s.starfallSea);

  /*
    星降る海の映像と音。映像はミュートで流し、音はボーカル／伴奏の
    2ステムを同時に鳴らす。ボーカルの音量はヤチヨの口パクにも使う。
    getSongCaptureStream は録画用の音声トラック(星降る海再生中のみ中身が入る)。
  */
  const {
    videoRef: hologramVideoRef,
    loading: starfallLoading,
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

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  return (
    <>
      <RootCanvas
        hologramVideoRef={hologramVideoRef}
        onCanvasReady={handleCanvasReady}
      />
      <CharacterOverlay getSongAmplitude={getSongAmplitude} />
      <ControlBar
        starfallLoading={starfallLoading}
        recorderSupported={recorder.supported}
        isRecording={recorder.isRecording}
        onToggleRecord={recorder.toggle}
      />
    </>
  );
}
