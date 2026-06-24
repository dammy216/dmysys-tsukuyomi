"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_VOLUME,
  STORAGE_KEYS,
  YOUTUBE_VIDEO_ID,
} from "./constants";

type ActiveType = "opus" | "youtube" | null;

type MusicContextValue = {
  /** 0〜1 の音量 */
  volume: number;
  /** 現在再生中の種別 */
  activeType: ActiveType;
  /** 再生中の opus ファイルパス（opus 再生時のみ） */
  currentSrc: string | null;
  setVolume: (value: number) => void;
  playTrack: (src: string) => void;
  playYouTube: () => void;
  stop: () => void;
  /**
   * 現在の音量振幅 (0〜1) を返す。リップシンク用。
   * - opus 再生中: Web Audio API でリアルタイム解析した実際の振幅
   * - YouTube 再生中: iframe は解析できないため合成リズムを返す
   * - 停止中: 0
   */
  getAmplitude: () => number;
};

const MusicContext = createContext<MusicContextValue | null>(null);

/**
 * BGM をアプリ全体で共有するプロバイダ。
 *
 * root layout に配置することで、App Router のレイアウトは
 * ページ遷移しても再マウントされないため、`<audio>` 要素が
 * 生き続け、ホーム⇔自己紹介の移動でも BGM がシームレスに継続する。
 * フルリロード時は localStorage から再生状態を復元する。
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeRef = useRef<HTMLIFrameElement | null>(null);

  // Web Audio API（opus の振幅解析用）
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const [activeType, setActiveType] = useState<ActiveType>(null);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);

  const postToYouTube = useCallback((func: string, args: unknown = "") => {
    youtubeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "*",
    );
  }, []);

  /**
   * AnalyserNode を遅延セットアップする（ユーザー操作=再生クリック時に呼ぶ）。
   * createMediaElementSource は要素ごとに一度しか呼べないため sourceRef で保護。
   */
  const setupAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || sourceRef.current) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    // source → analyser → 出力（destination につながないと音が出なくなる）
    source.connect(analyser);
    analyser.connect(ctx.destination);

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    sourceRef.current = source;
    timeDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
  }, []);

  const getAmplitude = useCallback((): number => {
    if (activeType === "opus") {
      const analyser = analyserRef.current;
      const data = timeDataRef.current;
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
    }

    if (activeType === "youtube") {
      // iframe は解析できないため、それっぽい合成リズムを返す
      const t = performance.now() / 1000;
      const base =
        0.5 +
        0.3 * Math.sin(t * 7.5) +
        0.15 * Math.sin(t * 13.3) +
        0.1 * Math.sin(t * 2.1);
      return Math.min(Math.max(base, 0), 1);
    }

    return 0;
  }, [activeType]);

  // --- 初期化：保存済みの音量・再生状態を復元 ---
  useEffect(() => {
    const savedVolume = localStorage.getItem(STORAGE_KEYS.volume);
    const restoredVolume =
      savedVolume !== null ? parseFloat(savedVolume) : DEFAULT_VOLUME;
    setVolumeState(restoredVolume);

    const savedType = localStorage.getItem(STORAGE_KEYS.type) as ActiveType;
    const savedTime = localStorage.getItem(STORAGE_KEYS.time);

    if (savedType === "opus") {
      const savedSrc = localStorage.getItem(STORAGE_KEYS.src);
      const audio = audioRef.current;
      if (savedSrc && audio) {
        audio.src = savedSrc;
        audio.volume = restoredVolume;
        audio.currentTime = savedTime ? parseFloat(savedTime) : 0;
        setCurrentSrc(savedSrc);
        setActiveType("opus");
        audio.play().catch(() => {
          // 自動再生がブロックされた場合はクリックで再開
          const resume = () => audio.play().catch(() => {});
          document.addEventListener("click", resume, { once: true });
        });
      }
    } else if (savedType === "youtube") {
      setActiveType("youtube");
      // YouTube iframe API の読み込みを待ってから再生指示
      const timer = setTimeout(() => {
        postToYouTube("setVolume", [Math.round(restoredVolume * 100)]);
        postToYouTube("playVideo");
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [postToYouTube]);

  // --- opus 再生位置を定期保存（ページ移動時の引き継ぎ用） ---
  useEffect(() => {
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (activeType === "opus" && audio && !audio.paused) {
        localStorage.setItem(STORAGE_KEYS.time, String(audio.currentTime));
      }
    }, 500);
    return () => clearInterval(id);
  }, [activeType]);

  const setVolume = useCallback(
    (value: number) => {
      setVolumeState(value);
      localStorage.setItem(STORAGE_KEYS.volume, String(value));
      if (audioRef.current) audioRef.current.volume = value;
      postToYouTube("setVolume", [Math.round(value * 100)]);
    },
    [postToYouTube],
  );

  const playTrack = useCallback(
    (src: string) => {
      localStorage.setItem(STORAGE_KEYS.type, "opus");
      localStorage.setItem(STORAGE_KEYS.src, src);
      postToYouTube("pauseVideo");

      // ユーザー操作中なので、ここで振幅解析グラフをセットアップ／再開する
      setupAnalyser();
      audioCtxRef.current?.resume().catch(() => {});

      const audio = audioRef.current;
      if (audio) {
        audio.src = src;
        audio.volume = volume;
        audio.play().catch((err) => {
          console.log("ユーザー操作前の自動再生はブロックされる場合があります:", err);
        });
      }
      setCurrentSrc(src);
      setActiveType("opus");
    },
    [postToYouTube, setupAnalyser, volume],
  );

  const playYouTube = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.type, "youtube");
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    postToYouTube("setVolume", [Math.round(volume * 100)]);
    postToYouTube("playVideo");
    setCurrentSrc(null);
    setActiveType("youtube");
  }, [postToYouTube, volume]);

  const stop = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.type);
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    postToYouTube("pauseVideo");
    postToYouTube("seekTo", [0, true]);
    setActiveType(null);
    setCurrentSrc(null);
  }, [postToYouTube]);

  return (
    <MusicContext.Provider
      value={{
        volume,
        activeType,
        currentSrc,
        setVolume,
        playTrack,
        playYouTube,
        stop,
        getAmplitude,
      }}
    >
      {/* BGM 用の隠しオーディオ要素 */}
      <audio ref={audioRef} loop />
      {/* 「全部」用の隠し YouTube プレイヤー */}
      <iframe
        ref={youtubeRef}
        title="bgm-youtube"
        width={0}
        height={0}
        src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?enablejsapi=1&controls=0`}
        allow="autoplay"
        style={{ display: "none", border: "none" }}
      />
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic(): MusicContextValue {
  const ctx = useContext(MusicContext);
  if (!ctx) {
    throw new Error("useMusic must be used within a MusicProvider");
  }
  return ctx;
}
