"use client";

import { useCallback, useEffect, useRef } from "react";

/** ホログラムに映す映像。音声は使わないので必ずミュートで再生する */
const VIDEO_SRC = encodeURI("/videos/星降る海.mp4");
/** ボーカルのみのステム。口パクの振幅はここから取る */
const VOCALS_SRC = encodeURI(
  "/sounds/星降る海-vocals-Eb major-101bpm-440hz.m4a",
);
/** 伴奏のステム。ボーカルと同時に鳴らして1曲になる */
const OTHER_SRC = encodeURI("/sounds/星降る海-other-Eb major-101bpm-440hz.m4a");

/**
 * ステム2つを鳴らし始める時刻を「今から何秒後」に置くか(秒)。
 * 両方の AudioBufferSourceNode.start(when) に同じ when を渡して、
 * サンプル単位で同時刻に始める。ぴったり ctx.currentTime を渡すと
 * 頭が欠けることがあるので、ほんの少し先へ置く。
 *
 * ステムは同じ AudioContext の時計で進むので、一度 start を揃えれば
 * 以後ずれない(HTMLAudioElement を2つ鳴らしていた頃は、要素ごとに
 * 別の時計で動くうえモバイルでは再生開始がばらつき、currentTime 代入で
 * 追いかけても収束しなかった)。
 */
const START_LEAD = 0.06;

/**
 * 映像のズレの許容範囲(秒)。この中なら何もしない。
 * 口パクはボーカル解析から取るので、ホログラム映像のズレは多少あっても
 * 見た目にほぼ影響しない。狭いと下の再生速度の微調整が常に効いてしまう。
 */
const VIDEO_SYNC_TOLERANCE = 0.35;
/**
 * これ以上ずれたらハードシーク(currentTime代入)で一気に合わせる。
 * ループ直後・タブ復帰・長時間の重い処理などで大きく飛んだときだけ。
 * Vercel配信だとシークのたびにCDNへ範囲リクエストが飛んでカクつくため、
 * 通常のズレは下の再生速度の微調整だけで詰める。
 */
const VIDEO_HARD_RESYNC = 1.2;
/** 速度微調整の最大量(±)。0.12なら最大 0.88〜1.12倍速で追従する */
const VIDEO_RATE_TRIM_MAX = 0.12;

/** ずれを直す間隔(ミリ秒) */
const SYNC_INTERVAL = 1000;

/**
 * 映像・音が終わってから、次の周を頭出し再生するまでの余白(秒)。
 * アウトロ(Sandbox3D.tsx の OUTRO_START_SECONDS〜)で魚・水中フィルター・
 * ホログラムなどの演出が消えきったあと、すぐ次のループへ入らず一拍おく。
 */
const LOOP_GAP_SECONDS = 0.6;

/**
 * 「星降る海」の再生をまとめて受け持つ。
 *
 * - 映像はミュートで流し、音はボーカル／伴奏の2ステムを同時に鳴らす
 * - 2ステムは Web Audio にデコードして、同じ AudioContext の時計で鳴らす
 *   ので互いにずれない。基準時計は ctx.currentTime
 * - その基準時計に映像のずれを定期的に合わせる
 * - ボーカルだけ analyser につないで、口パク用の振幅を取り出す
 *
 * 映像とステムは同じ音源から作られていて長さもほぼ同じ(約141.8秒)なので、
 * 3つとも同じ時刻に合わせれば口の動きと映像と音が揃う。
 */
