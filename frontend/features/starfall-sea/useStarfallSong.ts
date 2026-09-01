"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** ホログラムに映す映像。音声は使わないので必ずミュートで再生する */
const VIDEO_SRC = encodeURI("/videos/星降る海.mp4");
/** ボーカルのみのステム。口パクの振幅はここから取る */
const VOCALS_SRC = encodeURI(
  "/sounds/星降る海-vocals-Eb major-101bpm-440hz.m4a",
);
/** 伴奏のステム。ボーカルと同時に鳴らして1曲になる */
const OTHER_SRC = encodeURI("/sounds/星降る海-other-Eb major-101bpm-440hz.m4a");

/**
 * ステム同士がこれ以上ずれたら合わせ直す(秒)。
 * 2つは同じ音源を分離したものなので、ずれるとフランジングして明確に濁る。
 */
const AUDIO_SYNC_TOLERANCE = 0.05;

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
 * - ボーカルを基準時計にして、伴奏と映像のずれを定期的に直す
 * - ボーカルだけ解析につないで、口パク用の振幅を取り出す
 *
 * 映像とステムは同じ音源から作られていて長さもほぼ同じ(約141.8秒)なので、
 * 3つとも同じ時刻に合わせれば口の動きと映像と音が揃う。
 *
 * ボタンを押すとほぼ即座に3つを再生開始し、playing=true になる。
 * 3Dシーンの演出とヤチヨの歌唱はこの playing で駆動される。
 */
