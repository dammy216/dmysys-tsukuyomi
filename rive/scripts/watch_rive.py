"""
watch_rive.py
rive/animations/ 配下の .lua ファイルを監視し、保存のたびに
MCP text_editor で Rive のスクリプトをリアルタイム更新する。

使い方:
  python rive/scripts/watch_rive.py

前提: Rive エディタが起動中で MCP サーバーが http://127.0.0.1:9791/mcp で動いていること。
"""

import os, time, json, urllib.request

MCP_URL  = "http://127.0.0.1:9791/mcp"
LUA_DIR  = os.path.join(os.path.dirname(__file__), "..", "animations")
POLL_SEC = 0.8   # 監視間隔(秒)

# ローカルファイルの相対パス(LUA_DIR 起点) → Rive の text_editor パス のマッピング。
# text_editor はフォルダパス非対応のため、リーフ名(ファイル名のみ)を使う。
# 例: manage_scripts 上では "webYachiyo/WebYachiyo" だが、
#     text_editor へは "WebYachiyo" を渡す。
SCRIPT_MAP = {
    "AIYachiyo/AIYachiyo.lua":   "AIYachiyo",
    "webKaguya/webKaguya.lua":   "webKaguya",
}


def mcp_call(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1,
                          "method": method, "params": params}).encode()
    req = urllib.request.Request(
        MCP_URL, data=payload,
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode("utf-8")
    for line in body.splitlines():
        if line.startswith("data:"):
            return json.loads(line[5:].strip())
    return json.loads(body)


class ScriptNotLoaded(Exception):
    """Rive エディタ上でスクリプトがまだ開かれていない場合に送出する。"""


def rive_get_content(script_name):
    """Rive 上のスクリプト全行を文字列で返す。
    スクリプトが未ロードの場合は ScriptNotLoaded を送出する。
    """
    r = mcp_call("tools/call", {
        "name": "text_editor",
        "arguments": {"command": "view", "path": script_name}
    })
    items = r.get("result", {}).get("content", [])
    raw = items[0].get("text", "") if items else ""
    if "does not exist" in raw or "not been loaded" in raw:
        raise ScriptNotLoaded(raw[:120])
    # "N: コード行\n" 形式から行内容だけ取り出す
    lines = []
    for line in raw.splitlines():
        idx = line.find(": ")
        if idx != -1 and line[:idx].isdigit():
            lines.append(line[idx + 2:])
        else:
            lines.append(line)
    return "\n".join(lines)


def rive_replace(script_name, old_content, new_content):
    """Rive スクリプトを old_content → new_content で置換する。"""
    r = mcp_call("tools/call", {
        "name": "text_editor",
        "arguments": {
            "command": "str_replace",
            "path": script_name,
            "old_string": old_content,
            "new_string": new_content,
        }
    })
    return r.get("result", {}).get("content", [{}])[0].get("text", "")


def sync(file_path, script_name):
    with open(file_path, encoding="utf-8") as f:
        new_content = f.read()
    old_content = rive_get_content(script_name)  # ScriptNotLoaded の場合は呼び出し元でキャッチ
    if old_content == new_content:
        return False
    result = rive_replace(script_name, old_content, new_content)
    print(f"  -> Rive 更新: {result[:80] if result else 'OK'}")
    return True


def main():
    print(f"[watch_rive] 監視開始: {LUA_DIR}")
    print(f"[watch_rive] Ctrl+C で終了\n")

    # 相対パス → 絶対パスに変換し、初回の mtime を記録する
    mtimes = {}
    for rel_path in SCRIPT_MAP:
        abs_path = os.path.join(LUA_DIR, rel_path.replace("/", os.sep))
        if os.path.exists(abs_path):
            mtimes[rel_path] = os.path.getmtime(abs_path)
            print(f"  監視: {rel_path} -> Rive:{SCRIPT_MAP[rel_path]}")
        else:
            print(f"  [WARN] ファイルが見つかりません: {abs_path}")

    print()
    try:
        while True:
            for rel_path, script_name in SCRIPT_MAP.items():
                abs_path = os.path.join(LUA_DIR, rel_path.replace("/", os.sep))
                if not os.path.exists(abs_path):
                    continue
                mtime = os.path.getmtime(abs_path)
                if mtime != mtimes.get(rel_path):
                    mtimes[rel_path] = mtime
                    ts = time.strftime("%H:%M:%S")
                    print(f"[{ts}] 変更検出: {rel_path}", end=" ", flush=True)
                    try:
                        synced = sync(abs_path, script_name)
                        if not synced:
                            print("(内容変化なし)")
                    except ScriptNotLoaded:
                        print(f"[SKIP] Rive エディタで '{script_name}' を開いてください")
                    except Exception as e:
                        print(f"[ERROR] {e}")
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\n[watch_rive] 終了")


if __name__ == "__main__":
    main()
