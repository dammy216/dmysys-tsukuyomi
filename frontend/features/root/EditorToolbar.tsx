"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  PiArrowsOutCardinalBold,
  PiEnvelopeBold,
  PiFastForwardFill,
  PiPauseFill,
  PiPlayFill,
  PiRewindFill,
  PiSkipBackFill,
  PiSkipForwardFill,
  PiVideoCameraBold,
} from "react-icons/pi";
import { useSceneStore } from "./store";

/**
 * 編集モード(useSceneStore.editorMode)の下部ツールバー(再生コントロール)。
 *
 * 通常時の ControlBar は編集モード中は隠す方針なので、演出の開始/停止
 * (Reply トグル)・自由視点(freeCam)・映像の再生コントロールをここにまとめる。
 * 自由視点は単純なトグルで、再生/一時停止とは連動させない
 * (自由視点中もアニメーション・再生は止まらない)。
 * 編集モード終了ボタンは EditorLayout 側(画面比率テンプレの隣)にある。
 * 再生位置の真実は常に <video> 側にあり、Theatre のシーケンス位置は
 * ReplyCamera が毎フレームそこへ同期させる(逆にタイムラインを手で
 * スクラブしたときは ReplyCamera が映像側をシークし返す)。
 */

/**
 * 早送り/巻き戻しボタンを押しっぱなしにしている間、実時間1秒あたり
 * 何秒ぶんシークするか(倍速)。クリックで固定秒数だけ飛ぶ方式ではなく、
 * 押している間だけ加速して連続的にシークする(往年のFF/RWボタンの感覚)。
 */
const SEEK_HOLD_RATE = 4;

const BUTTON =
  "inline-flex items-center justify-center rounded-md border border-white/12 " +
  "bg-white/6 text-white/80 transition duration-150 cursor-pointer " +
  "hover:bg-white/14 hover:text-white hover:border-white/25 " +
  "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/6 " +
  "disabled:hover:text-white/80 disabled:hover:border-white/12";

