"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/*
  3D の <Canvas>(WebGLキャンバス)だけを captureStream で映像トラックにし、
  星降る海の音声(useStarfallSong の getCaptureStream)と合成して MediaRecorder で
  録画する。キャラ(ヤチヨ/かぐや)や下部バーは別DOMなので写らない。

  解像度はキャンバスのそのままのサイズ(= ウィンドウサイズ)。1080p 固定などは
  しない。綺麗に録りたいときはウィンドウを大きく or F11 フルスクリーンにする。

  形式は webm(VP9/Opus)。MediaRecorder は mp4 を安定して吐けないので
  実質 Chrome 系向けの機能になる(未対応環境では supported=false)。

  経過時間はここでは持たない(録画中ずっと state を更新すると SceneContents 系が
  再レンダーされ続ける)。表示は ControlBar 側の小さなタイマー部品に任せる。
*/

/** 対応環境なら最初にマッチしたものを使う。上ほど高品質 */
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

/** 取り込みフレームレート */
const CAPTURE_FPS = 60;
/**
 * 映像ビットレート。ネオンの粒＋ブルーム＋カメラの動きはエンコードが重く、
 * 低いとすぐブロックノイズが乗る。YouTube 素材用の実用的なスイートスポット
 * として 30 Mbps(1080p の再エンコード前提でも十分クリーン)。
 */
const VIDEO_BITS_PER_SECOND = 30_000_000;
/** 音声ビットレート */
const AUDIO_BITS_PER_SECOND = 192_000;
/** チャンクを回収する間隔(ミリ秒)。長い録画でも1つの巨大 Blob にしない */
const CHUNK_INTERVAL_MS = 1000;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return null;
}

let cachedSupport: boolean | null = null;

function canRecord(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  cachedSupport =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickMimeType() !== null;
  return cachedSupport;
}

/** 対応判定はブラウザでしか意味を持たない。SSR とクライアントの食い違いを避ける */
const subscribeSupport = () => () => {};

type Options = {
  /** 3Dキャンバスを返す(まだ用意できていなければ null) */
  getCanvas: () => HTMLCanvasElement | null;
  /**
   * 録画開始の直前に呼ぶ。星降る海の Web Audio グラフを(まだなら)配線し
   * AudioContext を resume する。これをしておかないと、星降る海を一度も
   * 再生していない状態や HMR 直後などで音声トラックが取れないことがある。
   */
  prepareAudio?: () => void;
  /** 星降る海の音声ストリーム。無ければ無音の映像だけ録る */
  getAudioStream: () => MediaStream | null;
};

export function useSceneRecorder({
  getCanvas,
  prepareAudio,
  getAudioStream,
}: Options) {
  // SSR は false、クライアントは実際の対応状況(hydration 差分を出さない)
  const supported = useSyncExternalStore(subscribeSupport, canRecord, () => false);
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const canvasStreamRef = useRef<MediaStream | null>(null);

  /** captureStream で取った映像トラックだけ止める(音声は永続グラフのものなので触らない) */
  const stopCanvasStream = useCallback(() => {
    canvasStreamRef.current?.getTracks().forEach((t) => t.stop());
    canvasStreamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(() => {
    if (recorderRef.current) return;

    // 音声グラフを確実に用意してから(星降る海未再生・HMR直後でもトラックを取れるように)
    prepareAudio?.();

    const canvas = getCanvas();
    const mime = pickMimeType();
    if (!canvas || !mime) return;

    const canvasStream = canvas.captureStream(CAPTURE_FPS);
    canvasStreamRef.current = canvasStream;

    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    const audio = getAudioStream();
    if (audio) tracks.push(...audio.getAudioTracks());
    else if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[useSceneRecorder] 音声トラックなしで録画します(星降る海の音声グラフ未配線)",
      );
    }
    const combined = new MediaStream(tracks);

    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(combined, {
        mimeType: mime,
        videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
        audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
      });
    } catch {
      stopCanvasStream();
      return;
    }

    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      const url = URL.createObjectURL(blob);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const a = document.createElement("a");
      a.href = url;
      a.download = `yachiyo-3d-${stamp}.webm`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);

      recorderRef.current = null;
      stopCanvasStream();
      setIsRecording(false);
    };

    recorderRef.current = rec;
    rec.start(CHUNK_INTERVAL_MS);
    setIsRecording(true);
  }, [getCanvas, prepareAudio, getAudioStream, stopCanvasStream]);

  const toggle = useCallback(() => {
    if (recorderRef.current) stop();
    else start();
  }, [start, stop]);

  // アンマウント時に録画中なら止めてストリームを解放する
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      recorderRef.current = null;
      stopCanvasStream();
    };
  }, [stopCanvasStream]);

  return { supported, isRecording, start, stop, toggle };
}
