/**
 * 動画書き出しの本体。非リアルタイム: R3Fの自動レンダーを止め
 * (frameloop="never")、1フレームずつ `driver.advance(t)` で手動駆動し、
 * canvasを直接 mediabunny の CanvasSource へ流し込む。
 *
 * カメラ・演出はすべて既存の useFrame ロジック(replyTime/hologramVideoの
 * currentTime を基準に動く。frontend/CLAUDE.md 参照)がそのまま使われる ――
 * 駆動用の<video>要素を実際に再生させず、狙いの時刻へ直接seekするだけで
 * 同じ経路に乗る。
 */
import type { RefObject } from "react";
import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  UrlSource,
  ALL_FORMATS,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { REPLY_VIDEO_SRC } from "@/features/reply";
import { STARFALL_OTHER_SRC, STARFALL_VOCALS_SRC } from "@/features/starfall-sea";
import type { ExportDriverHandle } from "@/features/root/store";
import { feedReplyAudio, feedStarfallAudio } from "./audioMix";

export type ExportMode = "reply" | "starfall";

export type ExportOptions = {
  mode: ExportMode;
  width: number;
  height: number;
  fps: number;
  driver: ExportDriverHandle;
  /** mode="reply" のとき必須。Reply のホログラム映像(=音声も内蔵) */
  replyVideoRef?: RefObject<HTMLVideoElement | null>;
  /** mode="starfall" のとき必須。星降る海のホログラム映像(ミュート) */
  hologramVideoRef?: RefObject<HTMLVideoElement | null>;
  signal?: AbortSignal;
  onProgress?: (doneFrames: number, totalFrames: number) => void;
};

/**
 * 与えた時刻へ<video>をseekし、実際に新しいデコード済みフレームが提示される
 * まで待つ。
 *
 * 以前は`'seeked'`イベント+タイムアウト500msで妥協していたが、キーフレーム
 * 境界をまたぐシークなどで時々500msを超え、その場合古いフレームのまま
 * キャプチャしてしまい「ホログラム映像が一瞬固まる」不具合になっていた
 * (ユーザー報告)。`requestVideoFrameCallback`(対応ブラウザ限定。Chrome/Edge
 * はこの機能を使うWebCodecs自体が前提なので問題ない)は「新しいフレームが
 * 実際に提示された」ことを直接教えてくれるAPIなので、こちらを優先し、
 * 無ければ従来の`'seeked'`にフォールバックする。タイムアウトも2秒に延ばして
 * 余裕を持たせる。
 */
function seekVideo(video: HTMLVideoElement, t: number, timeoutMs = 2000): Promise<void> {
  if (Math.abs(video.currentTime - t) < 1e-4) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(finish, timeoutMs);
    function finish() {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      window.clearTimeout(timer);
      resolve();
    }
    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(finish);
    } else {
      video.addEventListener("seeked", finish);
    }
    video.currentTime = t;
  });
}

/**
 * 解像度/fpsに応じた目標ビットレート(bps)。YouTubeのアップロード推奨値
 * (SDR、16:9基準)にならう: 2160p 30fps=45Mbps/60fps+=68Mbps、1440p
 * 30fps=16Mbps/60fps+=24Mbps、1080p 30fps=8Mbps/60fps+=12Mbps。120fpsは
 * YouTube側に明記された値が無いため60fps+の1.3倍を目安にする。
 *
 * `Quality("high")`のような定性指定だと、mediabunnyが内部で解像度別の
 * 経験則からビットレートを決めるため、4K/60fpsのような高解像度×高fpsでは
 * 実測で YouTube推奨の半分以下(約23Mbps)にしかならず、画質が大きく落ちる
 * 問題があった(ユーザー報告: 4K60fpsで380MBしかなかった)。明示的に指定する。
 *
 * 21:9ウルトラワイドのように同じ高さでも横に広い(=総画素数が多い)解像度は、
 * 上の表の基準幅(16:9)からの横幅比でビットレートも比例して増やす
 * (総画素数が増えるぶん必要なビット数も増えるため)。
 */
function targetVideoBitrate(width: number, height: number, fps: number): number {
  const highFps = fps >= 48;
  let mbps: number;
  let refWidth: number;
  if (height >= 2160) {
    mbps = highFps ? 68 : 45;
    refWidth = 3840;
  } else if (height >= 1440) {
    mbps = highFps ? 24 : 16;
    refWidth = 2560;
  } else {
    mbps = highFps ? 12 : 8;
    refWidth = 1920;
  }
  if (fps >= 120) mbps *= 1.3;
  mbps *= width / refWidth;
  return Math.round(mbps * 1_000_000);
}