/** 秒数を 0:00.0 形式にする */
function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function EditorToolbar({
  replyVideoRef,
}: {
  /** Reply の映像。再生コントロールの操作対象 */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const reply = useSceneStore((s) => s.reply);
  const replyPlaying = useSceneStore((s) => s.replyPlaying);
  const toggleReply = useSceneStore((s) => s.toggleReply);
  const editorPaused = useSceneStore((s) => s.editorPaused);
  const setEditorPaused = useSceneStore((s) => s.setEditorPaused);
  const freeCam = useSceneStore((s) => s.freeCam);
  const toggleFreeCam = useSceneStore((s) => s.toggleFreeCam);

  /*
    再生位置の表示だけは毎フレーム変わるので、ここだけ rAF で state を回す。
    3Dシーンの演出値と違い、更新されるのはこのツールバーの数字とシークバーの
    つまみだけなので、再レンダーのコストは無視できる。
  */
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const video = replyVideoRef.current;
      if (video) {
        setTime(Number.isFinite(video.currentTime) ? video.currentTime : 0);
        setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [replyVideoRef]);

  /*
    シーク/再生/停止はすべて <video> を直接操作する。ReplyCamera 側は
    songTime(= video.currentTime)を毎フレーム読んで Theatre のシーケンス
    位置へ同期させるので、ここで映像を動かせばタイムラインのバーも追従する。
  */
  const seekTo = useCallback(
    (seconds: number) => {
      const video = replyVideoRef.current;
      if (!video) return;
      const max = Number.isFinite(video.duration) ? video.duration : seconds;
      video.currentTime = Math.min(Math.max(seconds, 0), max);
    },
    [replyVideoRef],
  );

  /*
    早送り/巻き戻しボタンを押しっぱなしにしている間、rAFで毎フレーム
    currentTime を進める/戻す。離した瞬間(pointerUp/Cancel)に止める。
    setPointerCapture でボタンに固定するので、押したまま指/カーソルが
    ボタンの外へ出ても離した扱いにならない(ホールド操作として自然)。
  */
  const holdRafRef = useRef<number | null>(null);
  const holdLastRef = useRef(0);
  const stopHoldSeek = useCallback(() => {
    if (holdRafRef.current != null) {
      cancelAnimationFrame(holdRafRef.current);
      holdRafRef.current = null;
    }
  }, []);
  const startHoldSeek = useCallback(
    (direction: 1 | -1) => {
      stopHoldSeek();
      holdLastRef.current = performance.now();
      const tick = () => {
        const now = performance.now();
        const dt = (now - holdLastRef.current) / 1000;
        holdLastRef.current = now;
        const video = replyVideoRef.current;
        if (video) seekTo(video.currentTime + direction * SEEK_HOLD_RATE * dt);
        holdRafRef.current = requestAnimationFrame(tick);
      };
      holdRafRef.current = requestAnimationFrame(tick);
    },
    [stopHoldSeek, replyVideoRef, seekTo],
  );
  useEffect(() => stopHoldSeek, [stopHoldSeek]);

  const onHoldPointerDown = useCallback(
    (direction: 1 | -1) => (e: PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      startHoldSeek(direction);
    },
    [startHoldSeek],
  );

  const togglePlay = () => {
    const video = replyVideoRef.current;
    if (!video) return;
    const nextPaused = !editorPaused;
    setEditorPaused(nextPaused);
    if (nextPaused) {
      video.pause();
    } else {
      void video.play().catch(() => {});
    }
  };

  // 演出が始まっていない間は再生コントロールを無効にする
  const disabled = !replyPlaying;

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-t border-white/10 bg-[#12161c] px-3">
      <button
        type="button"
        onClick={toggleReply}
        aria-pressed={reply}
        className={
          "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 " +
          "text-[0.78rem] font-bold transition duration-150 cursor-pointer " +
          "text-[#ffbedc]/85 bg-hud-pink/8 border-hud-pink/35 " +
          "hover:bg-hud-pink/18 hover:border-hud-pink/70 hover:text-white " +
          "aria-pressed:bg-hud-pink/22 aria-pressed:border-hud-pink " +
          "aria-pressed:text-[#ff8fc4]"
        }
      >
        <PiEnvelopeBold aria-hidden="true" />
        Reply
      </button>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => seekTo(0)}
          disabled={disabled}
          title="先頭へ"
          aria-label="先頭へ"
          className={`${BUTTON} size-8`}
        >
          <PiSkipBackFill aria-hidden="true" />
        </button>
        <button
          type="button"
          onPointerDown={onHoldPointerDown(-1)}
          onPointerUp={stopHoldSeek}
          onPointerCancel={stopHoldSeek}
          disabled={disabled}
          title="巻き戻し(押しっぱなしでシーク)"
          aria-label="巻き戻し"
          className={`${BUTTON} size-8`}
        >
          <PiRewindFill aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          disabled={disabled}
          title={editorPaused ? "再生" : "一時停止"}
          aria-label={editorPaused ? "再生" : "一時停止"}
          className={`${BUTTON} size-9 text-hud`}
        >
          {editorPaused ? (
            <PiPlayFill aria-hidden="true" />
          ) : (
            <PiPauseFill aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onPointerDown={onHoldPointerDown(1)}
          onPointerUp={stopHoldSeek}
          onPointerCancel={stopHoldSeek}
          disabled={disabled}
          title="早送り(押しっぱなしでシーク)"
          aria-label="早送り"
          className={`${BUTTON} size-8`}
        >
          <PiFastForwardFill aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => seekTo(duration)}
          disabled={disabled || duration <= 0}
          title="末尾へ"
          aria-label="末尾へ"
          className={`${BUTTON} size-8`}
        >
          <PiSkipForwardFill aria-hidden="true" />
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={duration > 0 ? duration : 1}
        step={0.01}
        value={Math.min(time, duration > 0 ? duration : 1)}
        onChange={(e) => seekTo(Number(e.target.value))}
        disabled={disabled || duration <= 0}
        aria-label="再生位置"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-hud disabled:cursor-not-allowed disabled:opacity-30"
      />

      <span className="shrink-0 font-mono text-[0.75rem] text-white/70 tabular-nums">
        {formatTime(time)} / {formatTime(duration)}
      </span>

      <button
        type="button"
        onClick={toggleFreeCam}
        disabled={!replyPlaying}
        aria-pressed={freeCam}
        title={freeCam ? "アニメーションに戻す" : "アニメーションを止めて自由視点で見る"}
        className={
          "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/12 px-3 py-1.5 " +
          "text-[0.78rem] font-bold text-white/80 transition duration-150 cursor-pointer " +
          "hover:bg-white/14 hover:text-white hover:border-white/25 " +
          "aria-pressed:bg-hud/18 aria-pressed:border-hud aria-pressed:text-hud " +
          "disabled:opacity-30 disabled:cursor-not-allowed"
        }
      >
        {freeCam ? (
          <PiArrowsOutCardinalBold aria-hidden="true" />
        ) : (
          <PiVideoCameraBold aria-hidden="true" />
        )}
        {freeCam ? "自由視点" : "アニメーション"}
      </button>
    </div>
  );
}
