-- CharacterAnimation: ヤチヨベースのヒエラルキー制御スクリプト
-- 機能: ① 呼吸する処理   ② カーソルを目が追う処理   ③ ランダムまばたき
--       ④ 前髪の上部にカーソルを置くと笑顔(smile)になる処理
--       ⑤ 一定範囲までは目だけ動かし、超えたら顔・全体を向ける(深度パララックス)処理
--       ⑥ リップシンク: 母音(あいうえお)に応じて mouth を不透明度で切り替える処理
--          (playVowels(self, 母音列) で再生。将来はテキストの母音列を渡す)
--       ⑦ ダブルクリックで顔を右に傾けて右目をウインクさせる処理
--       ⑧ 歌唱モード: React 側が音楽の振幅を singAmplitude(0〜1) に書き込み、
--          その値で自動口パク + 左右へのゆっくりしたスウェイ + 時々の笑顔で
--          楽しく歌っているように見せる処理
--          ※ まばたき/笑顔/ウインクは左右別の不透明度で制御する:
--            左目 = blinkOpen/blinkSmile、右目 = eyeOpenR/eyeSmileR
--
-- ③④ まばたき/笑顔は eyes グループに追加したsmileまつ毛を不透明度で切り替える:
--    通常まつ毛+虹彩+白目 (blinkOpen) ↔ smileまつ毛 (blinkSmile) を直接クロスフェード。
--    ④の判定領域は EYE_WORLD と同じポインタ座標系で指定する(HAIR_* 定数)。
--
-- ※ ベースアートボード(0-12223)の "PointerHitArea" シェイプ(0-43545)に
--   アタッチして使用する。これは (0,0)〜(1024,1024) を覆う実質透明
--   (alpha=1/255) の矩形で、どこにカーソルがあっても pointerMove が届く。
--   ViewModel "CharacterAnim" がアートボードにバインドされ、20個の
--   Number プロパティが各パーツの X/Y にデータバインドされている前提。

type CharacterAnimation = {
    -- 目パーツ (eyes グループ相対のローカル X/Y)
    vmIrisRX: Property<number>?,
    vmIrisRY: Property<number>?,
    vmIrisLX: Property<number>?,
    vmIrisLY: Property<number>?,
    vmEyelashRX: Property<number>?,
    vmEyelashRY: Property<number>?,
    vmEyelashLX: Property<number>?,
    vmEyelashLY: Property<number>?,
    vmEyewhiteRX: Property<number>?,
    vmEyewhiteRY: Property<number>?,
    vmEyewhiteLX: Property<number>?,
    vmEyewhiteLY: Property<number>?,
    vmEyebrowRX: Property<number>?,
    vmEyebrowRY: Property<number>?,
    vmEyebrowLX: Property<number>?,
    vmEyebrowLY: Property<number>?,
    -- 呼吸で上下させるボディパーツの Y
    vmFaceY: Property<number>?,
    vmNeckY: Property<number>?,
    vmTopwearY: Property<number>?,
    vmBackHairY: Property<number>?,
    -- まばたき/笑顔/ウインク用の不透明度 (0〜1)。左右別々に制御する
    vmBlinkOpen: Property<number>?,   -- 左目: 通常まつ毛+虹彩+白目
    vmBlinkSmile: Property<number>?,  -- 左目: smileまつ毛
    vmEyeOpenR: Property<number>?,    -- 右目: 通常まつ毛+虹彩+白目
    vmEyeSmileR: Property<number>?,   -- 右目: smileまつ毛
    vmFaceRot: Property<number>?,     -- 顔グループの回転(ラジアン, 正=右傾き)
    vmNeckRot: Property<number>?,     -- 首の回転(歌唱: body に上乗せして首を曲げる)
    vmBodyRot: Property<number>?,     -- 体の回転(歌唱: 腰支点で左右に揺らす)
    vmBackHairRot: Property<number>?, -- 後ろ髪の回転(歌唱: 頭と同じ向きに揺らす)
    -- root の r/x/y(現状は基準位置に固定し続けるだけ＝横スライド廃止)
    vmBaseRot: Property<number>?,
    vmBaseX: Property<number>?,
    vmBaseY: Property<number>?,
    -- 振り向き(深度パララックス)で動かすパーツ
    vmFaceX: Property<number>?,       -- 顔グループ全体の X(頭の移動)
    vmNoseX: Property<number>?,       -- 鼻の X
    vmNoseY: Property<number>?,       -- 鼻の Y
    vmMouthX: Property<number>?,      -- 口の X
    vmMouthY: Property<number>?,      -- 口の Y
    vmBodyX: Property<number>?,       -- 体ノードの X
    vmNeckX: Property<number>?,       -- 首の X
    vmHairX: Property<number>?,       -- 前髪ノードの X
    vmHairY: Property<number>?,       -- 前髪ノードの Y
    vmBackHairX: Property<number>?,   -- 後ろ髪の X
    -- リップシンク用の口の不透明度 (0〜1)。[あ,い,う,え,お,閉じ]
    vmMouthA: Property<number>?,
    vmMouthI: Property<number>?,
    vmMouthU: Property<number>?,
    vmMouthE: Property<number>?,
    vmMouthO: Property<number>?,
    vmMouthClose: Property<number>?,
    -- 入力・内部状態
    mouseX: number,
    mouseY: number,
    breathTime: number,
    eyeOffsetX: number,
    eyeOffsetY: number,
    turnX: number,        -- 振り向き(横)のなめらかな値 (-1〜1)
    turnY: number,        -- 振り向き(縦)のなめらかな値 (-1〜1)
    -- まばたき状態
    blinking: boolean,    -- まばたき中か
    blinkT: number,       -- まばたき開始からの経過秒
    blinkTimer: number,   -- 次のまばたきまでの残り秒
    smileHover: number,   -- 前髪ホバーによるsmile量 (0〜1, なめらかに補間)
    winking: boolean,     -- 右目ウインク+傾き中か
    winkT: number,        -- ウインク開始からの経過秒
    lastClickAt: number,  -- 直近クリック時刻(breathTime基準。ダブルクリック判定用)
    -- リップシンク状態
    mouthOp: {number},    -- 5口の現在不透明度 [あ,い,う,え,お]
    vowelSeq: {number},   -- 再生中の母音列(各要素は VOWEL_A..O)
    seqPos: number,       -- 再生位置(1始まり, 0=休止中)
    seqTimer: number,     -- 現在の母音の残り表示時間(秒)
    -- 歌唱モード (React 側が音楽の振幅を singAmplitude に書き込む)
    vmSingAmp: Property<number>?,  -- 入力: 現在の音量振幅 (0〜1)
    singTimer: number,    -- 次の口の切り替えまでの残り秒
    singVowel: number,    -- 現在歌っている母音(VOWEL_A..O)
    singPhase: number,    -- 体の弾み・横揺れ用の位相
    singEnv: number,      -- 振幅エンベロープ(生の振幅をなめらかにした値。口パク用)
    singActive: boolean,  -- 歌唱中か(ヒステリシスでチャタリング防止。口パク用)
    swayGate: number,     -- 揺れの強さ(0=停止〜1=フルスウェイ。歌唱でなめらかに出入り)
    -- 歌唱中に時々ニコッと笑う状態
    singSmiling: boolean,    -- 笑顔の最中か
    singSmileHold: number,   -- 笑顔の残り保持時間(秒)
    singSmileTimer: number,  -- 次の笑顔までの残り秒
    singSmileAmt: number,    -- 笑顔量(0〜1, なめらかに補間)
}