/**
 * 音声は非圧縮PCM(16bit)で書き出す。AAC(非可逆圧縮)だと「デコード→AAC圧縮
 * →mp4」のあとYouTube側でさらに再エンコードされ、二重に非可逆圧縮がかかる。
 * PCMなら自分たちの側での劣化はゼロで、曲の長さぶんの増加(数十MB程度)は
 * 動画本体のサイズに対して誤差レベル。ビットレート/品質設定が無いぶん、
 * AACで起きた「この環境のエンコーダでは特定のビットレートが非対応」問題も
 * そもそも起きない。
 */
const AUDIO_CODEC = "pcm-s16";

async function probeDuration(url: string, signal?: AbortSignal): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    if (signal?.aborted) return 0;
    return await input.computeDuration();
  } finally {
    input.dispose();
  }
}

export async function runExport(options: ExportOptions): Promise<Blob> {
  const { mode, width, height, fps, driver, replyVideoRef, hologramVideoRef, signal, onProgress } =
    options;

  const video =
    mode === "reply" ? replyVideoRef?.current : hologramVideoRef?.current;
  if (!video) {
    throw new Error(
      mode === "reply"
        ? "Reply の映像要素が見つかりません(一度 Reply を開始してから書き出してください)"
        : "星降る海の映像要素が見つかりません(一度 星降る海 を開始してから書き出してください)",
    );
  }

  const duration = await probeDuration(
    mode === "reply" ? REPLY_VIDEO_SRC : STARFALL_VOCALS_SRC,
    signal,
  );
  if (duration <= 0) throw new Error("曲の長さを取得できませんでした");

  const videoQuality = new Quality({ bitrate: targetVideoBitrate(width, height, fps) });
  /*
    重い処理(音声デコードやフレームループ)を始める前に、この解像度/ビット
    レートの組み合わせがこの環境で実際にエンコードできるか確認する。
    例えば 21:9 の 5120×2160 は avc(H.264) のレベルが6.0相当になり、
    多くの環境(ソフト/ハードウェアエンコーダ問わず)で
    "not supported in this environment" と拒否される(実機で確認済み)。
    確認せずに進むと、フレームをある程度進めた後で初めてエンコーダが
    エラーを出し、それまでの処理が丸ごと無駄になる。
  */
  const supported = await canEncodeVideo("avc", { width, height, quality: videoQuality });
  if (!supported) {
    throw new Error(
      `この解像度(${width}×${height})/コーデックの組み合わせはこの環境のエンコーダでは対応していません。解像度を下げてお試しください。`,
    );
  }

  if (!(await canEncodeAudio(AUDIO_CODEC))) {
    throw new Error("この環境では非圧縮PCM音声の書き出しに対応していません。");
  }

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat(), target });

  const canvasSource = new CanvasSource(driver.gl.domElement, {
    codec: "avc",
    quality: videoQuality,
  });
  output.addVideoTrack(canvasSource, { frameRate: fps });

  const audioSource = new AudioBufferSource({ codec: AUDIO_CODEC });
  output.addAudioTrack(audioSource);

  await output.start();

  // 音声は映像フレームループと並行してデコード/供給する(どちらも非同期・独立)
  const audioTask =
    mode === "reply"
      ? feedReplyAudio(audioSource, REPLY_VIDEO_SRC, duration, signal)
      : feedStarfallAudio(
          audioSource,
          STARFALL_VOCALS_SRC,
          STARFALL_OTHER_SRC,
          duration,
          signal,
        );

  const savedSize = driver.getSize();
  const savedDpr = driver.getDpr();
  const savedVideoTime = video.currentTime;
  const wasPaused = video.paused;

  driver.setFrameloop("never");
  driver.setDpr(1);
  driver.setSize(width, height);

  const frameDuration = 1 / fps;
  const totalFrames = Math.ceil(duration * fps);

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) break;
      const t = i * frameDuration;
      await seekVideo(video, t);
      driver.advance(t);
      await canvasSource.add(t, frameDuration);
      onProgress?.(i + 1, totalFrames);
      /*
        毎フレーム実マクロタスク(rAF)へ明け渡す。seekVideoのawaitだけに
        頼ると、seekが早く解決する場合に描画・Cancelボタン操作・進捗表示の
        更新が長時間止まってしまう(ブラウザのメインスレッドが専有される)。
      */
      await new Promise(requestAnimationFrame);
    }

    audioSource.close();
    canvasSource.close();
    await audioTask;

    if (signal?.aborted) {
      await output.cancel();
      throw new DOMException("書き出しをキャンセルしました", "AbortError");
    }

    await output.finalize();
  } finally {
    driver.setFrameloop("always");
    driver.setDpr(savedDpr);
    driver.setSize(savedSize.width, savedSize.height);
    video.currentTime = savedVideoTime;
    if (wasPaused) video.pause();
  }

  if (!target.buffer) throw new Error("書き出しに失敗しました(出力が空です)");
  return new Blob([target.buffer], { type: "video/mp4" });
}
