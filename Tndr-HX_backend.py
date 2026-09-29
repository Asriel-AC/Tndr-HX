import os
import sys
import json
import time
import threading
import queue
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from datetime import datetime
from pathlib import Path
from collections import deque
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
import hashlib
import urllib.request
import webbrowser

APP_VERSION = "1.2.0"

# --- Setup AppData Directory ---
if sys.platform == 'win32':
    app_data_dir = os.environ.get('APPDATA')
else:
    app_data_dir = os.path.expanduser('~/.config')

if not app_data_dir:
    app_data_dir = str(Path.home())

BASE_DIR = Path(app_data_dir) / "Tndr-HX"
BASE_DIR.mkdir(parents=True, exist_ok=True)

DB_FILE = BASE_DIR / "tndr_hx_data.json"
CHATLOG_DIR = BASE_DIR / "chat_logs"

PORT = 54321
CHATLOG_FLUSH_INTERVAL = 10.0
CHATLOG_FLUSH_BATCH = 50

app = Flask(__name__)
CORS(app)

log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

client_connected = False
last_ping_time = time.time()
last_market_refresh = time.time()
afk_cooldowns = {}

chat_queue = queue.Queue()
browser_actions_queue = queue.Queue()

update_available = False
latest_github_version = ""

def check_github_update(manual=False, root=None):
    global update_available, latest_github_version
    try:
        req = urllib.request.Request("https://api.github.com/repos/Asriel-AC/Tndr-HX/releases/latest", headers={'User-Agent': 'Tndr-HX-App'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            latest = data.get("tag_name", "").lstrip("v")
            if latest:
                v_curr = [int(x) for x in APP_VERSION.split('.') if x.isdigit()]
                v_lat = [int(x) for x in latest.split('.') if x.isdigit()]
                
                # Zero padding for comparison
                length = max(len(v_curr), len(v_lat))
                v_curr.extend([0] * (length - len(v_curr)))
                v_lat.extend([0] * (length - len(v_lat)))
                
                if v_lat > v_curr:
                    update_available = True
                    latest_github_version = latest
                    if manual and root:
                        root.after(0, lambda: messagebox.showinfo("Update verfügbar", f"Eine neue Version (v{latest}) ist auf GitHub verfügbar!"))
                else:
                    if manual and root:
                        root.after(0, lambda: messagebox.showinfo("Alles aktuell", f"Tndr-HX ist auf dem neuesten Stand (v{APP_VERSION})."))
    except Exception as e:
        if manual and root:
            root.after(0, lambda: messagebox.showerror("Fehler", f"Konnte nicht nach Updates suchen:\n{e}"))

def load_db():
    default_db = {
        "localEmojis": [],
        "nextLocalId": 10000,
        "macros": [],
        "blockedUsers": [],
        "blockedWords": [],
        "alertWords": [],
        "afkMode": False,
        "afkMessage": "Ich bin gerade AFK und antworte später!",
        "afkName": "",
        "afkCooldown": 60,
        "chatLoggerEnabled": True,
        "emojiStealerEnabled": True,
        "autoMarketRefresh": False,
        "autoMarketInterval": 5
    }
    if DB_FILE.exists():
        try:
            data = json.loads(DB_FILE.read_text(encoding="utf-8"))
            default_db.update(data)
        except Exception as e:
            print(f"Error loading DB: {e}")
    return default_db

def save_db(db_dict):
    try:
        DB_FILE.write_text(json.dumps(db_dict, indent=4, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"Error saving DB: {e}")

db = load_db()

# --- Chat Logger State ---
class ChatLoggerState:
    def __init__(self):
        self.lock = threading.RLock()
        self.bot_name = ""
        
        self.current_room_id = 1
        self.current_room_name = None
        self.room_map = {}
        
        self.seen_ids = set()
        self.seen_order = deque()
        self.seen_limit = 3500
        
        self.chatlog_buffer = []
        self.chatlog_last_flush = time.time()
        
        CHATLOG_DIR.mkdir(parents=True, exist_ok=True)

    def mark_seen(self, mid: str) -> bool:
        if not mid:
            return False
        with self.lock:
            if mid in self.seen_ids:
                return False
            self.seen_ids.add(mid)
            self.seen_order.append(mid)
            while len(self.seen_order) > self.seen_limit:
                old = self.seen_order.popleft()
                self.seen_ids.discard(old)
            return True

    def log_chat_event(self, event: dict):
        ts_str = event.get('ts', datetime.now().isoformat())
        try:
            time_formatted = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).strftime("%H:%M:%S")
        except:
            time_formatted = datetime.now().strftime("%H:%M:%S")
            
        user = event.get('user', 'System')
        text = event.get('text', '')
        direction = event.get('dir', 'in')
        
        if direction == 'in':
            if event.get('is_bot'):
                direction = 'out'
        
        if direction != 'out_echo':
            gui_msg = {"time": time_formatted, "user": user, "text": text, "dir": direction}
            chat_queue.put(gui_msg)

        if not db.get("chatLoggerEnabled", True):
            return
        if not isinstance(event, dict):
            return
            
        with self.lock:
            self.chatlog_buffer.append(event)

    def flush_chatlog(self, force: bool = False):
        with self.lock:
            if not self.chatlog_buffer:
                return
            due_time = (time.time() - self.chatlog_last_flush) >= CHATLOG_FLUSH_INTERVAL
            due_count = len(self.chatlog_buffer) >= CHATLOG_FLUSH_BATCH
            
            if not force and not (due_time or due_count):
                return
                
            batch = self.chatlog_buffer[:]
            self.chatlog_buffer.clear()
            self.chatlog_last_flush = time.time()

        try:
            d = datetime.now().strftime("%Y-%m-%d")
            sub = CHATLOG_DIR / d
            sub.mkdir(parents=True, exist_ok=True)
            
            ts = datetime.now().strftime("%H-%M-%S")
            room = f"room_{self.current_room_id}"
            
            fname_json = f"{room}_{ts}.json"
            out_json = sub / fname_json
            out_json.write_text(json.dumps(batch, ensure_ascii=False, indent=2), encoding="utf-8")
            
            fname_jsonl = f"{room}_{ts}_raw.jsonl"
            out_jsonl = sub / fname_jsonl
            jsonl_lines = [json.dumps(ev, ensure_ascii=False) for ev in batch]
            out_jsonl.write_text("\n".join(jsonl_lines) + "\n", encoding="utf-8")
            
            fname_log = f"{room}_{ts}.log"
            out_log = sub / fname_log
            log_lines = []
            for ev in batch:
                log_lines.append(f"[{ev.get('ts')}] [{ev.get('dir', 'IN').upper()}] {ev.get('user')}: {ev.get('text')}")
            out_log.write_text("\n".join(log_lines), encoding="utf-8")
            
        except Exception as e:
            with self.lock:
                self.chatlog_buffer = batch + self.chatlog_buffer

    def update_room_name(self, rid, rname):
        if rid is not None and isinstance(rname, str) and rname.strip():
            with self.lock:
                self.room_map[int(rid)] = rname.strip()

    def get_room_name(self, rid):
        with self.lock:
            if rid == self.current_room_id and self.current_room_name:
                return self.current_room_name
            return self.room_map.get(int(rid)) if rid is not None else None

logger_state = ChatLoggerState()

def handle_ws_event(direction: str, event: str, data, my_id: str = ""):
    if not isinstance(data, dict) and not isinstance(data, list):
        return

    if direction == "in":
        if event == "existingUsers":
            if isinstance(data, dict):
                myself = data.get("myself")
                if isinstance(myself, dict):
                    uname = myself.get("username")
                    if uname and isinstance(uname, str):
                        logger_state.bot_name = uname.strip()

                rid = myself.get("currentRoomId")
                rname = myself.get("currentRoom")
                logger_state.update_room_name(rid, rname)
                if rid is not None:
                    logger_state.current_room_id = int(rid)
                    if rname:
                        logger_state.current_room_name = rname.strip()
                
                users = data.get("users") or []
                if isinstance(users, list):
                    for u in users:
                        if isinstance(u, dict):
                            logger_state.update_room_name(u.get("currentRoomId"), u.get("currentRoom"))

        elif event == "userListUpdate":
            if isinstance(data, list):
                for u in data:
                    if isinstance(u, dict):
                        logger_state.update_room_name(u.get("currentRoomId"), u.get("currentRoom"))

        elif event in ("userJoinedUserList", "userChangedRoom"):
            if isinstance(data, dict):
                rid = data.get("currentRoomId") or data.get("roomId")
                rname = data.get("currentRoom") or data.get("roomName")
                logger_state.update_room_name(rid, rname)

    elif direction == "out":
        if event == "joinRoom":
            if isinstance(data, dict):
                rid = data.get("room")
                rname = data.get("roomName")
                if rid is not None:
                    logger_state.current_room_id = int(rid)
                if rname:
                    logger_state.update_room_name(rid, rname)

    if direction == "in" and event in ("updateChatLines", "newMessage"):
        msgs = data if isinstance(data, list) else [data]
        for msg_data in msgs:
            if not isinstance(msg_data, dict): continue
            
            server_id = str(msg_data.get("id") or "").strip()
            rid = msg_data.get("room") or msg_data.get("roomId")
            user = (msg_data.get("user") or msg_data.get("nickname") or msg_data.get("senderName") or msg_data.get("userId") or "").strip()
            text = (msg_data.get("chatLine") or msg_data.get("message") or msg_data.get("speechBubbleText") or msg_data.get("content") or "").strip()
            
            is_server = bool(msg_data.get("isServerMessage", False))
            is_join = bool(msg_data.get("isJoin", False))
            is_leave = bool(msg_data.get("isLeave", False))

            if rid is not None:
                logger_state.current_room_id = int(rid)

            if server_id:
                mid = server_id
            else:
                raw = f"{rid}|{datetime.now().isoformat()}|{user}|{text}|{is_server}|{is_join}|{is_leave}"
                mid = "ws-" + hashlib.sha1(raw.encode("utf-8", "ignore")).hexdigest()[:16]

            if not logger_state.mark_seen(mid):
                continue

            is_bot_user = False
            sender_id = str(msg_data.get("userId") or msg_data.get("senderId") or msg_data.get("id") or "")
            if my_id and sender_id == my_id:
                is_bot_user = True

            room_name = logger_state.get_room_name(rid if rid is not None else logger_state.current_room_id)

            logger_state.log_chat_event({
                "ts": datetime.now().isoformat(),
                "dir": "in",
                "room_id": int(rid) if rid is not None else logger_state.current_room_id,
                "room_name": room_name,
                "message_id": mid,
                "user": user,
                "text": text,
                "is_system": bool(is_server or is_join or is_leave),
                "is_bot": bool(is_bot_user),
                "url": None,
                "ws": True,
                "replyTo": msg_data.get("replyTo"),
            })

    elif direction == "out" and event in ("sendChatLine", "newMessage"):
        msgs = data if isinstance(data, list) else [data]
        for msg_data in msgs:
            if not isinstance(msg_data, dict): continue
            
            text = (msg_data.get("message") or msg_data.get("chatLine") or "").strip()
            rid = msg_data.get("room") or logger_state.current_room_id
            
            reply_to_id = None
            if event == "newMessage":
                reply_obj = msg_data.get("replyTo")
                if isinstance(reply_obj, dict):
                    reply_to_id = reply_obj.get("id")

            room_name = logger_state.get_room_name(rid)

            logger_state.log_chat_event({
                "ts": datetime.now().isoformat(),
                "dir": "out_echo", 
                "room_id": int(rid),
                "room_name": room_name,
                "user": logger_state.bot_name or "Me",
                "text": text,
                "reply_to": reply_to_id,
                "source": "USERSCRIPT",
                "ws_sent": True,
                "ws_newMessage": (event == "newMessage"),
            })

@app.route('/api/ping', methods=['GET'])
def handle_ping():
    global last_ping_time, client_connected
    last_ping_time = time.time()
    if not client_connected:
        client_connected = True
        chat_queue.put({"time": datetime.now().strftime("%H:%M:%S"), "user": "SYSTEM", "text": "Verbindung zum Browser hergestellt.", "dir": "sys"})
    return jsonify({"status": "ok"})

@app.route('/api/state', methods=['GET'])
def get_state():
    state_data = dict(db)
    actions = []
    while not browser_actions_queue.empty():
        actions.append(browser_actions_queue.get())
    state_data["actions"] = actions
    return jsonify(state_data)

@app.route('/api/action', methods=['POST'])
def handle_action():
    global last_ping_time
    last_ping_time = time.time()
    data = request.json
    act = data.get('action')
    payload = data.get('payload')
    
    if act == "add_emoji":
        db["localEmojis"].append(payload)
        db["nextLocalId"] += 1
    elif act == "remove_emoji":
        db["localEmojis"] = [e for e in db["localEmojis"] if str(e["id"]) != str(payload)]
    elif act == "clear_emojis":
        db["localEmojis"] = []
    elif act == "save_macro":
        db["macros"].append(payload)
    elif act == "remove_macro":
        db["macros"] = [m for m in db["macros"] if str(m["id"]) != str(payload)]
    elif act == "update_setting":
        db[payload["key"]] = payload["value"]
        
    save_db(db)
    return jsonify({"status": "ok"})

@app.route('/api/ws', methods=['POST'])
def handle_ws():
    global last_ping_time
    last_ping_time = time.time()
    data = request.json
    direction = data.get('direction')
    event = data.get('event')
    ev_data = data.get('data')
    my_id = str(data.get('myId') or "")
    
    handle_ws_event(direction, event, ev_data, my_id)
    actions_for_browser = []
    
    if direction == 'in' and event in ['newMessage', 'updateChatLines']:
        msgs = ev_data if isinstance(ev_data, list) else [ev_data]
        for msg in msgs:
            if not isinstance(msg, dict): continue
            
            text = msg.get('message') or msg.get('text') or msg.get('content') or msg.get('speechBubbleText') or msg.get('chatLine') or ""
            sender_id = str(msg.get('userId') or msg.get('senderId') or msg.get('id') or "")
            
            if my_id and sender_id == my_id:
                continue 
                
            alert_words = db.get("alertWords", [])
            if alert_words and text:
                text_lower = text.lower()
                if any(w.lower() in text_lower for w in alert_words):
                    actions_for_browser.append({"type": "play_alert"})
                    
            if db.get("afkMode") and db.get("afkMessage"):
                is_mentioned = False
                if my_id and msg.get("mentions") and my_id in [str(m) for m in msg.get("mentions")]:
                    is_mentioned = True
                if my_id and msg.get("replyTo") and str(msg["replyTo"]) == my_id:
                    is_mentioned = True
                my_name = db.get("afkName", "").lower()
                if my_name and my_name in text.lower():
                    is_mentioned = True
                    
                if is_mentioned:
                    now = time.time()
                    cd = int(db.get("afkCooldown", 60))
                    last_replied = afk_cooldowns.get(sender_id, 0)
                    if (now - last_replied) > cd:
                        afk_cooldowns[sender_id] = now
                        actions_for_browser.append({
                            "type": "send_message",
                            "text": f"[AFK] {db['afkMessage']}"
                        })

    return jsonify({"actions": actions_for_browser})

def background_flusher():
    while True:
        time.sleep(2.0)
        try:
            logger_state.flush_chatlog(force=False)
        except Exception:
            pass

def market_monitor():
    global last_market_refresh
    while True:
        time.sleep(5)
        if db.get("autoMarketRefresh", False) and client_connected:
            val = db.get("autoMarketInterval", 5)
            try:
                interval_mins = int(val)
            except:
                interval_mins = 5
            
            if interval_mins < 5:
                interval_mins = 5
                
            if time.time() - last_market_refresh > (interval_mins * 60):
                last_market_refresh = time.time()
                browser_actions_queue.put({"type": "auto_extend_market"})

def connection_monitor():
    global client_connected
    while True:
        time.sleep(2)
        if client_connected and (time.time() - last_ping_time > 20):
            client_connected = False
            chat_queue.put({"time": datetime.now().strftime("%H:%M:%S"), "user": "SYSTEM", "text": "Verbindung zum Browser verloren.", "dir": "sys"})

def run_flask():
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

class ModernTndrHXGUI:
    def __init__(self, root):
        self.root = root
        self.root.title(f"Tndr-HX Control Center v{APP_VERSION}")
        self.root.geometry("950x650")
        self.root.configure(bg="#202225")
        
        style = ttk.Style()
        if "clam" in style.theme_names():
            style.theme_use("clam")
            
        style.configure("TFrame", background="#202225")
        style.configure("TLabel", background="#202225", foreground="#dcddde", font=("Segoe UI", 10))
        style.configure("Header.TLabel", font=("Segoe UI", 15, "bold"), foreground="#ffffff")
        style.configure("TCheckbutton", background="#202225", foreground="#dcddde", font=("Segoe UI", 10), focuscolor="#202225")
        style.map("TCheckbutton", background=[('active', '#2f3136')])
        style.configure("TButton", font=("Segoe UI", 10, "bold"), background="#5865f2", foreground="white", borderwidth=0, padding=4)
        style.map("TButton", background=[('active', '#4752c4')])
        style.configure("Danger.TButton", background="#ed4245")
        style.map("Danger.TButton", background=[('active', '#c9383b')])

        self.left_frame = ttk.Frame(root, width=320)
        self.left_frame.pack(side="left", fill="y", padx=20, pady=20)
        
        self.right_frame = ttk.Frame(root)
        self.right_frame.pack(side="right", fill="both", expand=True, padx=(0, 20), pady=20)

        # Update Banner
        self.update_banner = tk.Label(self.left_frame, text="🚀 Neues Update verfügbar! Hier klicken", bg="#3ba55c", fg="white", font=("Segoe UI", 10, "bold"), cursor="hand2")
        self.update_banner.bind("<Button-1>", lambda e: webbrowser.open("https://github.com/Asriel-AC/Tndr-HX/releases/latest"))

        ttk.Label(self.left_frame, text="⚙️ Einstellungen", style="Header.TLabel").pack(anchor="w", pady=(0, 15))
        
        update_btn_frame = ttk.Frame(self.left_frame)
        update_btn_frame.pack(fill="x", pady=(0, 15))
        ttk.Button(update_btn_frame, text="🔄 Nach Updates suchen", command=self.manual_update_check).pack(side="left")
        
        self.status_var = tk.StringVar(value="🔴 Offline (Warte auf Browser)")
        self.status_label = ttk.Label(self.left_frame, textvariable=self.status_var, foreground="#ed4245", font=("Segoe UI", 10, "bold"))
        self.status_label.pack(anchor="w", pady=(0, 5))

        self.warning_container = tk.Frame(self.left_frame, bg="#202225")
        self.warning_container.pack(anchor="w", fill="x", pady=(0, 15))
        
        self.warning_lbl1 = tk.Label(self.warning_container, text="⚠️ Frontend nicht verbunden!", bg="#ed4245", fg="white", font=("Segoe UI", 9, "bold"))
        self.warning_lbl2 = tk.Label(self.warning_container, text="Userscript hier downloaden", bg="#ed4245", fg="white", font=("Segoe UI", 9, "underline"), cursor="hand2")
        self.warning_lbl2.bind("<Button-1>", lambda e: webbrowser.open("https://github.com/Asriel-AC/Tndr-HX/blob/main/Tndr-HX_client.js"))

        self.logger_var = tk.BooleanVar(value=db.get("chatLoggerEnabled", True))
        self.afk_var = tk.BooleanVar(value=db.get("afkMode", False))

        self.create_toggle("📡 Chat Logger (AppData)", self.logger_var, "chatLoggerEnabled")
        
        ttk.Label(self.left_frame, text="🤖 AFK Bot", style="Header.TLabel").pack(anchor="w", pady=(15, 5))
        self.create_toggle("AFK-Modus Aktivieren", self.afk_var, "afkMode")

        # Auto-Market
        ttk.Label(self.left_frame, text="💰 Auto-Market", style="Header.TLabel").pack(anchor="w", pady=(15, 5))
        self.automarket_var = tk.BooleanVar(value=db.get("autoMarketRefresh", False))
        self.create_toggle("Auto-Refresh aktiv", self.automarket_var, "autoMarketRefresh")
        
        am_frame = tk.Frame(self.left_frame, bg="#202225")
        am_frame.pack(anchor="w", pady=2, padx=25)
        tk.Label(am_frame, text="Intervall (Min):", bg="#202225", fg="#b0b0b0", font=("Segoe UI", 9)).pack(side="left")
        self.am_interval_var = tk.StringVar(value=str(db.get("autoMarketInterval", 5)))
        
        def on_am_change(*args):
            val_str = self.am_interval_var.get()
            if val_str.isdigit():
                db["autoMarketInterval"] = int(val_str)
                save_db(db)
                
        self.am_interval_var.trace_add("write", on_am_change)
        am_entry = tk.Entry(am_frame, textvariable=self.am_interval_var, width=5, bg="#36393f", fg="white", insertbackground="white", borderwidth=1, relief="flat")
        am_entry.pack(side="left", padx=5)

        ttk.Label(self.left_frame, text="💾 Datenbank", style="Header.TLabel").pack(anchor="w", pady=(25, 10))
        backup_frame = ttk.Frame(self.left_frame)
        backup_frame.pack(fill="x")
        
        ttk.Button(backup_frame, text="📤 Export", command=self.export_backup).pack(side="left", fill="x", expand=True, padx=(0, 2))
        ttk.Button(backup_frame, text="📥 Import", command=self.import_backup).pack(side="right", fill="x", expand=True, padx=(2, 0))

        ttk.Label(self.right_frame, text="💬 Live Chat Monitor", style="Header.TLabel").pack(anchor="w", pady=(0, 10))
        self.chat_text = tk.Text(self.right_frame, bg="#36393f", fg="#dcddde", font=("Segoe UI", 10), wrap="word", borderwidth=0, highlightthickness=1, highlightbackground="#202225")
        self.chat_text.pack(side="left", fill="both", expand=True)
        
        scrollbar = ttk.Scrollbar(self.right_frame, command=self.chat_text.yview)
        scrollbar.pack(side="right", fill="y")
        self.chat_text.configure(yscrollcommand=scrollbar.set)
        
        self.chat_text.tag_config("time", foreground="#72767d")
        self.chat_text.tag_config("user_in", foreground="#5865f2", font=("Segoe UI", 10, "bold"))
        self.chat_text.tag_config("user_out", foreground="#3ba55c", font=("Segoe UI", 10, "bold"))
        self.chat_text.tag_config("sys", foreground="#faa61a", font=("Segoe UI", 10, "italic"))
        self.chat_text.tag_config("text", foreground="#dcddde")
        
        self.chat_text.config(state="normal")
        self.chat_text.insert("end", "[System] Tndr-HX Server gestartet.\n", "sys")
        self.chat_text.insert("end", f"[System] Verzeichnis: {BASE_DIR}\n", "sys")
        self.chat_text.config(state="disabled")

        self.update_gui_loop()

    def manual_update_check(self):
        threading.Thread(target=check_github_update, args=(True, self.root), daemon=True).start()

    def create_toggle(self, text, variable, db_key):
        def on_toggle():
            db[db_key] = variable.get()
            save_db(db)
        cb = ttk.Checkbutton(self.left_frame, text=text, variable=variable, command=on_toggle)
        cb.pack(anchor="w", pady=4)

    def export_backup(self):
        file_path = filedialog.asksaveasfilename(defaultextension=".json", initialfile=f"tndr_hx_backup_{datetime.now().strftime('%Y-%m-%d')}.json", title="Backup speichern", filetypes=[("JSON", "*.json")])
        if file_path:
            try:
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(db, f, indent=4, ensure_ascii=False)
                messagebox.showinfo("Erfolg", "Backup gesichert!")
            except Exception as e:
                messagebox.showerror("Fehler", str(e))

    def import_backup(self):
        file_path = filedialog.askopenfilename(title="Backup laden", filetypes=[("JSON", "*.json")])
        if file_path:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    imported = json.load(f)
                db.update(imported)
                save_db(db)
                self.logger_var.set(db.get("chatLoggerEnabled", True))
                self.afk_var.set(db.get("afkMode", False))
                self.automarket_var.set(db.get("autoMarketRefresh", False))
                self.am_interval_var.set(str(db.get("autoMarketInterval", 5)))
                messagebox.showinfo("Erfolg", "Backup geladen! Synchronisiert mit Browser im nächsten Zyklus.")
            except Exception as e:
                messagebox.showerror("Fehler", str(e))

    def update_gui_loop(self):
        if update_available and not getattr(self, 'update_shown', False):
            self.update_banner.config(text=f"🚀 Tndr-HX Update v{latest_github_version} verfügbar! Hier klicken")
            self.update_banner.pack(fill="x", pady=(0, 10), before=self.status_label)
            self.update_shown = True

        if client_connected:
            self.status_var.set("🟢 Verbunden mit Tandro")
            self.status_label.configure(foreground="#3ba55c")
            self.warning_lbl1.pack_forget()
            self.warning_lbl2.pack_forget()
            self.warning_container.configure(bg="#202225")
        else:
            self.status_var.set("🔴 Offline (Kein Tab offen)")
            self.status_label.configure(foreground="#ed4245")
            self.warning_container.configure(bg="#ed4245")
            self.warning_lbl1.pack(fill="x", pady=(4,0))
            self.warning_lbl2.pack(fill="x", pady=(0,4))
            
        if db.get("afkMode") != self.afk_var.get():
            self.afk_var.set(db.get("afkMode", False))

        if not chat_queue.empty():
            self.chat_text.config(state="normal")
            while not chat_queue.empty():
                msg = chat_queue.get()
                time_str = f"[{msg['time']}] "
                self.chat_text.insert("end", time_str, "time")
                if msg['dir'] == 'sys':
                    self.chat_text.insert("end", f"{msg['user']}: {msg['text']}\n", "sys")
                else:
                    user_tag = "user_out" if msg['dir'] == 'out' else "user_in"
                    self.chat_text.insert("end", f"{msg['user']}: ", user_tag)
                    self.chat_text.insert("end", f"{msg['text']}\n", "text")
            self.chat_text.see("end")
            self.chat_text.config(state="disabled")

        self.root.after(100, self.update_gui_loop)

def on_closing():
    logger_state.flush_chatlog(force=True)
    root.destroy()
    os._exit(0)

if __name__ == "__main__":
    threading.Thread(target=check_github_update, daemon=True).start()
    threading.Thread(target=connection_monitor, daemon=True).start()
    threading.Thread(target=run_flask, daemon=True).start()
    threading.Thread(target=background_flusher, daemon=True).start()
    threading.Thread(target=market_monitor, daemon=True).start()
    
    root = tk.Tk()
    gui = ModernTndrHXGUI(root)
    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()