-- 目パーツの基準ローカル座標 (eyes グループ相対)
local IRIS_RX, IRIS_RY  = -51.0,  7.0
local IRIS_LX, IRIS_LY  =  52.0,  3.0
local LASH_RX, LASH_RY  = -57.0,  1.5
local LASH_LX, LASH_LY  =  56.5, -2.5
local WHIT_RX, WHIT_RY  = -53.0,  7.0
local WHIT_LX, WHIT_LY  =  52.0,  2.0
local BROW_RX, BROW_RY  = -49.0,  1.0
local BROW_LX, BROW_LY  =  51.5, -2.5

-- 呼吸で動かすボディパーツの基準 Y
local BASE_FACE_Y  = 494.0
local BASE_BHAIR_Y = 494.0
local BASE_NECK_Y  = -256.5
local BASE_TOP_Y   = 52.0

-- 振り向き(パララックス)で動かすパーツの基準 X/Y
local BASE_FACE_X  = 512.0   -- 顔グループ
local BASE_NOSE_X  = -4.0    -- 鼻
local BASE_NOSE_Y  = -175.5  -- 鼻
local BASE_MOUTH_X = -4.5    -- 口
local BASE_MOUTH_Y = -133.0  -- 口
local BASE_BODY_X  = 512.0   -- 体ノード
local BASE_NECK_X  = -4.5    -- 首
local BASE_HAIR_X  = 0.0     -- 前髪ノード
local BASE_HAIR_Y  = 0.0     -- 前髪ノード
local BASE_BHAIR_X = 512.0   -- 後ろ髪

-- eyes グループのアートボード座標: face(512,494) + eyes(-7,-210) = (505, 284)
local EYE_WORLD_X = 0.0
local EYE_WORLD_Y = -180.0

-- 目追従パラメータ
local EYE_MAX_OFFSET = 4.5    -- 瞳が動ける最大ピクセル量
local EYE_REACH      = 250.0  -- この距離で追従量が最大(=±1)になる
local EYE_LERP_SPEED = 5.0    -- 追従の滑らかさ(高いほど俊敏)

-- 振り向き(深度パララックス)パラメータ
-- EYE_REACH を超えた分で 0→1 に立ち上がり、TURN_REACH で最大になる
local TURN_REACH   = 560.0   -- この距離で振り向きが最大(=±1)
-- パーツごとの最大移動量(px)。前方ほど大きく動かして擬似3Dの奥行きを出す
local HEAD_X, HEAD_Y         = 16.0, 10.0  -- 顔グループ全体(頭の移動。中景)
local NOSE_X, NOSE_Y         =  8.0,  5.0  -- 鼻(最前面: 頭移動に上乗せ)
local MOUTH_X, MOUTH_Y       =  5.0,  3.0  -- 口(上乗せ)
local HAIRTURN_X, HAIRTURN_Y =  7.0,  4.0  -- 前髪(上乗せ)
local BHAIRTURN_X  = -5.0    -- 後ろ髪(逆方向→振り向きで見えてくる)
local BODYTURN_X   =  6.0    -- 体(頭につられて傾く)
local NECKTURN_X   =  4.0    -- 首(体に上乗せ)

-- 呼吸パラメータ
local BREATH_AMP   = 5.0      -- 上下の振幅(Riveユニット)
local BREATH_SPEED = 0.25     -- 1秒あたりの呼吸サイクル数 (0.25 = 約15回/分)