export function useStarfallSong(active: boolean) {
  /*
    メディア要素は ref だけで持つ。
    useMemo や state に入れると「フックへ渡した値」とみなされ、
    再生位置の書き換え(currentTime など)が lint で弾かれてしまう。
    受け取る側(ToriiHologram)は、中身が入り次第テクスチャを貼る作りにしてある。
  */
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const vocalsRef = useRef<HTMLAudioElement | null>(null);
  const otherRef = useRef<HTMLAudioElement | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const otherSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const wiredRef = useRef(false);
  /*
    録画用の音声出力。ボーカル＋伴奏をここへも流し、getCaptureStream() で
    MediaRecorder に渡せる音声トラックにする(3D画面キャプチャと合成する)。
  */
  const captureDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  /*
    3つ(映像＋ステム2本)を再生開始したら true。ボタンを押した次の tick で
    true になる。呼び出し側(RootScene)はこれをストアへ橋渡しし、3Dシーンの
    演出とヤチヨの歌唱を駆動する。
  */
  const [playing, setPlaying] = useState(false);

  // メディア要素は一度だけ作る(作り直すと読み込みからやり直しになる)
  useEffect(() => {
    const el = document.createElement("video");
    el.src = VIDEO_SRC;
    // 「動画の音は使わない」。音は必ずステム側から鳴らす
    el.muted = true;
    // ループは映像・ステム2つをまとめて頭出しするため、
    // ネイティブloopではなくendedイベントで手動制御する(下のactiveエフェクト参照)
    el.loop = false;
    el.playsInline = true;
    el.preload = "auto";
    videoRef.current = el;

    const vocals = new Audio(VOCALS_SRC);
    const other = new Audio(OTHER_SRC);
    for (const a of [vocals, other]) {
      a.loop = false;
      a.preload = "auto";
    }
    vocalsRef.current = vocals;
    otherRef.current = other;

    return () => {
      el.pause();
      vocals.pause();
      other.pause();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  /**
   * ボーカル・伴奏を Web Audio グラフへつなぐ。
   * createMediaElementSource は1つの要素につき一度しか呼べないので、
   * wiredRef で二重配線を防ぐ。
   *
   * グラフ:
   *   vocals → analyser ─┬→ ctx.destination (スピーカー)
   *                       └→ captureDest     (録画)
   *   other ─────────────┬→ ctx.destination
   *                       └→ captureDest
   * ボーカルだけ analyser を通すのは口パクの振幅を取るため。
   */
  const wireAnalyser = useCallback(() => {
    /*
      HMR 等で「グラフはあるが録画用の出力(captureDest)だけ無い」状態に
      なることがある。その場合は既存グラフへ captureDest を足すだけにする
      (createMediaElementSource は1要素につき一度しか呼べないため作り直せない)。
    */
    if (wiredRef.current) {
      const ctx = audioCtxRef.current;
      if (ctx && !captureDestRef.current) {
        const captureDest = ctx.createMediaStreamDestination();
        analyserRef.current?.connect(captureDest);
        otherSourceRef.current?.connect(captureDest);
        captureDestRef.current = captureDest;
      }
      return;
    }

    const vocals = vocalsRef.current;
    const other = otherRef.current;
    if (!vocals || !other) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const vocalsSource = ctx.createMediaElementSource(vocals);
    const otherSource = ctx.createMediaElementSource(other);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    const captureDest = ctx.createMediaStreamDestination();

    vocalsSource.connect(analyser);
    // スピーカーと録画の両方へ、ボーカル(analyser経由)と伴奏を流す
    for (const node of [analyser, otherSource]) {
      node.connect(ctx.destination);
      node.connect(captureDest);
    }

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    otherSourceRef.current = otherSource;
    captureDestRef.current = captureDest;
    dataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    wiredRef.current = true;
  }, []);

  // 星降る海のON/OFFに合わせて、3つまとめて頭出し再生・停止する
  useEffect(() => {
    const video = videoRef.current;
    const vocals = vocalsRef.current;
    const other = otherRef.current;
    if (!video || !vocals || !other) return;

    if (!active) {
      video.pause();
      vocals.pause();
      other.pause();
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
      other.currentTime = 0;
      video.play().catch(() => {});
      vocals.play().catch(() => {});
      other.play().catch(() => {});
      setPlaying(true);
    };

    /*
      ループ。ボーカルを基準時計にしているので、ボーカルのendedだけを見て
      (3つは同じ長さの音源から作られているのでほぼ同時に終わる)、
      3つまとめて頭出しして鳴らし直す。
      ネイティブloopではなくここで手動制御しているのは、映像とステム2つを
      同じ時刻に揃えたまま頭へ戻すため(長さが完全に同じではないので、
      それぞれが勝手にループするとずれる)。
      次の周へすぐ入らず LOOP_GAP_SECONDS だけ間をあける。この間は映像が
      終端で止まったまま(currentTime が終端 = Sandbox3D 側は inOutro のまま)
      なので、演出は消えた状態で一拍おいてから再開する。
    */
    const handleEnded = () => {
      loopTimer = window.setTimeout(restart, LOOP_GAP_SECONDS * 1000);
    };

    /*
      押した瞬間に3つまとめてスタートする(読み込み待ちはしない)。
      バッファが十分でないまま play() すると、特にモバイルでステム2つの
      再生開始がばらついて vocal と other が少しずれることがあるが、
      あとは再生中のズレ直し(下の SYNC_INTERVAL のループ)で詰める。
    */
    const start = () => {
      if (cancelled) return;
      for (const m of [video, vocals, other]) {
        if (m.readyState === 0) m.load();
      }
      restart();
      vocals.addEventListener("ended", handleEnded);
    };
    // 1tick 遅らせて、setState をエフェクト本体から出す(cascading render 回避)
    const startTimer = window.setTimeout(start, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (loopTimer !== undefined) window.clearTimeout(loopTimer);
      vocals.removeEventListener("ended", handleEnded);
      setPlaying(false);
    };
  }, [active, wireAnalyser]);

  // 再生中のずれを定期的に直す
  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => {
      const video = videoRef.current;
      const vocals = vocalsRef.current;
      const other = otherRef.current;
      if (!video || !vocals || !other || vocals.paused) return;

      // ボーカルを基準時計にする(口パクの元なので、これに全部を合わせる)
      const t = vocals.currentTime;
      if (Math.abs(other.currentTime - t) > AUDIO_SYNC_TOLERANCE) {
        other.currentTime = t;
      }

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
    // 歌声が映えるよう少し強調する(/song ページと同じ倍率)
    return Math.min(rms * 3.5, 1);
  }, []);

  /*
    録画の直前に呼ぶ。Web Audio グラフを(まだなら)配線して AudioContext を
    resume する。星降る海を再生していなくても音声トラック自体は用意される
    (中身は無音)。
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
    /** 3つ(映像＋ステム2本)を再生開始したら true。押した次の tick で true */
    playing,
    getAmplitude,
    prepareCaptureAudio,
    getCaptureStream,
  };
}
