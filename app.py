# app.py
from flask import Flask, request, send_file, jsonify, make_response
import os, json, subprocess, threading, time

# ---------- Basis-Pfade ----------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "graph.json")

# ---------- Flask ----------
APP = Flask(__name__)

# ---------- CORS (lokal großzügig) ----------
ALLOWED_ORIGINS = {
    "http://localhost:7000",
    "http://127.0.0.1:7000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}

def cors(resp):
    origin = request.headers.get("Origin", "")
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
    else:
        # Für lokalen Dev: alles erlauben (optional strenger machen)
        resp.headers["Access-Control-Allow-Origin"] = origin or "*"
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp

# ---------- Git Auto-Push ----------
PUSH_DEBOUNCE_SEC = 60
_push_timer = None

def _git_has_changes():
    out = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, cwd=BASE_DIR
    )
    return bool(out.stdout.strip())

def _git_commit_and_push():
    try:
        if not _git_has_changes():
            return
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        subprocess.run(["git", "add", "graph.json"], cwd=BASE_DIR, check=False)
        subprocess.run(["git", "commit", "-m", f"auto: update graph.json ({ts})"], cwd=BASE_DIR, check=False)
        subprocess.run(["git", "push"], cwd=BASE_DIR, check=False)
        print("[GIT] pushed.")
    except Exception as e:
        print("[GIT] push failed:", e)

def schedule_git_push():
    global _push_timer
    try:
        if _push_timer and _push_timer.is_alive():
            _push_timer.cancel()
    except Exception:
        pass
    _timer = threading.Timer(PUSH_DEBOUNCE_SEC, _git_commit_and_push)
    _timer.daemon = True
    _timer.start()
    # speichern Referenz
    globals()["_push_timer"] = _timer

# ---------- Routes ----------
@APP.route("/api/save", methods=["POST", "OPTIONS"])
def save():
    if request.method == "OPTIONS":
        return cors(make_response(("", 204)))

    data = request.get_json(force=True, silent=True)
    if not isinstance(data, list):
        return cors(make_response(("Bad data", 400)))

    abs_path = os.path.abspath(DATA_PATH)
    print(f"[SAVE] writing to: {abs_path} (items={len(data)})")

    # Schreiben (einfach, robust). Optional könnte man tmp+rename machen.
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Debounced Auto-Push
    schedule_git_push()

    return cors(jsonify(ok=True))

@APP.route("/api/load", methods=["GET", "OPTIONS"])
def load():
    if request.method == "OPTIONS":
        return cors(make_response(("", 204)))
    if os.path.exists(DATA_PATH):
        return cors(send_file(DATA_PATH, mimetype="application/json"))
    # leeres Array zurückgeben, wenn Datei noch nicht existiert
    return cors(make_response(("[]", 200, {"Content-Type": "application/json"})))

@APP.route("/api/push", methods=["POST", "OPTIONS"])
def push_now():
    if request.method == "OPTIONS":
        return cors(make_response(("", 204)))
    # Sofortigen Push im Hintergrund anstoßen (blockiert den Request nicht)
    threading.Thread(target=_git_commit_and_push, daemon=True).start()
    return cors(jsonify(ok=True))

@APP.route("/api/health", methods=["GET"])
def health():
    return jsonify(ok=True)

# ---------- Main ----------
if __name__ == "__main__":
    # Bind an 127.0.0.1 (nur lokal). Bei Bedarf host="0.0.0.0" für LAN-Zugriff.
    APP.run(host="127.0.0.1", port=7001, debug=False)