-- まばたきパラメータ
local BLINK_CLOSE = 0.08     -- 通常→smile に閉じる時間(秒)
local BLINK_HOLD  = 0.06     -- smile(閉じ切り)を保つ時間(秒)
local BLINK_OPEN  = 0.14     -- smile→通常 に開く時間(秒)
local BLINK_TOTAL = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN
local BLINK_MIN   = 2.0      -- 次のまばたきまでの最短間隔(秒)
local BLINK_MAX   = 6.0      -- 次のまばたきまでの最長間隔(秒)

-- ウインク+顔の傾きパラメータ(右クリックで発動)
local WINK_IN    = 0.14     -- 目を閉じ・顔を傾けるまでの時間(秒)
local WINK_HOLD  = 0.50     -- 閉じ・傾けたまま保つ時間(秒)
local WINK_OUT   = 0.25     -- 元に戻る時間(秒)
local WINK_TOTAL = WINK_IN + WINK_HOLD + WINK_OUT
-- ウインクの頭の傾きは歌唱スウェイ(SING_HEAD_ROT)に対する割合で持つ。
-- こうすると揺れと同じスケールなので、ウインク中も頭を止めず傾きだけ合成できる。
local WINK_TILT_FRAC = 0.05  -- ウインク時に右へ傾ける量(頭の振り角に対する割合)
local WINK_SWAY_DUCK = 0.1  -- ウインク中にスウェイを弱める割合(0=弱めない/1=止める)
local DOUBLE_CLICK_TIME = 0.3 -- この秒数以内の2クリックをダブルクリックとみなす

-- リップシンク(あいうえお + 閉じ)パラメータ
local VOWEL_A, VOWEL_I, VOWEL_U, VOWEL_E, VOWEL_O = 1, 2, 3, 4, 5
local MOUTH_CLOSE = 6        -- 口閉じ
local MOUTH_COUNT = 6        -- 口の総数
local REST_VOWEL = MOUTH_CLOSE -- 休止時に見せる口(口閉じ)
local VOWEL_DUR  = 0.35      -- 1母音あたりの表示時間(秒)
local MOUTH_LERP = 12.0      -- 口の切り替え速度(高いほどパキッと切替)

-- 歌唱モード(React が singAmplitude に音楽の振幅を書き込む)パラメータ
-- React 由来の振幅はフレームごとにガタつくため、そのまま揺れに使うとガクガク・
-- 瞬きのちらつきが出る。そこで「エンベロープで滑らかにした値」と「ヒステリシス付きの
-- 歌唱フラグ」を作り、口パクはこのエンベロープ値(singEnv)で母音・速さを変える。
--
-- 揺れ(swayGate)は口パクとは別に、「歌唱モードそのものがONか」で駆動する。
-- 実音源には歌い出し前の前奏や間奏など、本物の無音区間が何秒も続くことがある。
-- 口パク用のヒステリシス(SING_ON/OFF)で揺れも止めると、その間ずっと揺れが
-- 止まってしまい「歌っている間ずっと」揺れてほしい意図に反する。
-- そこでReact側は歌唱モード中、実振幅が0でも SWAY_ACTIVE_EPS を上回る
-- 最小値(SING_MODE_FLOOR。口パクのSING_GAPより十分小さい)まで底上げして送ってくる。
-- rawAmpがこの床を上回っている間は「モードON」とみなし、無音でも揺れを止めない。
local SING_ON        = 0.12   -- これ以上で歌唱開始(エンベロープ基準。口パクのトリガー)
local SING_OFF       = 0.05   -- これ未満で口パクの歌唱状態を停止(ヒステリシスでチャタリング防止)
local SING_GAP       = 0.06   -- これ未満は口を閉じる(息継ぎ・フレーズの合間)
local AMP_ATTACK     = 14.0   -- 振幅エンベロープ: 上がるとき(俊敏に追従)
local AMP_RELEASE    = 5.0    -- 振幅エンベロープ: 下がるとき(ゆっくり戻す)
local SWAY_GATE_LERP = 2.5    -- 揺れの出入りのなめらかさ(高いほど早くフルスウェイ)
local SWAY_ACTIVE_EPS = 0.01  -- これを上回れば「歌唱モードON」。React側のSING_MODE_FLOOR(0.02)より下
local SING_DUR_MAX   = 0.34   -- 口の切り替え間隔(静かなとき=ゆっくり)
local SING_DUR_MIN   = 0.18   -- 口の切り替え間隔(大きいとき=速い)
-- 「左右に首をかしげる」楽しそうな揺れ。平行移動はせず各パーツの rotation だけで揺らす。
-- 頭(顔)を一番大きく傾け、首・体・後ろ髪がしなって追従する。
-- 揺れの強さは音量ではなく swayGate(歌唱中=1へ補間)で決めるので一定ペースで安定する。
local SING_SWAY_SPEED  = 0.5   -- 揺れの周期(/秒。大きいほど軽快)
local SING_HEAD_ROT    = 6      -- 頭(顔)の振り角(首かしげの主役)
local SING_BHAIR_ROT   = 5.1    -- 後ろ髪の振り角(頭の約0.85倍。少ししなり感)
local SING_NECK_ROT    = 3.0    -- 首の振り角(頭の約0.5倍。body に上乗せ)
local SING_BODY_ROT    = 1.7  -- 体の振り角(頭の約0.3倍。土台の軽いリーン)
local BASE_ROOT_X      = -220.0 -- root の基準 X(動かさず保持)
local BASE_ROOT_Y      = 0.0    -- root の基準 Y
-- 歌っているとき時々ニコッと笑う(頻度低め)
local SING_SMILE_MIN  = 4.0    -- 次の笑顔までの最短間隔(秒)
local SING_SMILE_MAX  = 9.0    -- 次の笑顔までの最長間隔(秒)
local SING_SMILE_HOLD = 1.2    -- 笑顔を保つ時間(秒)
local SING_SMILE_LERP = 8.0    -- 笑顔の出入りのなめらかさ(高いほど俊敏)

