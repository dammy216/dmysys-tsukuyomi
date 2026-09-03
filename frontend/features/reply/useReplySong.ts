"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REPLY_LOOP_GAP_SECONDS,
  REPLY_VIDEO_SRC,
  REPLY_VOCALS_SRC,
} from "./constants";

/**
 * 映像のズレの許容範囲(秒)。この中なら何もしない。
 * 口パクはボーカル解析から取るので、ホログラム映像のズレは多少あっても
 * 見た目にほぼ影響しない。
 */
const VIDEO_SYNC_TOLERANCE = 0.35;
/** これ以上ずれたらハードシーク(currentTime代入)で一気に合わせる */
const VIDEO_HARD_RESYNC = 1.2;
/** 速度微調整の最大量(±)。0.12なら最大 0.88〜1.12倍速で追従する */
const VIDEO_RATE_TRIM_MAX = 0.12;

/** ずれを直す間隔(ミリ秒) */
const SYNC_INTERVAL = 1000;

/**
 * 「Reply」の再生をまとめて受け持つ。
 *
 * - 映像を流し、音は映像トラック＋ボーカルステム(重ねて鳴らす)
 * - ボーカルを基準時計にして、映像のずれを定期的に直す
 * - ボーカルを解析につないで、かぐやの口パク用の振幅を取り出す
 *
 * ループは映像の ended で回す。ボーカルステム(269.3秒)は映像より長いので、
 * 映像が終わった時点でステムも止める = 超えた分がカットされる。
 *
 * ボタンを押すとほぼ即座に映像＋ステムを 0 秒から再生開始し、playing=true になる。
 */
