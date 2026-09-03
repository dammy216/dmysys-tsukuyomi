import { CASTLE_HALF_DEPTH, CASTLE_HALF_WIDTH, CASTLE_TOP_Y } from "./constants";

/*
  江戸城の四隅に立つ隅櫓(japanese_tower モデル)の配置。
  CornerTowers(モデル本体)と CastleAssembly(飛来ブロック)の両方が
  同じ寸法・位置を要るので、ここへ切り出す。

  モデルの寸法は R3F スケール1・gltf のノード変換込みで実測した値。
  world-space bbox は原点中心で x ∈ ±0.01222 / z ∈ ±0.01277 / y ∈ [0, 0.03747]。
  底面がちょうど y=0 に来るので、置く高さは親 group の position だけで決まる。
*/
const MODEL_LOCAL_HEIGHT = 0.03747;
const MODEL_LOCAL_HALF_WIDTH = 0.01222;
const MODEL_LOCAL_HALF_DEPTH = 0.01277;

/**
 * 隅櫓の高さ(ワールド単位)。天守(CASTLE_TOP_Y)のおよそ 6割。
 * 本丸を囲む櫓なので天守よりは低く抑える。CASTLE_TOP_Y に対する比で持つのは、
 * 「城と周りをまとめて拡大」のように天守の縮尺(CASTLE_SCALE)を変えたとき、
 * 隅櫓も自動で追従して同じ見え方を保つため(絶対値の9のままだと天守だけ
 * 大きくなって隅櫓が相対的に小さく見えてしまう)。
 */
export const TOWER_HEIGHT = CASTLE_TOP_Y * 0.58;
/** 上の高さにするための一律スケール(CornerTowers が primitive に掛ける) */
export const TOWER_SCALE = TOWER_HEIGHT / MODEL_LOCAL_HEIGHT;
/** 隅櫓の底面の半分の広がり(飛来ブロックの散布範囲に使う) */
export const TOWER_HALF_WIDTH = MODEL_LOCAL_HALF_WIDTH * TOWER_SCALE;
export const TOWER_HALF_DEPTH = MODEL_LOCAL_HALF_DEPTH * TOWER_SCALE;

/**
 * 四隅の (x, z)。EdoCastle と同じ基準点(REPLY_BASE_POSITION)からの相対で、
 * 城の軸に揃える(回転なし)。隅櫓は角の石垣に取り付くものなので、内側が
 * 少しだけ天守に重なる位置に置く。CORNER_OVERLAP=0 で内側の面が石垣に
 * ぴったり、0.5 で櫓の半分が天守へめり込む。
 */
const CORNER_OVERLAP = 0.3;
const CORNER_X =
  CASTLE_HALF_WIDTH + TOWER_HALF_WIDTH * (1 - 2 * CORNER_OVERLAP);
const CORNER_Z =
  CASTLE_HALF_DEPTH + TOWER_HALF_DEPTH * (1 - 2 * CORNER_OVERLAP);

export const CORNER_TOWER_XZ: readonly [number, number][] = [
  [CORNER_X, CORNER_Z],
  [-CORNER_X, CORNER_Z],
  [-CORNER_X, -CORNER_Z],
  [CORNER_X, -CORNER_Z],
];
