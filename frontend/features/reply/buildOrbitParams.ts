import { BUILD_ORBIT_DEFAULTS } from "./buildOrbitDefaults";
import { createParamStore, type ParamSpec } from "./paramStore";

export type BuildOrbitParams = typeof BUILD_ORBIT_DEFAULTS;

export const BUILD_ORBIT_SPECS: ParamSpec<keyof BuildOrbitParams>[] = [
  {
    key: "holdSeconds",
    label: "hold(静止 秒)",
    step: 0.1,
    comment: "押してから前進を始めるまでの静止時間(秒)",
  },
  {
    key: "dollySeconds",
    label: "dolly(前進 秒)",
    step: 0.1,
    comment: "静止のあと START→MID へ前進する秒数(まだ回転しない)",
  },
  { key: "radiusStart", label: "radius start", step: 0.5, comment: "周回半径の3段階" },
  { key: "radiusMid", label: "radius mid", step: 0.5 },
  { key: "radiusTo", label: "radius to", step: 0.5 },
  { key: "yFrom", label: "y from", step: 0.5, comment: "高さの3段階" },
  { key: "yMid", label: "y mid", step: 0.5 },
  { key: "yTo", label: "y to", step: 0.5, defaultExpr: "STAGE_Y + 2" },
  {
    key: "lookYFrom",
    label: "lookY from",
    step: 0.5,
    comment: "見る先の高さ(build に対して直線で上がる)",
  },
  { key: "lookYTo", label: "lookY to", step: 0.5, defaultExpr: "STAGE_Y" },
  { key: "turns", label: "turns(周回数)", step: 0.05, comment: "組み上げ中に回る周回数" },
];

export const useBuildOrbitStore = createParamStore(BUILD_ORBIT_DEFAULTS);