export function useReplySong(active: boolean) {
  /*
    メディア要素は ref だけで持つ(useStarfallSong と同じ理由)。
    useMemo や state に入れると「フックへ渡した値」とみなされ、
    再生位置の書き換え(currentTime など)が lint で弾かれてしまう。
  */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const wiredRef = useRef(false);
  /*
    録画用の音声出力。ボーカルステムをここへも流し、getCaptureStream() で
    MediaRecorder に渡せる音声トラックにする(3D画面キャプチャと合成する)。
    映像の音声は要素そのままの出力なので、録画には別途 captureStream から乗る。
  */
  const captureDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  /*
    映像＋ステムを再生開始したら true。押した次の tick で true になる。
    呼び出し側(RootScene)はこれをストアへ橋渡しし、3Dシーンの演出と
    かぐやの歌唱を駆動する。
  */
  const [playing, setPlaying] = useState(false);

  // メディア要素は一度だけ作る(作り直すと読み込みからやり直しになる)
  useEffect(() => {
    const el = document.createElement("video");
    el.src = REPLY_VIDEO_SRC;
    // replyv2 は音声トラック付き。鳴らすのでミュートしない
    el.muted = false;
    // ループは映像・ステムをまとめて頭出しするため手動制御する
    el.loop = false;
    el.playsInline = true;
    el.preload = "auto";
    videoRef.current = el;

    const vocals = new Audio(REPLY_VOCALS_SRC);
    vocals.loop = false;
    vocals.preload = "auto";
    vocalsRef.current = vocals;

    return () => {
      el.pause();
      vocals.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  /**
   * ボーカルステムを Web Audio グラフへつなぐ。
   * createMediaElementSource は1つの要素につき一度しか呼べないので、
   * wiredRef で二重配線を防ぐ(useStarfallSong と同じ構成)。
   *
   * グラフ:
   *   vocals → analyser ─┬→ ctx.destination (スピーカー)
   *                       └→ captureDest     (録画)
   * analyser を通すのは口パクの振幅を取るため。
   */
  const wireAnalyser = useCallback(() => {
    /*
      HMR 等で「グラフはあるが録画用の出力(captureDest)だけ無い」状態に
      なることがある。その場合は既存グラフへ captureDest を足すだけにする。
    */
    if (wiredRef.current) {
      const ctx = audioCtxRef.current;
      if (ctx && !captureDestRef.current) {
        const captureDest = ctx.createMediaStreamDestination();
        analyserRef.current?.connect(captureDest);
        captureDestRef.current = captureDest;
      }
      return;
    }

    const vocals = vocalsRef.current;
    if (!vocals) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const vocalsSource = ctx.createMediaElementSource(vocals);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const captureDest = ctx.createMediaStreamDestination();

    vocalsSource.connect(analyser);
    analyser.connect(ctx.destination);
    analyser.connect(captureDest);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    captureDestRef.current = captureDest;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    wiredRef.current = true;
  }, []);

  // ReplyのON/OFFに合わせて、映像＋ステムをまとめて頭出し再生・停止する
  useEffect(() => {
    const video = videoRef.current;
    const vocals = vocalsRef.current;
    if (!video || !vocals) return;

    if (!active) {
      video.pause();
      vocals.pause();
      // playing=false への戻しは「active だった run のクリーンアップ」に任せる
      return;
    }

    /*
      再生開始はボタン操作(ユーザー操作)を起点にしたこの経路でしか行わない。
      自動再生の制限があるため、操作なしに鳴らそうとしても play() は拒否される。
    */
    wireAnalyser();
    audioCtxRef.current?.resume().catch(() => {});

    let cancelled = false;
    let loopTimer: number | undefined;

    const restart = () => {
      video.currentTime = 0;
      // 前の周で速度微調整が残っていることがあるので必ず戻す
      video.playbackRate = 1;
      vocals.currentTime = 0;
      video.play().catch(() => {});
      vocals.play().catch(() => {});
      setPlaying(true);
    };

    /*
      ループ。ここだけ星降る海と違い「映像の ended」で回す。
      ボーカルステム(269.3秒)は映像より長いので、ボーカルの ended を待つと
      曲が終わったあとぶら下がってしまう。映像が終わった時点でステムも
      止めることで、超えた分がそのままカットされる。
      次の周へすぐ入らず REPLY_LOOP_GAP_SECONDS だけ間をあける。
    */
    const handleEnded = () => {
      vocals.pause();
      loopTimer = window.setTimeout(restart, REPLY_LOOP_GAP_SECONDS * 1000);
    };

    const start = () => {
      if (cancelled) return;
      for (const m of [video, vocals]) {
        if (m.readyState === 0) m.load();
      }
      restart();
      video.addEventListener("ended", handleEnded);
    };
    // 1tick 遅らせて、setState をエフェクト本体から出す(cascading render 回避)
    const startTimer = window.setTimeout(start, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (loopTimer !== undefined) window.clearTimeout(loopTimer);
      video.removeEventListener("ended", handleEnded);
      setPlaying(false);
    };
  }, [active, wireAnalyser]);

  // 再生中のずれを定期的に直す(星降る海と同じ方式)
  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => {
      const video = videoRef.current;
      const vocals = vocalsRef.current;
      if (!video || !vocals || vocals.paused) return;

      // ボーカルを基準時計にする(口パクの元なので、映像をこれに合わせる)
      const t = vocals.currentTime;

      /*
        映像のズレ直し。ハードシークはCDN配信だとカクつくため大きく飛んだ
        ときだけに限定し、通常のズレは再生速度を少しだけ変えて詰める。
      */
      const videoDrift = video.currentTime - t;
      const absDrift = Math.abs(videoDrift);
      if (absDrift > VIDEO_HARD_RESYNC) {
        video.currentTime = t;
        video.playbackRate = 1;
      } else if (absDrift > VIDEO_SYNC_TOLERANCE) {
        const trim = Math.max(
          -VIDEO_RATE_TRIM_MAX,
          Math.min(VIDEO_RATE_TRIM_MAX, -videoDrift),
        );
        video.playbackRate = 1 + trim;
      } else if (video.playbackRate !== 1) {
        video.playbackRate = 1;
      }
    }, SYNC_INTERVAL);

    return () => window.clearInterval(id);
  }, [active]);

  /** ボーカルの音量(0〜1)。RMSで求める */
  const getAmplitude = useCallback((): number => {
    const analyser = analyserRef.current;
    const data = dataRef.current;
    if (!analyser || !data) return 0;

    analyser.getByteTimeDomainData(data);
    // 中心 128 からのずれの二乗平均
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / data.length);
    // 歌声が映えるよう少し強調する(星降る海と同じ倍率)
    return Math.min(rms * 3.5, 1);
  }, []);

  /*
    録画の直前に呼ぶ。Web Audio グラフを(まだなら)配線して AudioContext を
    resume する。Reply を再生していなくても音声トラック自体は用意される。
  */
  const prepareCaptureAudio = useCallback(() => {
    wireAnalyser();
    audioCtxRef.current?.resume().catch(() => {});
  }, [wireAnalyser]);

  /** 録画用の音声ストリーム。未配線なら null(無音の映像だけになる) */
  const getCaptureStream = useCallback(
    (): MediaStream | null => captureDestRef.current?.stream ?? null,
    [],
  );

  return {
    videoRef,
    /** 映像＋ステムを再生開始したら true。押した次の tick で true */
    playing,
    getAmplitude,
    prepareCaptureAudio,
    getCaptureStream,
  };
}