export function useStarfallSong(active: boolean) {
  /*
    映像要素は ref だけで持つ。
    useMemo や state に入れると「フックへ渡した値」とみなされ、
    再生位置の書き換え(currentTime など)が lint で弾かれてしまう。
    受け取る側(ToriiHologram)は、中身が入り次第テクスチャを貼る作りにしてある。
  */
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  /*
    録画用の音声出力。ボーカル＋伴奏をここへも流し、getCaptureStream() で
    MediaRecorder に渡せる音声トラックにする(3D画面キャプチャと合成する)。
  */
  const captureDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  /** デコード済みのステム。両方揃って初めて再生できる */
  const vocalsBufferRef = useRef<AudioBuffer | null>(null);
  const otherBufferRef = useRef<AudioBuffer | null>(null);
  /** 生の音声データ。mount 時に取得だけ済ませ、AudioContext ができ次第デコードする */
  const encodedRef = useRef<Promise<[ArrayBuffer, ArrayBuffer]> | null>(null);
  /** デコード中の Promise(二重デコード防止)。失敗したら null に戻して次で作り直す */
  const decodePromiseRef = useRef<Promise<void> | null>(null);

  /** いま鳴っているステムのノード。ループのたびに作り直す(一度きりの使い捨て) */
  const vocalsSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const otherSrcRef = useRef<AudioBufferSourceNode | null>(null);
  /** ctx.currentTime 基準での曲の開始時刻。曲内位置 = ctx.currentTime - この値 */
  const startTimeRef = useRef(0);
  /** 再生中か。曲末尾で来る ended と、stop() で来る ended を区別する */
  const playingRef = useRef(false);
  const stoppingRef = useRef(false);
  /** ループ待ちのタイマー */
  const loopTimerRef = useRef<number | undefined>(undefined);
  /** ループの頭出しから自分を呼び直すための最新参照(useCallback の自己参照回避) */
  const startPlaybackRef = useRef<() => void>(() => {});

  // 映像要素は一度だけ作る。音声データも mount 時に取得だけ先に済ませる
  useEffect(() => {
    const el = document.createElement("video");
    el.src = VIDEO_SRC;
    // 「動画の音は使わない」。音は必ずステム側から鳴らす
    el.muted = true;
    // ループは映像・ステム2つをまとめて頭出しするため、
    // ネイティブloopではなく手動制御する(下のactiveエフェクト参照)
    el.loop = false;
    el.playsInline = true;
    el.preload = "auto";
    videoRef.current = el;

    /*
      ステムの取得だけ先に走らせる(デコードは AudioContext ができてから)。
      AudioContext はユーザー操作を起点にしか作れないが、fetch は今できる。
    */
    encodedRef.current = Promise.all([
      fetch(VOCALS_SRC).then((r) => r.arrayBuffer()),
      fetch(OTHER_SRC).then((r) => r.arrayBuffer()),
    ]);

    return () => {
      el.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  /**
   * AudioContext と、口パク解析用の analyser・録画用の出力を用意する。
   * ステムのデコードは伴わない(同期的に済むところまで)。
   *
   * グラフ:
   *   vocalsSrc → analyser ─┬→ ctx.destination (スピーカー)
   *                          └→ captureDest     (録画)
   *   otherSrc ─────────────┬→ ctx.destination
   *                          └→ captureDest
   * analyser は使い回すので常時つなぎっぱなし。ステムのノード
   * (vocalsSrc / otherSrc)は一度しか start できないので再生のたびに作る。
   */
  const ensureGraph = useCallback((): AudioContext | null => {
    const existing = audioCtxRef.current;
    if (existing && existing.state !== "closed") return existing;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;

    const ctx = new AudioCtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const captureDest = ctx.createMediaStreamDestination();

    // ボーカル(analyser経由)は常にスピーカーと録画の両方へ。
    // 伴奏は再生のたびに作る otherSrc から都度つなぐ。
    analyser.connect(ctx.destination);
    analyser.connect(captureDest);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    captureDestRef.current = captureDest;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

    // HMR 等で ctx を作り直したときは、バッファも取り直す
    vocalsBufferRef.current = null;
    otherBufferRef.current = null;
    decodePromiseRef.current = null;
    return ctx;
  }, []);

  /** ステム2つをデコードして AudioBuffer にする(一度だけ) */
  const ensureBuffers = useCallback(async (): Promise<void> => {
    if (vocalsBufferRef.current && otherBufferRef.current) return;
    if (decodePromiseRef.current) return decodePromiseRef.current;

    const ctx = ensureGraph();
    const encoded = encodedRef.current;
    if (!ctx || !encoded) return;

    const run = (async () => {
      const [vocalsData, otherData] = await encoded;
      // decodeAudioData は渡した ArrayBuffer を消費するので slice して渡す
      // (失敗時に作り直せるよう元データは残す)
      const [vocalsBuf, otherBuf] = await Promise.all([
        ctx.decodeAudioData(vocalsData.slice(0)),
        ctx.decodeAudioData(otherData.slice(0)),
      ]);
      vocalsBufferRef.current = vocalsBuf;
      otherBufferRef.current = otherBuf;
    })().catch(() => {
      // 取得・デコードに失敗したら次の機会に作り直せるようにする
      decodePromiseRef.current = null;
    });

    decodePromiseRef.current = run;
    return run;
  }, [ensureGraph]);

  /** 鳴っているステムのノードを止めて片付ける */
  const teardownSources = useCallback(() => {
    for (const src of [vocalsSrcRef.current, otherSrcRef.current]) {
      if (!src) continue;
      src.onended = null;
      try {
        src.stop();
      } catch {
        // すでに停止済みなら何もしない
      }
      src.disconnect();
    }
    vocalsSrcRef.current = null;
    otherSrcRef.current = null;
  }, []);

  /** 頭出しして3つ(映像＋ステム2つ)を同時刻から鳴らす */
  const startPlayback = useCallback(() => {
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    const captureDest = captureDestRef.current;
    const vocalsBuf = vocalsBufferRef.current;
    const otherBuf = otherBufferRef.current;
    const video = videoRef.current;
    if (!ctx || !analyser || !captureDest || !vocalsBuf || !otherBuf || !video) {
      return;
    }

    // 前の周のノードが残っていれば片付ける(onended は無効化されるので来ない)
    teardownSources();

    const vocalsSrc = ctx.createBufferSource();
    vocalsSrc.buffer = vocalsBuf;
    vocalsSrc.connect(analyser);

    const otherSrc = ctx.createBufferSource();
    otherSrc.buffer = otherBuf;
    otherSrc.connect(ctx.destination);
    otherSrc.connect(captureDest);

    // 2つとも同じ when で開始 = サンプル単位で同時刻スタート
    const startAt = ctx.currentTime + START_LEAD;
    vocalsSrc.start(startAt);
    otherSrc.start(startAt);
    startTimeRef.current = startAt;

    stoppingRef.current = false;
    playingRef.current = true;
    vocalsSrcRef.current = vocalsSrc;
    otherSrcRef.current = otherSrc;

    /*
      ループ。ボーカルが最後まで再生されたら(= 意図的な stop でなければ)、
      LOOP_GAP_SECONDS だけ間をあけてから頭出しして鳴らし直す。
      伴奏もほぼ同時に終わるが、基準はボーカル1本だけ見る。
    */
    vocalsSrc.onended = () => {
      if (stoppingRef.current) return;
      playingRef.current = false;
      loopTimerRef.current = window.setTimeout(
        () => startPlaybackRef.current(),
        LOOP_GAP_SECONDS * 1000,
      );
    };

    // 映像はミュートのまま頭出しして流し、曲内位置へ寄せる(下の同期エフェクト)
    video.currentTime = 0;
    video.playbackRate = 1;
    video.play().catch(() => {});
  }, [teardownSources]);

  // ループの setTimeout から常に最新の startPlayback を呼べるようにしておく
  useEffect(() => {
    startPlaybackRef.current = startPlayback;
  }, [startPlayback]);

  /** 再生を止める(active OFF・アンマウント時) */
  const stopPlayback = useCallback(() => {
    stoppingRef.current = true;
    playingRef.current = false;
    if (loopTimerRef.current !== undefined) {
      window.clearTimeout(loopTimerRef.current);
      loopTimerRef.current = undefined;
    }
    teardownSources();
    videoRef.current?.pause();
  }, [teardownSources]);

  /** 曲の現在位置(秒)。停止中は 0 */
  const songPosition = useCallback((): number => {
    const ctx = audioCtxRef.current;
    if (!ctx || !playingRef.current) return 0;
    return Math.max(0, ctx.currentTime - startTimeRef.current);
  }, []);

  // 星降る海のON/OFFに合わせて、まとめて頭出し再生・停止する
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    /*
      再生開始はボタン操作(ユーザー操作)を起点にしたこの経路でしか行わない。
      自動再生の制限があるため、操作なしに鳴らそうとしても弾かれる。
    */
    ensureGraph();
    audioCtxRef.current?.resume().catch(() => {});

    void (async () => {
      await ensureBuffers();
      if (cancelled) return;
      try {
        await audioCtxRef.current?.resume();
      } catch {
        // resume 失敗時はそのまま start してみる
      }
      if (cancelled) return;
      startPlayback();
    })();

    return () => {
      cancelled = true;
      stopPlayback();
    };
  }, [active, ensureGraph, ensureBuffers, startPlayback, stopPlayback]);

  // 再生中、映像のずれを定期的に直す
  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !playingRef.current) return;

      // 基準は AudioContext の時計。ステム2つはこれで完全に同期しているので、
      // ここで直すのは映像だけ。
      const t = songPosition();

      /*
        映像のズレ直し。ハードシーク(currentTime代入)はCDN配信だと範囲
        リクエスト＋キーフレームまで遡ってのデコードでカクつくため、
        大きく飛んだときだけに限定する。通常のズレは再生速度を少しだけ
        変えて数秒かけて滑らかに詰める(ミュート映像なので速度変化は
        見た目に分からない)。
      */
      const videoDrift = video.currentTime - t;
      const absDrift = Math.abs(videoDrift);
      if (absDrift > VIDEO_HARD_RESYNC) {
        video.currentTime = t;
        video.playbackRate = 1;
      } else if (absDrift > VIDEO_SYNC_TOLERANCE) {
        // 進みすぎ(drift>0)なら遅く、遅れているなら速く。ズレに比例させる
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
  }, [active, songPosition]);

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
    // 歌声が映えるよう少し強調する(/song ページと同じ倍率)
    return Math.min(rms * 3.5, 1);
  }, []);

  /*
    録画の直前に呼ぶ。Web Audio グラフを(まだなら)配線して AudioContext を
    resume し、ステムのデコードも走らせておく。星降る海を再生していなくても
    音声トラック自体は用意される(中身は無音)。
  */
  const prepareCaptureAudio = useCallback(() => {
    ensureGraph();
    audioCtxRef.current?.resume().catch(() => {});
    void ensureBuffers();
  }, [ensureGraph, ensureBuffers]);

  /** 録画用の音声ストリーム。未配線なら null(無音の映像だけになる) */
  const getCaptureStream = useCallback(
    (): MediaStream | null => captureDestRef.current?.stream ?? null,
    [],
  );

  return {
    videoRef,
    getAmplitude,
    prepareCaptureAudio,
    getCaptureStream,
  };
}