-- 振幅に応じて歌う母音を選ぶ。大きいと開いた口(あ/お/え)、小さいと狭い口(い/う/え)
local function pickSingVowel(amp: number): number
    if amp > 0.35 then
        return ({VOWEL_A, VOWEL_O, VOWEL_E})[math.random(3)]
    end
    return ({VOWEL_I, VOWEL_U, VOWEL_E})[math.random(3)]
end

-- 前髪の上部ホバーでsmileにする判定領域(EYE_WORLD と同じポインタ座標系)
-- front hair のアートボード境界 x[374,632] y[104,635] を eyes基準(505,464)で換算した上部
local HAIR_X_MIN   = -135.0  -- 前髪領域の左端
local HAIR_X_MAX   =  130.0  -- 前髪領域の右端
local HAIR_Y_TOP   = -420.0  -- 前髪の上端(これより下から判定)
local HAIR_Y_BOT   = -280.0  -- 目の少し上まで(ここより上が「上部分」)
local SMILE_LERP   = 12.0    -- ホバーsmileの反応速度(高いほど俊敏)

--次のまばたきまでの待ち時間をランダムに決める
local function nextBlinkInterval(): number
    return BLINK_MIN + math.random() * (BLINK_MAX - BLINK_MIN)
end

-- まばたき経過時間 t から「閉じ具合」b を返す (0=開 / 1=閉じ切り)
local function blinkClose(t: number): number
    if t < BLINK_CLOSE then
        return t / BLINK_CLOSE
    elseif t < BLINK_CLOSE + BLINK_HOLD then
        return 1.0
    elseif t < BLINK_TOTAL then
        return 1.0 - (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN
    end
    return 0.0
end

-- ウインク経過時間 t から「閉じ・傾け具合」(0=通常 / 1=閉じ切り)を返す
local function winkEnv(t: number): number
    if t < WINK_IN then
        return t / WINK_IN
    elseif t < WINK_IN + WINK_HOLD then
        return 1.0
    elseif t < WINK_TOTAL then
        return 1.0 - (t - WINK_IN - WINK_HOLD) / WINK_OUT
    end
    return 0.0
end

-- 母音列の再生を開始する。将来テキスト→母音列にして呼べば自動リップシンクになる
-- 例: playVowels(self, {VOWEL_A, VOWEL_I, VOWEL_U, VOWEL_E, VOWEL_O})
local function playVowels(self: CharacterAnimation, seq: {number})
    self.vowelSeq = seq
    self.seqPos = 1
    self.seqTimer = VOWEL_DUR
end

-- カーソル位置から瞳のオフセット(目標値)を計算する
local function eyeOffset(mx: number, my: number): (number, number)
    local dx = mx - EYE_WORLD_X
    local dy = my - EYE_WORLD_Y
    local dist = math.sqrt(dx * dx + dy * dy)
    if dist < 0.001 then return 0, 0 end
    local t = math.min(dist / EYE_REACH, 1.0)
    return (dx / dist) * t * EYE_MAX_OFFSET,
           (dy / dist) * t * EYE_MAX_OFFSET
end

function init(self: CharacterAnimation, context: Context): boolean
    local vm = context:viewModel()
    if not vm then
        print("[CharacterAnimation] ViewModelなし")
        return false
    end
    self.vmIrisRX     = vm:getNumber("irisRX")
    self.vmIrisRY     = vm:getNumber("irisRY")
    self.vmIrisLX     = vm:getNumber("irisLX")
    self.vmIrisLY     = vm:getNumber("irisLY")
    self.vmEyelashRX  = vm:getNumber("eyelashRX")
    self.vmEyelashRY  = vm:getNumber("eyelashRY")
    self.vmEyelashLX  = vm:getNumber("eyelashLX")
    self.vmEyelashLY  = vm:getNumber("eyelashLY")
    self.vmEyewhiteRX = vm:getNumber("eyewhiteRX")
    self.vmEyewhiteRY = vm:getNumber("eyewhiteRY")
    self.vmEyewhiteLX = vm:getNumber("eyewhiteLX")
    self.vmEyewhiteLY = vm:getNumber("eyewhiteLY")
    self.vmEyebrowRX  = vm:getNumber("eyebrowRX")
    self.vmEyebrowRY  = vm:getNumber("eyebrowRY")
    self.vmEyebrowLX  = vm:getNumber("eyebrowLX")
    self.vmEyebrowLY  = vm:getNumber("eyebrowLY")
    self.vmFaceY      = vm:getNumber("faceY")
    self.vmNeckY      = vm:getNumber("neckY")
    self.vmTopwearY   = vm:getNumber("topwearY")
    self.vmBackHairY  = vm:getNumber("backHairY")
    self.vmBlinkOpen  = vm:getNumber("blinkOpen")
    self.vmBlinkSmile = vm:getNumber("blinkSmile")
    self.vmEyeOpenR   = vm:getNumber("eyeOpenR")
    self.vmEyeSmileR  = vm:getNumber("eyeSmileR")
    self.vmFaceRot    = vm:getNumber("faceRot")
    self.vmNeckRot    = vm:getNumber("neckRot")
    self.vmBodyRot    = vm:getNumber("bodyRot")
    self.vmBackHairRot = vm:getNumber("backHairRot")
    self.vmBaseRot    = vm:getNumber("baseRot")
    self.vmBaseX      = vm:getNumber("baseX")
    self.vmBaseY      = vm:getNumber("baseY")
    -- root の初期位置(バインド既定値0で character がズレるのを防ぐ)
    if self.vmBaseRot then self.vmBaseRot.value = 0.0 end
    if self.vmBaseX   then self.vmBaseX.value   = BASE_ROOT_X end
    if self.vmBaseY   then self.vmBaseY.value   = BASE_ROOT_Y end
    self.vmFaceX      = vm:getNumber("faceX")
    self.vmNoseX      = vm:getNumber("noseX")
    self.vmNoseY      = vm:getNumber("noseY")
    self.vmMouthX     = vm:getNumber("mouthX")
    self.vmMouthY     = vm:getNumber("mouthY")
    self.vmBodyX      = vm:getNumber("bodyX")
    self.vmNeckX      = vm:getNumber("neckX")
    self.vmHairX      = vm:getNumber("hairX")
    self.vmHairY      = vm:getNumber("hairY")
    self.vmBackHairX  = vm:getNumber("backHairX")
    self.vmMouthA     = vm:getNumber("mouthA")
    self.vmMouthI     = vm:getNumber("mouthI")
    self.vmMouthU     = vm:getNumber("mouthU")
    self.vmMouthE     = vm:getNumber("mouthE")
    self.vmMouthO     = vm:getNumber("mouthO")
    self.vmMouthClose = vm:getNumber("mouthClose")
    self.vmSingAmp    = vm:getNumber("singAmplitude")

    -- まばたき初期状態: 目を開いた状態にして最初のまばたきまで待機
    self.blinking   = false
    self.blinkT     = 0
    self.blinkTimer = nextBlinkInterval()
    self.smileHover = 0
    self.winking    = false
    self.winkT      = 0
    self.lastClickAt = -100
    self.turnX      = 0
    self.turnY      = 0
    -- リップシンク初期状態: 休止(口閉じ)の口だけ表示
    self.mouthOp    = {0, 0, 0, 0, 0, 1}  -- [あ,い,う,え,お,閉じ]
    self.vowelSeq   = {}
    self.seqPos     = 0
    self.seqTimer   = 0
    -- 歌唱モード初期状態
    self.singTimer  = 0
    self.singVowel  = REST_VOWEL
    self.singPhase  = 0
    self.singEnv    = 0
    self.singActive = false
    self.swayGate   = 0
    self.singSmiling   = false
    self.singSmileHold = 0
    self.singSmileTimer = SING_SMILE_MIN + math.random() * (SING_SMILE_MAX - SING_SMILE_MIN)
    self.singSmileAmt  = 0
    if self.vmBlinkOpen  then self.vmBlinkOpen.value  = 1.0 end
    if self.vmBlinkSmile then self.vmBlinkSmile.value = 0.0 end

    print("[CharacterAnimation] 初期化完了")
    return true
end

function advance(self: CharacterAnimation, seconds: number): boolean
    -- ===== ① 呼吸する処理 =====
    self.breathTime += seconds
    -- 正弦波: 上方向(-Y)がピーク
    local breathY = -math.sin(self.breathTime * math.tau * BREATH_SPEED) * BREATH_AMP
    -- faceY は ⑤ で呼吸 + 振り向きの縦成分をまとめて書き込む
    if self.vmBackHairY then self.vmBackHairY.value = BASE_BHAIR_Y + breathY * 0.6 end
    if self.vmNeckY     then self.vmNeckY.value     = BASE_NECK_Y  + breathY       end
    if self.vmTopwearY  then self.vmTopwearY.value  = BASE_TOP_Y   + breathY       end

    -- ===== ② カーソルを目が追う処理 =====
    local tx, ty = eyeOffset(self.mouseX, self.mouseY)
    -- 目標オフセットへ滑らかに補間 (フレームレート非依存)
    local a = math.min(EYE_LERP_SPEED * seconds, 1.0)
    self.eyeOffsetX += (tx - self.eyeOffsetX) * a
    self.eyeOffsetY += (ty - self.eyeOffsetY) * a
    local ox = self.eyeOffsetX
    local oy = self.eyeOffsetY

    -- パーツごとに追従量を変えて奥行き感を出す (虹彩が最も動く)
    if self.vmIrisRX     then self.vmIrisRX.value     = IRIS_RX + ox        end
    if self.vmIrisRY     then self.vmIrisRY.value     = IRIS_RY + oy        end
    if self.vmIrisLX     then self.vmIrisLX.value     = IRIS_LX + ox        end
    if self.vmIrisLY     then self.vmIrisLY.value     = IRIS_LY + oy        end
    if self.vmEyelashRX  then self.vmEyelashRX.value  = LASH_RX + ox * 0.6  end
    if self.vmEyelashRY  then self.vmEyelashRY.value  = LASH_RY + oy * 0.4  end
    if self.vmEyelashLX  then self.vmEyelashLX.value  = LASH_LX + ox * 0.6  end
    if self.vmEyelashLY  then self.vmEyelashLY.value  = LASH_LY + oy * 0.4  end
    if self.vmEyewhiteRX then self.vmEyewhiteRX.value = WHIT_RX + ox * 0.2  end
    if self.vmEyewhiteRY then self.vmEyewhiteRY.value = WHIT_RY + oy * 0.2  end
    if self.vmEyewhiteLX then self.vmEyewhiteLX.value = WHIT_LX + ox * 0.2  end
    if self.vmEyewhiteLY then self.vmEyewhiteLY.value = WHIT_LY + oy * 0.2  end
    if self.vmEyebrowRX  then self.vmEyebrowRX.value  = BROW_RX + ox * 0.15 end
    if self.vmEyebrowRY  then self.vmEyebrowRY.value  = BROW_RY + oy * 0.1  end
    if self.vmEyebrowLX  then self.vmEyebrowLX.value  = BROW_LX + ox * 0.15 end
    if self.vmEyebrowLY  then self.vmEyebrowLY.value  = BROW_LY + oy * 0.1  end

    -- ===== ⑤ 範囲を超えたら顔・全体を向ける(深度パララックス) =====
    -- 目は EYE_REACH までで最大(②)。ここではそれを超えた分で「振り向き」を立ち上げる
    local dx = self.mouseX - EYE_WORLD_X
    local dy = self.mouseY - EYE_WORLD_Y
    local dist = math.sqrt(dx * dx + dy * dy)
    local ux, uy = 0.0, 0.0
    if dist > 0.001 then ux, uy = dx / dist, dy / dist end
    -- EYE_REACH〜TURN_REACH で 0→1。方向(ux,uy)を掛けて符号付きにする
    local turnFrac = math.clamp((dist - EYE_REACH) / (TURN_REACH - EYE_REACH), 0, 1)
    self.turnX += (ux * turnFrac - self.turnX) * a
    self.turnY += (uy * turnFrac - self.turnY) * a
    local hx = self.turnX
    local hy = self.turnY

    -- 中景: 顔グループ全体(=頭)を動かす。縦は呼吸と合算
    if self.vmFaceX     then self.vmFaceX.value     = BASE_FACE_X  + hx * HEAD_X            end
    if self.vmFaceY     then self.vmFaceY.value     = BASE_FACE_Y  + breathY + hy * HEAD_Y  end
    -- 前景: 顔グループ移動に上乗せ(前方ほど大きく → 奥行き)
    if self.vmNoseX     then self.vmNoseX.value     = BASE_NOSE_X  + hx * NOSE_X            end
    if self.vmNoseY     then self.vmNoseY.value     = BASE_NOSE_Y  + hy * NOSE_Y            end
    if self.vmMouthX    then self.vmMouthX.value    = BASE_MOUTH_X + hx * MOUTH_X           end
    if self.vmMouthY    then self.vmMouthY.value    = BASE_MOUTH_Y + hy * MOUTH_Y           end
    if self.vmHairX     then self.vmHairX.value     = BASE_HAIR_X  + hx * HAIRTURN_X        end
    if self.vmHairY     then self.vmHairY.value     = BASE_HAIR_Y  + hy * HAIRTURN_Y        end
    -- 背景: 後ろ髪は逆方向に少し(振り向きで見えてくる)
    if self.vmBackHairX then self.vmBackHairX.value = BASE_BHAIR_X + hx * BHAIRTURN_X       end
    -- 体・首: 頭の振り向きにつられて傾ける
    if self.vmBodyX     then self.vmBodyX.value     = BASE_BODY_X  + hx * BODYTURN_X        end
    if self.vmNeckX     then self.vmNeckX.value     = BASE_NECK_X  + hx * NECKTURN_X        end

    -- ===== ④ 前髪の上部ホバーで笑顔 =====
    -- カーソルが前髪上部の矩形内にあるか判定(mouseX/Y は EYE_WORLD と同じ座標系)
    local overHair = self.mouseX >= HAIR_X_MIN and self.mouseX <= HAIR_X_MAX
                 and self.mouseY >= HAIR_Y_TOP and self.mouseY <= HAIR_Y_BOT
    -- ホバーsmileを目標値へなめらかに補間
    local sa = math.min(SMILE_LERP * seconds, 1.0)
    self.smileHover += ((if overHair then 1.0 else 0.0) - self.smileHover) * sa

    -- ===== 歌唱モードの判定 + 時々の笑顔 =====
    -- React が singAmplitude(0〜1) を毎フレーム書き込む。口パク・体の動きで共用する
    -- 生の振幅はガタつくのでエンベロープで平滑化(口パクはこの滑らかな値を使う)
    local rawAmp = if self.vmSingAmp then self.vmSingAmp.value else 0.0
    local ampRate = if rawAmp > self.singEnv then AMP_ATTACK else AMP_RELEASE
    self.singEnv += (rawAmp - self.singEnv) * math.min(ampRate * seconds, 1.0)
    local singAmp = self.singEnv
    -- 歌唱フラグはヒステリシス(開始0.12/停止0.05)でチャタリングを防ぐ
    if self.singActive then
        if singAmp < SING_OFF then self.singActive = false end
    else
        if singAmp > SING_ON then self.singActive = true end
    end
    local singing = self.singActive
    -- 揺れ用の「歌唱モードがONか」は口パクのヒステリシスとは別に、
    -- rawAmp(エンベロープ前の生値)を直接見る。React側は歌唱モード中、
    -- 実音量が0でもSING_MODE_FLOORまで底上げして送ってくるため、
    -- 本物の無音区間(前奏・間奏など)でも揺れは止まらず、モードが
    -- OFFになった(rawAmpが正真正銘0になった)ときだけ止まる。
    local swaying = rawAmp > SWAY_ACTIVE_EPS
    -- 歌っているあいだ、たまにニコッと笑う(SING_SMILE_MIN〜MAX 秒ごとに HOLD 秒だけ)
    if singing then
        if self.singSmiling then
            self.singSmileHold -= seconds
            if self.singSmileHold <= 0 then
                self.singSmiling = false
                self.singSmileTimer = SING_SMILE_MIN
                    + math.random() * (SING_SMILE_MAX - SING_SMILE_MIN)
            end
        else
            self.singSmileTimer -= seconds
            if self.singSmileTimer <= 0 then
                self.singSmiling = true
                self.singSmileHold = SING_SMILE_HOLD
            end
        end
    else
        self.singSmiling = false
    end
    -- 笑顔量を目標値へなめらかに補間
    local smt = math.min(SING_SMILE_LERP * seconds, 1.0)
    self.singSmileAmt += ((if self.singSmiling then 1.0 else 0.0) - self.singSmileAmt) * smt

    -- ===== ③ ランダムまばたき (通常→smile→通常) =====
    if self.blinking then
        self.blinkT += seconds
        if self.blinkT >= BLINK_TOTAL then
            -- まばたき終了。次のまばたきまでの待ち時間を再抽選
            self.blinking = false
            self.blinkTimer = nextBlinkInterval()
        end
    elseif not overHair and not self.winking then
        -- ホバー中・ウインク中はまばたきを止める
        self.blinkTimer -= seconds
        if self.blinkTimer <= 0 then
            self.blinking = true
            self.blinkT = 0
        end
    end

    -- ===== ⑦ ウインク(右目)+顔の傾き =====
    if self.winking then
        self.winkT += seconds
        if self.winkT >= WINK_TOTAL then self.winking = false end
    end
    local winkE = if self.winking then winkEnv(self.winkT) else 0.0

    -- まばたき/笑顔/ウインクを左右別々に反映
    -- 左目 = まばたき+笑顔、右目 = まばたき+笑顔+ウインク
    local b = if self.blinking then blinkClose(self.blinkT) else 0.0
    local closeL = math.max(b, self.smileHover, self.singSmileAmt)
    local closeR = math.max(b, self.smileHover, self.singSmileAmt, winkE)
    if self.vmBlinkOpen  then self.vmBlinkOpen.value  = 1.0 - closeL end  -- 左目 開き
    if self.vmBlinkSmile then self.vmBlinkSmile.value = closeL       end  -- 左目 smile
    if self.vmEyeOpenR   then self.vmEyeOpenR.value   = 1.0 - closeR end  -- 右目 開き
    if self.vmEyeSmileR  then self.vmEyeSmileR.value  = closeR       end  -- 右目 smile
    -- 顔・首・体・後ろ髪の rotation は下のスウェイ処理でまとめて書き込む。
    -- ウインクの傾き(winkE)もそこで揺れに合成するので、ここでは書かない
    -- (別々に書くとウインク中に頭だけ固定され、終了時にカクッと跳ねるため)。

    -- ===== ⑥ リップシンク(あいうえお) =====
    -- 母音列を再生中ならタイマーを進め、終わったら休止(REST)へ戻す
    if self.seqPos >= 1 then
        self.seqTimer -= seconds
        if self.seqTimer <= 0 then
            self.seqPos += 1
            if self.seqPos > #self.vowelSeq then
                self.seqPos = 0          -- 再生終了
            else
                self.seqTimer = VOWEL_DUR
            end
        end
    end
    -- 現在見せる母音(再生中はシーケンス値, それ以外は REST=口閉じ)
    local cur = REST_VOWEL
    if self.seqPos >= 1 then cur = self.vowelSeq[self.seqPos] end

    -- ===== 歌唱モード(音楽の振幅で自動口パク) =====
    -- singAmp / singing は前段(笑顔判定)で算出済み。母音列の再生より優先する
    if singing then
        -- 一定間隔で口を切り替える(音が大きいほど速くパクパク)
        self.singTimer -= seconds
        if self.singTimer <= 0 then
            self.singVowel = pickSingVowel(singAmp)
            self.singTimer = SING_DUR_MAX
                - (SING_DUR_MAX - SING_DUR_MIN) * math.min(singAmp, 1.0)
        end
        cur = self.singVowel
    elseif singAmp <= SING_GAP and self.seqPos < 1 then
        -- フレーズの合間など、音が小さいときは口を閉じる
        cur = MOUTH_CLOSE
        self.singTimer = 0
    end
    -- 各口の不透明度を「現在の母音=1 / それ以外=0」へクロスフェード
    local ml = math.min(MOUTH_LERP * seconds, 1.0)
    for v = 1, MOUTH_COUNT do
        local target = if v == cur then 1.0 else 0.0
        self.mouthOp[v] += (target - self.mouthOp[v]) * ml
    end
    if self.vmMouthA     then self.vmMouthA.value     = self.mouthOp[VOWEL_A]     end
    if self.vmMouthI     then self.vmMouthI.value     = self.mouthOp[VOWEL_I]     end
    if self.vmMouthU     then self.vmMouthU.value     = self.mouthOp[VOWEL_U]     end
    if self.vmMouthE     then self.vmMouthE.value     = self.mouthOp[VOWEL_E]     end
    if self.vmMouthO     then self.vmMouthO.value     = self.mouthOp[VOWEL_O]     end
    if self.vmMouthClose then self.vmMouthClose.value = self.mouthOp[MOUTH_CLOSE] end

    -- ===== 歌っているとき、各パーツの rotation だけで左右に揺らす(平行移動なし) =====
    -- root・各パーツの位置は動かさない(横スライド廃止)。
    -- バインド既定値0でズレないよう root の基準位置を書き続ける。
    if self.vmBaseRot then self.vmBaseRot.value = 0.0 end
    if self.vmBaseX   then self.vmBaseX.value   = BASE_ROOT_X end
    if self.vmBaseY   then self.vmBaseY.value   = BASE_ROOT_Y end

    -- ===== 歌唱中、左右に首をかしげる楽しそうな揺れ(各パーツの rotation のみ) =====
    -- 揺れは「振幅そのもの」ではなく一定ペース(swayGate)で動かすのが要点。
    -- React の振幅はガタつくので直接振り幅にするとガクガクするため、歌唱中は
    -- swayGate を 1 へなめらかに上げてフルスウェイし(=singAmplitude=1相当の安定ペース)、
    -- 歌い終わると 0 へ戻して止める。振り幅自体は音量で変えない(口だけが音量追従)。
    -- ここは口パク用のsingingではなく、歌唱モードON自体を表すswayingを使う
    -- (singingだと本物の無音区間で揺れが止まってしまうため。上のコメント参照)。
    local gateTarget = if swaying then 1.0 else 0.0
    self.swayGate += (gateTarget - self.swayGate) * math.min(SWAY_GATE_LERP * seconds, 1.0)
    self.singPhase += seconds * SING_SWAY_SPEED
    local k = math.sin(self.singPhase * math.tau) * self.swayGate  -- 左右の揺れ(-1〜1)×強さ
    -- 体→首→頭 と振り角を強めて背骨がしなるように回す(位置は不動)。
    -- 首は body の子なので body+neck が合算され、頭が一番大きく傾く。
    if self.vmBodyRot     then self.vmBodyRot.value     = k * SING_BODY_ROT  end
    if self.vmNeckRot     then self.vmNeckRot.value     = k * SING_NECK_ROT  end
    if self.vmBackHairRot then self.vmBackHairRot.value = k * SING_BHAIR_ROT end
    -- 頭(顔)は一番強く傾ける。ウインク中もスウェイし続けたまま、右への傾きを
    -- winkE(0→1→0)でなめらかに合成する。これで「ウインク中に頭が固定」「終了時に
    -- カクッと戻る」のを防ぎ、歌いながら自然にウインクできる。
    if self.vmFaceRot then
        self.vmFaceRot.value =
            k * SING_HEAD_ROT * (1.0 - WINK_SWAY_DUCK * winkE)
            + winkE * SING_HEAD_ROT * WINK_TILT_FRAC
    end

    return true
end

function update(self: CharacterAnimation) end

function pointerMove(self: CharacterAnimation, event: PointerEvent)
    self.mouseX = event.position.x
    self.mouseY = event.position.y
    event:hit()
end

function pointerDown(self: CharacterAnimation, event: PointerEvent)
    self.mouseX = event.position.x
    self.mouseY = event.position.y
    -- ダブルクリック判定(breathTime を時計として利用)
    local now = self.breathTime
    if now - self.lastClickAt <= DOUBLE_CLICK_TIME then
        -- ダブルクリック: 顔を右に傾けて右目をウインク。進行中のリップシンクは止める
        self.winking = true
        self.winkT = 0
        self.seqPos = 0
        -- 進行中のまばたきはキャンセルし、ウインク後まで次のまばたきを遅らせる
        self.blinking = false
        self.blinkTimer = nextBlinkInterval()
        self.lastClickAt = -100   -- 連続判定をリセット(3クリック目は新たな単発扱い)
    else
        -- シングルクリックでは何もしない(以前の「あいうえお」再生は廃止)。
        -- ダブルクリック判定のためにクリック時刻だけ記録する
        self.lastClickAt = now
    end
    event:hit()
end

return function(): Node<CharacterAnimation>
    return {
        init = init,
        advance = advance,
        update = update,
        pointerMove = pointerMove,
        pointerDown = pointerDown,
        vmIrisRX = nil, vmIrisRY = nil,
        vmIrisLX = nil, vmIrisLY = nil,
        vmEyelashRX = nil, vmEyelashRY = nil,
        vmEyelashLX = nil, vmEyelashLY = nil,
        vmEyewhiteRX = nil, vmEyewhiteRY = nil,
        vmEyewhiteLX = nil, vmEyewhiteLY = nil,
        vmEyebrowRX = nil, vmEyebrowRY = nil,
        vmEyebrowLX = nil, vmEyebrowLY = nil,
        vmFaceY = nil, vmNeckY = nil,
        vmTopwearY = nil, vmBackHairY = nil,
        vmBlinkOpen = nil, vmBlinkSmile = nil,
        vmEyeOpenR = nil, vmEyeSmileR = nil, vmFaceRot = nil,
        vmNeckRot = nil, vmBodyRot = nil, vmBackHairRot = nil,
        vmBaseRot = nil, vmBaseX = nil, vmBaseY = nil,
        vmFaceX = nil, vmNoseX = nil, vmNoseY = nil,
        vmMouthX = nil, vmMouthY = nil,
        vmBodyX = nil, vmNeckX = nil,
        vmHairX = nil, vmHairY = nil, vmBackHairX = nil,
        vmMouthA = nil, vmMouthI = nil, vmMouthU = nil,
        vmMouthE = nil, vmMouthO = nil, vmMouthClose = nil,
        vmSingAmp = nil,
        -- カーソル初期値は目の中心に置き、起動直後の正面向きを維持
        mouseX = EYE_WORLD_X, mouseY = EYE_WORLD_Y,
        breathTime = 0,
        eyeOffsetX = 0, eyeOffsetY = 0,
        turnX = 0, turnY = 0,
        blinking = false, blinkT = 0, blinkTimer = 0,
        smileHover = 0,
        winking = false, winkT = 0,
        lastClickAt = -100,
        mouthOp = {0, 0, 0, 0, 0, 1},
        vowelSeq = {},
        seqPos = 0, seqTimer = 0,
        singTimer = 0, singVowel = REST_VOWEL, singPhase = 0,
        singEnv = 0, singActive = false, swayGate = 0,
        singSmiling = false, singSmileHold = 0, singSmileTimer = 0, singSmileAmt = 0,
    }
end
