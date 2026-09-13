"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { PiSpinnerGapBold, PiXBold } from "react-icons/pi";
import { useSceneStore } from "@/features/root/store";
import { runExport, type ExportMode } from "./exportRunner";
import { FPS_PRESETS, RESOLUTION_PRESETS } from "./resolutionPresets";

type Status = "idle" | "running" | "done" | "canceled" | "error";

const SELECT =
  "rounded-sm border border-ed-line bg-ed-row px-2 py-1 text-[0.72rem] text-ed-text " +
  "focus:border-ed-accent focus:outline-none disabled:opacity-30";
const BUTTON =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-ed-line bg-ed-row px-3 py-1.5 " +
  "text-[0.72rem] text-ed-text transition duration-150 cursor-pointer " +
  "hover:border-ed-accent/60 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed";
const PRIMARY_BUTTON = `${BUTTON} border-ed-accent bg-ed-accent/15 text-ed-accent hover:bg-ed-accent/25`;

/**
 * ビューポート書き出し(YouTube用)のモーダルパネル。EditorModeBar の
 * 「書き出し」ボタンから開く。対象は現在ONになっているモード
 * (Reply / 星降る海)。非リアルタイムで曲全体を通し、完了したらダウンロード
 * リンクを出す(自動ダウンロードはブラウザのサンドボックスで塞がれるため、
 * 必ずユーザー操作のクリックを経由させる)。
 */
export function ExportPanel({
  replyVideoRef,
  hologramVideoRef,
  onClose,
}: {
  replyVideoRef: RefObject<HTMLVideoElement | null>;
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
  onClose: () => void;
}) {
  const reply = useSceneStore((s) => s.reply);
  const starfallSea = useSceneStore((s) => s.starfallSea);
  const exportDriver = useSceneStore((s) => s.exportDriver);
  const setExporting = useSceneStore((s) => s.setExporting);
  const setFreeCam = useSceneStore((s) => s.setFreeCam);

  const mode: ExportMode | null = reply ? "reply" : starfallSea ? "starfall" : null;

  const [resolutionIndex, setResolutionIndex] = useState(
    RESOLUTION_PRESETS.findIndex((r) => r.label === "4K"),
  );
  const [fpsIndex, setFpsIndex] = useState(
    FPS_PRESETS.findIndex((f) => f.fps === 60),
  );
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errorMessage, setErrorMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const running = status === "running";

  // ダウンロードURLはBlobから作った objectURL なので、パネルを閉じる/差し替える時に破棄する
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  const resolution = RESOLUTION_PRESETS[resolutionIndex];
  const fpsPreset = FPS_PRESETS[fpsIndex];

  const handleStart = async () => {
    if (!mode || !exportDriver) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("running");
    setErrorMessage("");
    setProgress({ done: 0, total: 0 });
    setExporting(true);
    /*
      自由視点(freeCam)がONのままだと ReplyCamera/StarfallCamera が
      active=false になり台本のカメラワークを追わず、OrbitControlsに
      委ねたその場の視点で固まったまま書き出されてしまう
      (SceneContents.tsx の `active={replyPlaying && !freeCam}` 参照)。
      書き出し中は必ずカメラワークに沿わせるため強制的にOFFにし、
      終了後は元の状態へ戻す。
    */
    const wasFreeCam = useSceneStore.getState().freeCam;
    if (wasFreeCam) setFreeCam(false);

    try {
      const blob = await runExport({
        mode,
        width: resolution.width,
        height: resolution.height,
        fps: fpsPreset.fps,
        driver: exportDriver,
        replyVideoRef,
        hologramVideoRef,
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setStatus("canceled");
      } else {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setExporting(false);
      if (wasFreeCam) setFreeCam(true);
      abortRef.current = null;
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const fileName = mode
    ? `${mode}-${resolution.width}x${resolution.height}-${fpsPreset.fps}fps.mp4`
    : "export.mp4";

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60">
      <div className="w-[360px] rounded-sm border border-ed-line bg-ed-panel p-4 text-ed-text">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.72rem] tracking-[0.1em] text-ed-dim">
            動画書き出し(YouTube用)
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="cursor-pointer text-ed-dim hover:text-white disabled:opacity-30"
          >
            <PiXBold aria-hidden="true" />
          </button>
        </div>

        {!mode && (
          <p className="mb-3 text-[0.72rem] text-ed-dim">
            先に Reply か 星降る海 を開始してから書き出してください。
          </p>
        )}

        <div className="mb-3 flex items-center gap-2">
          <label className="w-16 text-[0.68rem] text-ed-dim">解像度</label>
          <select
            className={SELECT}
            value={resolutionIndex}
            disabled={running}
            onChange={(e) => setResolutionIndex(Number(e.target.value))}
          >
            {RESOLUTION_PRESETS.map((r, i) => (
              <option key={r.label} value={i}>
                {r.label}({r.width}×{r.height})
              </option>
            ))}
          </select>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <label className="w-16 text-[0.68rem] text-ed-dim">フレームレート</label>
          <select
            className={SELECT}
            value={fpsIndex}
            disabled={running}
            onChange={(e) => setFpsIndex(Number(e.target.value))}
          >
            {FPS_PRESETS.map((f, i) => (
              <option key={f.label} value={i}>
                {f.label}
                {f.note ? `(${f.note})` : ""}
              </option>
            ))}
          </select>
        </div>

        {running && (
          <div className="mb-3">
            <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-ed-row">
              <div
                className="h-full bg-ed-accent transition-[width]"
                style={{
                  width:
                    progress.total > 0
                      ? `${(100 * progress.done) / progress.total}%`
                      : "2%",
                }}
              />
            </div>
            <p className="flex items-center gap-1.5 text-[0.68rem] text-ed-dim">
              <PiSpinnerGapBold className="animate-spin" aria-hidden="true" />
              {progress.total > 0
                ? `${progress.done} / ${progress.total} フレーム`
                : "準備中…"}
            </p>
          </div>
        )}

        {status === "error" && (
          <p className="mb-3 text-[0.68rem] text-red-400">{errorMessage}</p>
        )}
        {status === "canceled" && (
          <p className="mb-3 text-[0.68rem] text-ed-dim">キャンセルしました。</p>
        )}

        {status === "done" && downloadUrl && (
          <a
            href={downloadUrl}
            download={fileName}
            className={`${PRIMARY_BUTTON} mb-3 w-full justify-center`}
          >
            {fileName} をダウンロード
          </a>
        )}

        <div className="flex justify-end gap-2">
          {running ? (
            <button type="button" onClick={handleCancel} className={BUTTON}>
              キャンセル
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              disabled={!mode || !exportDriver}
              className={PRIMARY_BUTTON}
            >
              書き出し開始
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
