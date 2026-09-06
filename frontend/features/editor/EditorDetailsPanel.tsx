"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  BUILD_ORBIT_DEFAULTS,
  BUILD_ORBIT_SPECS,
  CAMERA_FEEL_DEFAULTS,
  CAMERA_FEEL_SPECS,
  DRONE_PATH,
  sampleDrone,
  useBuildOrbitStore,
  useCameraFeelStore,
  useDronePathStore,
  type DroneKeyField,
  type ParamSpec,
} from "@/features/reply";
import { EDITOR_OBJECTS, useEditorStore } from "./editorStore";
import { EditorNumberField } from "./EditorNumberField";

/**
 * 右パネル(Details)。Outline で選んだオブジェクトのパラメータを出す。
 *
 * ここでの変更はブラウザのメモリ上にしか残らない**下書き**で、リロードすると
 * コードの既定値に戻る。気に入った値ができたら「コードとしてコピー」で
 * 該当のコード片を書き出し、features/reply/ 側のソースへ貼って確定させる。
 * (Theatre.js を撤去した経緯から、GUI とコードの自動同期はあえてしない。
 *  コードが常に正で、GUI は試写と下書きのための道具という役割分担。)
 */

/*
  幅は使う側で足す(w-full を含めてしまうと、キーフレーム送りの小さいボタンで
  w-7 と衝突してどちらが勝つか不定になり、ボタンが横に潰れて見えていた)。
*/
const BUTTON =
  "rounded-sm border border-ed-line bg-ed-row px-2 py-1 text-[0.7rem] " +
  "text-ed-text transition-colors cursor-pointer hover:border-ed-accent/60 " +
  "hover:text-white disabled:cursor-not-allowed disabled:opacity-35 " +
  "disabled:hover:border-ed-line disabled:hover:text-ed-text";

/** クリップボードへ書き、少しの間ボタンの文言を差し替える */
function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };
  return { copied, copy };
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 border-b border-ed-line px-2.5 py-2.5 last:border-b-0">
      <h3 className="text-[0.6rem] tracking-[0.16em] text-ed-dim">{title}</h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Drone Path(キーフレームを持つオブジェクト)
 * ------------------------------------------------------------------ */

const DRONE_FIELDS: { field: DroneKeyField; label: string; step: number }[] = [
  { field: "turn", label: "turn(回転数)", step: 0.01 },
  { field: "radius", label: "radius(半径)", step: 0.5 },
  { field: "y", label: "y(高さ)", step: 0.5 },
  { field: "lookY", label: "lookY(注視点)", step: 0.5 },
  { field: "fov", label: "fov(画角)", step: 1 },
];

/**
 * 再生位置での**補間後の値**をそのまま出す読み取り専用の欄。
 * 毎フレーム変わるので state ではなく DOM へ直接書く
 * (state にすると Details パネル全体が 60fps で再レンダーされる)。
 */
