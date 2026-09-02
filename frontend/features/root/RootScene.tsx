"use client";

import { useCallback, useEffect, useRef } from "react";
import { CharacterOverlay } from "@/features/character-overlay";
import { ControlBar } from "@/features/scene-controls";
import { useStarfallSong } from "@/features/starfall-sea";
import { useReplySong } from "@/features/reply";
import { useSceneRecorder } from "@/features/scene-recording";
import { RootCanvas } from "./RootCanvas";
import { useSceneStore } from "./store";

/**
 * ルート("/")ページ本体。UI 状態は useSceneStore に持ち、ここでは
 * 副作用フック(音・録画)の配線と3レイヤーの合成だけを行う。
 */
export function RootScene() {
  // 音の立ち上げ/停止にモードを渡す必要があるので、ここだけ購読する
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const reply = useSceneStore((s) => s.reply);
  const setStarfallPlaying = useSceneStore((s) => s.setStarfallPlaying);
  const setReplyPlaying = useSceneStore((s) => s.setReplyPlaying);

  /*
    星降る海の映像と音。映像はミュートで流し、音はボーカル／伴奏の
    2ステムを同時に鳴らす。ボーカルの音量はヤチヨの口パクにも使う。
    getSongCaptureStream は録画用の音声トラック(星降る海再生中のみ中身が入る)。
    playing は「3つを再生開始したか」。押すとほぼ即座に true になる。
  */
  const {
    videoRef: hologramVideoRef,
    playing: starfallPlaying,
    getAmplitude: getStarfallAmplitude,
    prepareCaptureAudio: prepareStarfallAudio,
    getCaptureStream: getStarfallCaptureStream,
  } = useStarfallSong(starfallSea);

  /*
    Reply の映像と音。構成は星降る海と同じだが、歌うのはかぐやなので
    ボーカルの音量はかぐやの口パクに使う。映像(CPK)は元から音声トラックを
    持たないので、音は必ずステム側から鳴る。
  */
  const {
    videoRef: replyVideoRef,
    playing: replyPlaying,
    getAmplitude: getReplyAmplitude,
    prepareCaptureAudio: prepareReplyAudio,
    getCaptureStream: getReplyCaptureStream,
  } = useReplySong(reply);

  /*
    再生開始状態をストアへ橋渡しする。3Dシーン(Canvas内)とキャラの歌唱は
    この2つで駆動される(どちらも押した次の tick で true になる)。
    星降る海と Reply はストア側で排他になっているので同時に true にはならない。
  */
  useEffect(() => {
    setStarfallPlaying(starfallPlaying);
  }, [starfallPlaying, setStarfallPlaying]);

  useEffect(() => {
    setReplyPlaying(replyPlaying);
  }, [replyPlaying, setReplyPlaying]);

  /*
    3D画面の録画。WebGLキャンバス(captureStream)＋再生中の曲の音声を webm に。
    キャラや下部バーは別DOMなので写らない = 「3D画面だけ」。
    解像度はウィンドウそのまま。綺麗に録りたいときはウィンドウを大きく or F11。

    曲ごとに AudioContext が別なので、録画開始の時点で鳴っているほうの
    音声トラックを選ぶ。録画中にモードを切り替えると音は最初に選んだ側の
    ままになる(切り替えながら録る想定はしていない)。
  */
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getCanvas = useCallback(() => canvasRef.current, []);
  const prepareAudio = useCallback(() => {
    prepareStarfallAudio();
    prepareReplyAudio();
  }, [prepareStarfallAudio, prepareReplyAudio]);
  const getAudioStream = useCallback(
    () => (reply ? getReplyCaptureStream() : getStarfallCaptureStream()),
    [reply, getReplyCaptureStream, getStarfallCaptureStream],
  );
  const recorder = useSceneRecorder({
    getCanvas,
    prepareAudio,
    getAudioStream,
  });

  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasRef.current = canvas;
  }, []);

  return (
    <>
      <RootCanvas
        hologramVideoRef={hologramVideoRef}
        replyVideoRef={replyVideoRef}
        onCanvasReady={handleCanvasReady}
      />
      <CharacterOverlay
        getStarfallAmplitude={getStarfallAmplitude}
        getReplyAmplitude={getReplyAmplitude}
      />
      <ControlBar
        recorderSupported={recorder.supported}
        isRecording={recorder.isRecording}
        onToggleRecord={recorder.toggle}
      />
    </>
  );
}
