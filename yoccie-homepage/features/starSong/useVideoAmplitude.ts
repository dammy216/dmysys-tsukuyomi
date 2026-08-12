"use client";

import { useCallback, useRef } from "react";

/**
 * <video> 要素の音声を Web Audio API で解析し、0〜1 の振幅を返すフック（RMS方式）。
 */
export function useVideoAmplitude() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  /**
   * ユーザー操作（再生クリック）時に呼ぶ。createMediaElementSource は
   * 同一要素につき一度しか呼べないため sourceRef で二重セットアップを防ぐ。
   */
  const setup = useCallback((video: HTMLVideoElement) => {
    if (sourceRef.current) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(video);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    // source → analyser → 出力（destination につながないと音が出なくなる）
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }, []);

  const resume = useCallback(() => {
    audioCtxRef.current?.resume().catch(() => {});
  }, []);

  const getAmplitude = useCallback((): number => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return 0;
    analyser.getByteTimeDomainData(data);
    // 中心 128 からの RMS を 0〜1 に正規化
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length);
    return Math.min(rms * 3.5, 1); // 歌声が映えるよう少し強調
  }, []);

  return { setup, resume, getAmplitude };
}
