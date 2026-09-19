import os
import urllib.request
import json
import time
import base64
import hashlib
from pathlib import Path

# 注意：短语列表需与 src/data/phrases.ts 保持同步
phrases = [
    "我是红方老大",
    "我是蓝方老大",
    "我才是红方老大",
    "我才是蓝方老大",
    "我是浪人",
    "我才是浪人",
    "快点啊，鸡都要叫了",
    "不要走，决战到天亮",
    "你的忍术，是百变者教的吧",
    "我俩是一伙的，相信我",
    "我是浪人，别杀我",
    "隐士先别动，让我来",
    "我等的花都谢了",
    "你确定你抽到的是忍者牌，不是菜鸟牌？",
    "别拦我，我要去找师父重练了",
    "别吵了，专心忍术",
    "这一刀，我记下了",
    "密探看了我，我是清白的",
    "谁在骗我，我已经知道了",
    "上忍已出，各位小心",
    "这局我必活到最后",
    "没牌",
    "我的牌在后面呢",
]

env_file = Path(".env.local")
key = ""
if env_file.exists():
    for line in env_file.read_text(encoding="utf-8").splitlines():
        if "MIMO_API_KEY" in line and "=" in line:
            raw_k = line.split("=", 1)[1].strip()
            key = raw_k.replace("\"", "").replace("\x27", "").strip()

if not key:
    key = os.environ.get("MIMO_API_KEY", "")

if not key:
    raise SystemExit("Missing MIMO_API_KEY")

MIMO_API_KEY = key
out_dir = "public/assets/audio/phrases"
os.makedirs(out_dir, exist_ok=True)
url = "https://api.xiaomimimo.com/v1/chat/completions"
headers = {
    "Authorization": "Bearer " + MIMO_API_KEY,
    "Content-Type": "application/json",
}

results = []
for i, text in enumerate(phrases):
    path = os.path.join(out_dir, f"phrase_{i}.mp3")
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": "用生动的语气读出这句台词"},
            {"role": "assistant", "content": text},
        ],
        "audio": {"format": "mp3", "voice": "mimo_default"},
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    success = False
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                audio_b64 = data["choices"][0]["message"]["audio"]["data"]
                audio_bytes = base64.b64decode(audio_b64)
                with open(path, "wb") as f:
                    f.write(audio_bytes)
                md5 = hashlib.md5(audio_bytes).hexdigest()
                results.append((i, text, f"phrase_{i}.mp3", len(audio_bytes), md5))
                print(f"[{i+1}/{len(phrases)}] OK: {text} -> {path} ({len(audio_bytes)} B)")
                success = True
                break
        except Exception as e:
            print(f"[{i+1}/{len(phrases)}] attempt {attempt+1} ERR: {e}")
            time.sleep(2)
    if not success:
        print(f"[{i+1}/{len(phrases)}] FAILED: {text}")
    time.sleep(0.2)

doc_lines = [
    "# 快捷短语与 Mimo TTS 离线音频对应表",
    "",
    f"> 全量 {len(results)} 条短语，模型 mimo-v2.5-tts，存储于 `public/assets/audio/phrases/`。严格按 phraseId 对应。",
    "",
    "| phraseId | 短语内容 | 音频文件名 | 文件大小 (bytes) | MD5 校验和 |",
    "|---|---|---|---|---|",
]
for r in results:
    doc_lines.append(f"| {r[0]} | {r[1]} | `{r[2]}` | {r[3]} | `{r[4]}` |")

os.makedirs("docs", exist_ok=True)
with open("docs/08_PHRASES.md", "w", encoding="utf-8") as f:
    f.write("\n".join(doc_lines) + "\n")
print("docs/08_PHRASES.md 生成完毕。")
