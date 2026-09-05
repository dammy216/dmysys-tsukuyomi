"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D, Vector3 } from "three";
import {
  BUILD_EDGE_JITTER,
  CASTLE_HALF_DEPTH,
  CASTLE_HALF_WIDTH,
  CASTLE_TOP_Y,
} from "./constants";
import {
  CORNER_TOWER_XZ,
  TOWER_HALF_DEPTH,
  TOWER_HALF_WIDTH,
  TOWER_HEIGHT,
} from "./towerLayout";

/**
 * 天守へ飛来するブロックの数。参照映像(Shelter 1:21〜)ほどの物量は出せないが、
 * 常時数十個が空中に居る状態を作れれば「収束してくる」感じは出る。
 */
const BLOCK_COUNT = 1400;

/**
 * 隅櫓1棟あたりの飛来ブロック数。天守と同じ密度感になるよう、体積比
 * (櫓 ≒ 天守の 1/8)より多め。櫓は build 前半で建ちきるので、そのぶん
 * 短時間に石が集まる必要がある。
 */
const TOWER_BLOCK_COUNT = 350;

/** InstancedMesh の総数。天守 + 四隅の櫓 */
const TOTAL_BLOCKS = BLOCK_COUNT + CORNER_TOWER_XZ.length * TOWER_BLOCK_COUNT;

/**
 * ブロックの一辺の範囲(ワールド単位)。石垣の石らしくばらつかせる。
 *
 * 小さめ・多めにしてある。大きい石が少数飛ぶと1個1個の動きが目に付いて
 * 「ゆっくり組み上がっている」ように見え、曲のテンポから浮く。
 * 細かい石が絶え間なく降り積もるほうが速く感じられる。
 */
const BLOCK_MIN_SIZE = 0.12;
const BLOCK_MAX_SIZE = 0.34;
/** 直方体にするための各軸の伸び幅。立方体だけだと単調になる */
const BLOCK_STRETCH = 1.3;

/**
 * 飛来の開始距離(ワールド単位)。着地点からこの範囲だけ外へ飛ばす。
 * 下の lead を詰めたぶん短くする。遠くから短時間で来ると速度が出すぎて
 * 弾丸のように見えるため。
 */
const FLY_MIN_DISTANCE = 7;
const FLY_MAX_DISTANCE = 22;

/**
 * 各ブロックが「自分の高さの組み上げ面が来る」何割前から飛び始めるか
 * (組み上げ進行度 0〜1 での長さ)。長いほど空中に居るブロックが増える。
 *
 * 短くしてある。長いと1個が悠々と滑空していく画になり、11秒かけての
 * 組み上げが余計に間延びして見える。パッと寄って嵌まるほうが曲に乗る。
 */
const LEAD_MIN = 0.05;
const LEAD_MAX = 0.14;

/** 着地間際で縮んで消え始める割合。1.0が着地の瞬間 */
const SHRINK_START = 0.82;

/** 飛来中の回転速度(ラジアン/進行度)。着地に向けて減衰させる */
const SPIN_MAX = 9;

/** ブロックの石の色。天守のスキャンと馴染む砂岩寄りの色 */
const BLOCK_COLOR = "#b9a486";
/**
 * 飛来中の自己発光。夜空の中でブロックが沈まないよう少しだけ光らせる。
 *
 * 最初はアクセント色(#ff5a1e)を0.55で入れていたが、露出を落とした夜の画では
 * 石の色が完全に負けて「赤いプラスチックの塊」に見えた。天守の自己発光と
 * 同じ橙白を弱く入れて、石が灯りを受けている程度に留める。
 */
const BLOCK_EMISSIVE = new Color("#ffb489");
const BLOCK_EMISSIVE_INTENSITY = 0.22;

/**
 * 組み上げ面の到達高さ。EdoCastle.tsx の BUILD_TOP_Y と揃える
 * (ブロックの着地タイミングを面の進みと合わせるため)。
 */
const BUILD_TOP_Y = CASTLE_TOP_Y + BUILD_EDGE_JITTER;

type Block = {
  /** 着地点(天守の内側のどこか) */
  target: Vector3;
  /** 飛来の開始位置 */
  from: Vector3;
  /** 各軸の回転速度 */
  spin: Vector3;
  /** 一辺のスケール */
  scale: Vector3;
  /** 自分の高さの面が来る組み上げ進行度(0〜1) */
  arriveAt: number;
  /** 何割前から飛び始めるか */
  lead: number;
  /**
   * 隅櫓ぶんのブロックなら true。天守は0.8秒早く終わらせる指定があるので、
   * どちらの進行度(buildRef/towerBuildRef)で動かすかをブロックごとに分ける。
   */
  isTower: boolean;
};