function LiveReadout({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const valueRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    const sample = { turn: 0, radius: 0, y: 0, lookY: 0, fov: 0 };
    let raf = 0;
    const tick = () => {
      const raw = videoRef.current?.currentTime ?? 0;
      const t = Number.isFinite(raw) ? raw : 0;
      sampleDrone(useDronePathStore.getState().keyframes, t, sample);
      if (timeRef.current) timeRef.current.textContent = `${t.toFixed(2)}s`;
      for (const { field } of DRONE_FIELDS) {
        const node = valueRefs.current[field];
        if (node) node.textContent = sample[field].toFixed(2);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[0.65rem] text-ed-dim">
        <span>再生位置</span>
        <span ref={timeRef} className="font-mono text-ed-accent tabular-nums">
          0.00s
        </span>
      </div>
      {DRONE_FIELDS.map(({ field, label }) => (
        <div
          key={field}
          className="flex items-center justify-between text-[0.68rem]"
        >
          <span className="text-ed-dim">{label}</span>
          <span
            ref={(node) => {
              valueRefs.current[field] = node;
            }}
            className="font-mono text-ed-text tabular-nums"
          >
            0.00
          </span>
        </div>
      ))}
    </div>
  );
}

function DronePathDetails({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const keyframes = useDronePathStore((s) => s.keyframes);
  const setField = useDronePathStore((s) => s.setField);
  const reset = useDronePathStore((s) => s.reset);
  const selectedKeyIndex = useEditorStore((s) => s.selectedKeyIndex);
  const selectKeyIndex = useEditorStore((s) => s.selectKeyIndex);
  const { copied, copy } = useCopyToClipboard();

  const index = Math.min(selectedKeyIndex, keyframes.length - 1);
  const key = keyframes[index];

  const dirty = keyframes.some(
    (k, i) =>
      k.t !== DRONE_PATH[i].t ||
      k.turn !== DRONE_PATH[i].turn ||
      k.radius !== DRONE_PATH[i].radius ||
      k.y !== DRONE_PATH[i].y ||
      k.lookY !== DRONE_PATH[i].lookY ||
      k.fov !== DRONE_PATH[i].fov,
  );

  const handleCopy = () => {
    const body = keyframes
      .map(
        (k) =>
          `  { t: ${k.t}, turn: ${k.turn}, radius: ${k.radius}, y: ${k.y}, lookY: ${k.lookY}, fov: ${k.fov} },`,
      )
      .join("\n");
    copy(`const DRONE_PATH: readonly DroneKey[] = [\n${body}\n] as const;`);
  };

  return (
    <>
      <PanelSection title={`KEYFRAME ${index + 1} / ${keyframes.length}`}>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectKeyIndex(Math.max(index - 1, 0))}
            disabled={index <= 0}
            aria-label="前のキーフレーム"
            className={`${BUTTON} w-7`}
          >
            ‹
          </button>
          <span className="flex-1 text-center font-mono text-[0.72rem] text-ed-text tabular-nums">
            t = {key.t}s
          </span>
          <button
            type="button"
            onClick={() =>
              selectKeyIndex(Math.min(index + 1, keyframes.length - 1))
            }
            disabled={index >= keyframes.length - 1}
            aria-label="次のキーフレーム"
            className={`${BUTTON} w-7`}
          >
            ›
          </button>
        </div>
        <div className="mt-1 flex flex-col gap-1.5">
          {DRONE_FIELDS.map(({ field, label, step }) => (
            <EditorNumberField
              key={field}
              label={label}
              value={key[field]}
              step={step}
              onChange={(value) => setField(index, field, value)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="LIVE(補間後の現在値)">
        <LiveReadout videoRef={videoRef} />
      </PanelSection>

      <PanelSection title="COMMIT">
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={handleCopy} className={`${BUTTON} w-full`}>
            {copied ? "コピーした" : "コードとしてコピー"}
          </button>
          <button
            type="button"
            onClick={reset}
            disabled={!dirty}
            className={`${BUTTON} w-full`}
          >
            コードの値に戻す
          </button>
          <p className="text-[0.6rem] leading-relaxed text-ed-dim">
            貼り付け先: features/reply/dronePath.ts の DRONE_PATH
          </p>
        </div>
      </PanelSection>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * キーフレームを持たない数値パラメータのオブジェクト
 * ------------------------------------------------------------------ */

function ParamDetails<T extends Record<string, number>>({
  values,
  defaults,
  specs,
  codeName,
  codePath,
  onChange,
  onReset,
}: {
  values: T;
  defaults: T;
  specs: ParamSpec<keyof T & string>[];
  /** 「コードとしてコピー」で出す定数名 */
  codeName: string;
  /** 貼り付け先の案内 */
  codePath: string;
  onChange: (key: keyof T & string, value: number) => void;
  onReset: () => void;
}) {
  const { copied, copy } = useCopyToClipboard();
  const dirty = specs.some(({ key }) => values[key] !== defaults[key]);

  const handleCopy = () => {
    const body = specs
      .map(({ key, defaultExpr }) => {
        const unchanged = values[key] === defaults[key];
        const literal =
          unchanged && defaultExpr ? defaultExpr : String(values[key]);
        return `  ${key}: ${literal},`;
      })
      .join("\n");
    copy(`export const ${codeName} = {\n${body}\n};`);
  };

  return (
    <>
      <PanelSection title="PARAMETERS">
        <div className="flex flex-col gap-1.5">
          {specs.map(({ key, label, step }) => (
            <EditorNumberField
              key={key}
              label={label}
              value={values[key]}
              step={step}
              onChange={(value) => onChange(key, value)}
            />
          ))}
        </div>
      </PanelSection>

      <PanelSection title="COMMIT">
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={handleCopy} className={`${BUTTON} w-full`}>
            {copied ? "コピーした" : "コードとしてコピー"}
          </button>
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty}
            className={`${BUTTON} w-full`}
          >
            コードの値に戻す
          </button>
          <p className="text-[0.6rem] leading-relaxed text-ed-dim">
            貼り付け先: {codePath}
          </p>
        </div>
      </PanelSection>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function EditorDetailsPanel({
  replyVideoRef,
}: {
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const selectedObject = useEditorStore((s) => s.selectedObject);
  const buildOrbit = useBuildOrbitStore((s) => s.values);
  const cameraFeel = useCameraFeelStore((s) => s.values);
  const label =
    EDITOR_OBJECTS.find((o) => o.id === selectedObject)?.label ?? "";

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-ed-line px-2.5 py-1.5">
        <span className="text-[0.65rem] tracking-[0.18em] text-ed-dim">
          DETAILS
        </span>
        <span className="text-[0.7rem] text-ed-accent">{label}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedObject === "drone-path" && (
          <DronePathDetails videoRef={replyVideoRef} />
        )}
        {selectedObject === "build-orbit" && (
          <ParamDetails
            values={buildOrbit}
            defaults={BUILD_ORBIT_DEFAULTS}
            specs={BUILD_ORBIT_SPECS}
            codeName="BUILD_ORBIT_DEFAULTS"
            codePath="features/reply/cameraParams.ts"
            onChange={(key, value) =>
              useBuildOrbitStore.getState().setValue(key, value)
            }
            onReset={() => useBuildOrbitStore.getState().reset()}
          />
        )}
        {selectedObject === "camera-feel" && (
          <ParamDetails
            values={cameraFeel}
            defaults={CAMERA_FEEL_DEFAULTS}
            specs={CAMERA_FEEL_SPECS}
            codeName="CAMERA_FEEL_DEFAULTS"
            codePath="features/reply/cameraParams.ts"
            onChange={(key, value) =>
              useCameraFeelStore.getState().setValue(key, value)
            }
            onReset={() => useCameraFeelStore.getState().reset()}
          />
        )}
      </div>
    </div>
  );
}
