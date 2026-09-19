import os
from pathlib import Path
import urllib.request, json, time, base64

def _load_dotenv_local():
    env_file = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(
            key.strip(),
            value.strip().strip('"').strip("'")
        )

_load_dotenv_local()

MIMO_API_KEY = os.getenv("MIMO_API_KEY")
if not MIMO_API_KEY:
    raise SystemExit(
        "请设置 MIMO_API_KEY。本地可创建 .env.local 写入 MIMO_API_KEY=your_api_key"
    )

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
]

out_dir = "public/assets/audio/phrases"
os.makedirs(out_dir, exist_ok=True)

url = "https://api.xiaomimimo.com/v1/chat/completions"
headers = {
    "Authorization": f"Bearer {MIMO_API_KEY}",
    "Content-Type": "application/json"
}

for i, text in enumerate(phrases):
    path = os.path.join(out_dir, f"phrase_{i}.mp3")
    payload = {
        "model": "mimo-v2.5-tts",
        "messages": [
            {"role": "user", "content": "用生动的语气读出这句台词"},
            {"role": "assistant", "content": text}
        ],
        "audio": {
            "format": "mp3",
            "voice": "mimo_default"
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            audio_b64 = data["choices"][0]["message"]["audio"]["data"]
            audio_bytes = base64.b64decode(audio_b64)
            with open(path, "wb") as f:
                f.write(audio_bytes)
            print(f"[{i+1}/{len(phrases)}] OK: {text} -> {path}")
    except Exception as e:
        print(f"[{i+1}/{len(phrases)}] ERR: {text} -> {e}")
    time.sleep(1)