/** なめらかな減速。飛来の終わりで吸い込まれるように寄せる */
function easeOutCubic(x: number) {
  return 1 - (1 - x) ** 3;
}

/**
 * 種から決まる疑似乱数(0〜1)。
 *
 * Math.random() はレンダー中(useMemo の中)では呼べない
 * (react-hooks/purity が「不純な関数」として弾く)ため、
 * インデックスから毎回同じ値を作るハッシュで代用する。
 * 副作用が無いので HMR で作り直されてもブロックの配置が変わらない。
 */
function rand(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * ブロックを撒く1棟ぶんの箱。天守も四隅の櫓もこれ1つで表す。
 * cx/cz は position(天守の底面)からの相対。
 */
type Zone = {
  cx: number;
  cz: number;
  /** 底面の半分の広がり */
  halfW: number;
  halfD: number;
  /** 着地点の高さの上限。櫓は天守より低いのでここも低い */
  topY: number;
  /** 上へ行くほど水平に絞る量(先細る天守=0.55 / ほぼ箱の櫓=0.12) */
  taperAmount: number;
  /** この箱へ飛ばすブロック数 */
  count: number;
  /** 乱数列の起点。箱ごとに重ならない値にする */
  seed: number;
  /** 隅櫓の箱なら true(Block.isTower へそのまま渡す) */
  isTower: boolean;
};

/**
 * zone の範囲へ収束するブロックを list へ積む。
 * 着地の高さ(arriveAt の分子)は箱によらず**全体で1本の組み上げ面**
 * (BUILD_TOP_Y)で測るので、櫓のブロックは面の高さで言えば前半で着地しきる。
 * ただし面を進める進行度(useFrame で読む build)は天守と隅櫓で別の ref に
 * 分けてある(zone.isTower で切り替え。上の Block.isTower のコメント参照)。
 */
function pushZoneBlocks(zone: Zone, list: Block[]) {
  for (let i = 0; i < zone.count; i++) {
    // 1ブロックにつき16個の種を確保して、用途ごとに別の乱数列にする
    const s = zone.seed + i * 16;
    const ty = rand(s + 1) * zone.topY;
    const taper = 1 - (ty / zone.topY) * zone.taperAmount;
    const target = new Vector3(
      zone.cx + (rand(s + 2) * 2 - 1) * zone.halfW * taper,
      ty,
      zone.cz + (rand(s + 3) * 2 - 1) * zone.halfD * taper,
    );

    /*
      飛来の開始位置。着地点から水平方向へランダムに飛ばし、
      少しだけ上へも散らす(真横からだけだと平面的に見える)。
    */
    const angle = rand(s + 4) * Math.PI * 2;
    const distance =
      FLY_MIN_DISTANCE + rand(s + 5) * (FLY_MAX_DISTANCE - FLY_MIN_DISTANCE);
    const from = new Vector3(
      target.x + Math.cos(angle) * distance,
      target.y + (rand(s + 6) * 0.7 + 0.15) * distance,
      target.z + Math.sin(angle) * distance,
    );

    const base =
      BLOCK_MIN_SIZE + rand(s + 7) * (BLOCK_MAX_SIZE - BLOCK_MIN_SIZE);
    list.push({
      target,
      from,
      spin: new Vector3(
        (rand(s + 8) * 2 - 1) * SPIN_MAX,
        (rand(s + 9) * 2 - 1) * SPIN_MAX,
        (rand(s + 10) * 2 - 1) * SPIN_MAX,
      ),
      scale: new Vector3(
        base * (1 + rand(s + 11) * BLOCK_STRETCH),
        base,
        base * (1 + rand(s + 12) * BLOCK_STRETCH),
      ),
      arriveAt: ty / BUILD_TOP_Y,
      lead: LEAD_MIN + rand(s + 13) * (LEAD_MAX - LEAD_MIN),
      isTower: zone.isTower,
    });
  }
}

type CastleAssemblyProps = {
  /** 天守の底面のワールド座標。EdoCastle と同じ値を渡す */
  position?: [number, number, number];
  /**
   * 天守本体ぶんのブロックの進行度(0〜1)を持つ ref。EdoCastle と同じものを渡す。
   * 毎フレーム変わるので数値 prop ではなく ref で受け取る。
   */
  buildRef: RefObject<number>;
  /**
   * 隅櫓ぶんのブロックの進行度(0〜1)を持つ ref。CornerTowers と同じものを渡す。
   * 天守だけ0.8秒早く終わらせる指定があるため、buildRef とは別の ref にして
   * 隅櫓の着地タイミングは変えないようにしてある。省略時は buildRef と同じ
   * 値を使う(天守・隅櫓を同じ進行度で揃えたいとき用)。
   */
  towerBuildRef?: RefObject<number>;
};

/**
 * 天守が組み上がるときに四方から飛来する石のブロック群。
 *
 * Porter Robinson & Madeon "Shelter" 1:21〜 の街が生成されるカットが指定。
 * 無数の直方体が空中を回転しながら収束し、組み上げ面が自分の高さへ来た
 * ところで着地して消える(そのまま EdoCastle 側のシェーダーが同じ高さまで
 * 天守を出すので、ブロックが石垣に化けたように見える)。
 *
 * InstancedMesh 1本で全部描く。毎フレーム行列を組み直すが、
 * useFrame の中では new せず使い回しの Object3D / Vector3 で計算する
 * (@react-three/eslint-plugin の no-new-in-loop 対策でもある)。
 */
export function CastleAssembly({
  position = [0, 0, 0],
  buildRef,
  towerBuildRef,
}: CastleAssemblyProps) {
  const meshRef = useRef<InstancedMesh>(null);

  /*
    ブロックの初期値は一度だけ決める。乱数を毎フレーム引くと
    ブロックが空中でちらついてしまう。
  */
  const blocks = useMemo<Block[]>(() => {
    const list: Block[] = [];

    // 天守本体。上へ行くほど先細るので taper を強めに
    pushZoneBlocks(
      {
        cx: 0,
        cz: 0,
        halfW: CASTLE_HALF_WIDTH,
        halfD: CASTLE_HALF_DEPTH,
        topY: BUILD_TOP_Y,
        taperAmount: 0.55,
        count: BLOCK_COUNT,
        seed: 0,
        isTower: false,
      },
      list,
    );

    /*
      四隅の隅櫓(CornerTowers と同じ配置)。乱数列の起点は天守
      (種は最大 ~14400 まで)と重ならないよう 20000 から 5000 刻みで振る。
    */
    CORNER_TOWER_XZ.forEach(([cx, cz], k) => {
      pushZoneBlocks(
        {
          cx,
          cz,
          halfW: TOWER_HALF_WIDTH,
          halfD: TOWER_HALF_DEPTH,
          topY: TOWER_HEIGHT,
          taperAmount: 0.12,
          count: TOWER_BLOCK_COUNT,
          seed: 20000 + k * 5000,
          isTower: true,
        },
        list,
      );
    });

    return list;
  }, []);

  // useFrame の中で new しないための使い回し
  const dummy = useRef(new Object3D()).current;
  const scratch = useRef(new Vector3()).current;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)。天守と隅櫓で別の値
    const castleBuild = buildRef.current ?? 1;
    const towerBuild = towerBuildRef?.current ?? castleBuild;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const build = b.isTower ? towerBuild : castleBuild;
      // 自分の出番の中での進み具合(0=飛び始め, 1=着地)
      const p = (build - (b.arriveAt - b.lead)) / b.lead;

      if (p <= 0 || p >= 1) {
        // 出番の前後は畳んで隠す(スケール0だと描画されない)
        dummy.scale.setScalar(0);
        dummy.position.copy(b.target);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const k = easeOutCubic(p);
      scratch.copy(b.from).lerp(b.target, k);
      dummy.position.copy(scratch);

      // 回転は着地に向けて止める(ピタッと嵌まったように見せる)
      const spinLeft = 1 - k;
      dummy.rotation.set(
        b.spin.x * spinLeft,
        b.spin.y * spinLeft,
        b.spin.z * spinLeft,
      );

      // 着地間際で縮めて消す。天守側の面が同じ高さまで上がってくる
      const shrink =
        p < SHRINK_START ? 1 : 1 - (p - SHRINK_START) / (1 - SHRINK_START);
      dummy.scale.copy(b.scale).multiplyScalar(shrink);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, TOTAL_BLOCKS]}
      position={position}
      // 空中を飛ぶので、天守の bbox では収まらない。カリングを切る
      frustumCulled={false}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={BLOCK_COLOR}
        emissive={BLOCK_EMISSIVE}
        emissiveIntensity={BLOCK_EMISSIVE_INTENSITY}
        roughness={0.8}
        metalness={0.05}
      />
    </instancedMesh>
  );
}
