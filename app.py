# app.py
from flask import Flask, request, send_file, jsonify, make_response
import os, json

APP = Flask(__name__)

# --- immer neben app.py speichern ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "graph.json")

# --- lokale Origins erlauben (CORS) ---
ALLOWED_ORIGINS = {
    "http://localhost:7000",
    "http://127.0.0.1:7000",
    # Optional: weitere Ports, falls du mal wechselst
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}

def cors(resp):
    origin = request.headers.get("Origin", "")
    # im lokalen Dev großzügig sein:
    if origin in ALLOWED_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
    else:
        resp.headers["Access-Control-Allow-Origin"] = origin or "*"
    resp.headers["Vary"] = "Origin"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    return resp

@APP.route("/api/save", methods=["POST", "OPTIONS"])
def save():
    if request.method == "OPTIONS":
        return cors(make_response(("", 204)))

    data = request.get_json(force=True, silent=True)
    if not isinstance(data, list):
        return cors(make_response(("Bad data", 400)))

    # Debug für dich:
    print(f"[SAVE] writing to: {os.path.abspath(DATA_PATH)} (items={len(data)})")

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return cors(jsonify(ok=True))

@APP.route("/api/load", methods=["GET", "OPTIONS"])
def load():
    if request.method == "OPTIONS":
        return cors(make_response(("", 204)))
    if os.path.exists(DATA_PATH):
        return cors(send_file(DATA_PATH, mimetype="application/json"))
    return cors(make_response(("[]", 200, {"Content-Type": "application/json"})))

if __name__ == "__main__":
    APP.run(port=7001, debug=False)
