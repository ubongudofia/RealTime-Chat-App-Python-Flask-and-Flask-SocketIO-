from flask import Flask, request, jsonify, render_template, make_response, redirect, Request, url_for, session, send_from_directory, Response, flash
from pymongo import DESCENDING, MongoClient
import certifi
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import pytz
from bson.objectid import ObjectId
from flask_pymongo import PyMongo
from werkzeug.utils import secure_filename
import os
import re
import traceback
import gridfs
from gridfs.errors import NoFile
from pymongo.errors import PyMongoError
from utils.functions import get_db_connection, get_chats, get_unread_count, get_user_chats, get_messages_for_group, get_messages_for_private_chat,get_private_chat_by_id, get_group_by_id, format_last_message, format_timestamp, allowed_file


# BLUEPRINT IMPORTS
from routes.auth_routes import user_auth_bp
from routes.forgot_password_routes import forgot_password_bp
from routes.logout_routes import logout_bp
from routes.profile_images_routes import profile_pictures_bp
from routes.search_user_routes import search_users_bp
from routes.private_chat_routes import private_chats_bp
from routes.get_messages_rooutes import get_messages_bp
from routes.profile_routes import profile_bp
from routes.get_last_messages_routes import get_last_messages_bp
from routes.admin_routes import admin_bp



# ======================= FLASK APP SETUP =============================================================
import config as app_config
from config import Config
from utils.functions import get_mongo_client

app = Flask(__name__)
app.config.from_object(Config)          # SECRET_KEY, session lifetime, cookie flags, MONGO_URI ... from env
app.secret_key = Config.SECRET_KEY
_cors_origins = app_config.CORS_ORIGINS
if _cors_origins == ["*"]:
    _socketio_origins = "*"
elif _cors_origins:
    _socketio_origins = _cors_origins
else:
    _socketio_origins = None  # same-origin only
socketio = SocketIO(app, cors_allowed_origins=_socketio_origins)
_cors_kwargs = {"supports_credentials": True}
if _cors_origins and _cors_origins != ["*"]:
    _cors_kwargs["origins"] = _cors_origins
elif not _cors_origins:
    _cors_kwargs["origins"] = []  # no cross-origin access in production unless configured
CORS(app, **_cors_kwargs)
app.permanent_session_lifetime = Config.PERMANENT_SESSION_LIFETIME

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 
# ======================= DATABASE CONNECTION ==========================================================
MONGO_URI = app_config.MONGO_URI

# Shared client (single connection pool reused by all blueprints)
mongo_client = get_mongo_client()

# Set up database and GridFS
db = mongo_client[app_config.MONGO_DB_NAME]
fs = gridfs.GridFS(db)  # GridFS instance

# Set up Flask-PyMongo
app.config["MONGO_URI"] = MONGO_URI
mongo = PyMongo(app)  


def ensure_db_indexes():
    """Create indexes that back the chat list, pagination and push queries (idempotent)."""
    index_specs = [
        (db.messages, [("group_id", 1), ("timestamp", -1), ("_id", -1)], {}),
        (db.messages, [("private_chat_id", 1), ("timestamp", -1), ("_id", -1)], {}),
        (db.private_chats, [("user1_id", 1)], {}),
        (db.private_chats, [("user2_id", 1)], {}),
        (db.groups, [("members", 1)], {}),
        (db.groups, [("members.user_id", 1)], {}),
        (db.push_subscriptions, [("endpoint", 1)], {"unique": True}),
        (db.push_subscriptions, [("user_id", 1)], {}),
    ]
    for collection, keys, opts in index_specs:
        try:
            collection.create_index(keys, **opts)
        except Exception as e:
            print(f"⚠️ Could not ensure index {collection.name}.{keys}: {e}")


ensure_db_indexes()

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================= DATABASE COLLECTIONS ===============================================
# Define collections
users = db["users"]
users_collection = db["users"]
groups_collection = db["groups"]
user_groups_collection = db["user_groups"]
private_chats_collection = db["private_chats"]
messages_collection = db["messages"]
questions_collection = db['security_questions']

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# =============================== APP BLUEPRINT ROUTES =======================================

# REGISTER USER AUTHENTICATION ROUTES
app.register_blueprint(user_auth_bp)


# REGISTER FORGOT PASSWORD ROUTES
app.register_blueprint(forgot_password_bp)


# REGISTER LOGOUT ROUTES
app.register_blueprint(logout_bp)


# REGISTER PROFILE PICTURE ROUTES
app.register_blueprint(profile_pictures_bp)


# REGISTER SEARCH USER ROUTES
app.register_blueprint(search_users_bp)


# PRIVATE CHAT ROUTES
app.register_blueprint(private_chats_bp)


# GET ALL MESSAGES ROUTES
app.register_blueprint(get_messages_bp)


# GET LAST MESSAGES ROUTES
app.register_blueprint(get_last_messages_bp)


# GET ALL MESSAGES ROUTES
app.register_blueprint(profile_bp)

# ADMIN PANEL ROUTES
app.register_blueprint(admin_bp)


# ============================== HOMEPAGE APP ROUTE ==========================================
# App HomePage Route
@app.route('/')
def index():
    uid = session.get("user_id")
    if uid and is_valid_objectid(str(uid)):
        db = get_db_connection()
        if db.users.find_one({"_id": ObjectId(str(uid))}, {"_id": 1}):
            from routes.admin_routes import is_admin_user
            if is_admin_user(uid):
                return redirect(url_for("admin.admin_dashboard"))
            return redirect(url_for("chats"))
        session.clear()
    return render_template("login.html")

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================== LOGIN APP ROUTE ===================================

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        from routes.auth_routes import submit_login
        return submit_login()

    uid = session.get("user_id")
    if uid and is_valid_objectid(str(uid)):
        db = get_db_connection()
        if db.users.find_one({"_id": ObjectId(str(uid))}, {"_id": 1}):
            from routes.admin_routes import is_admin_user
            if is_admin_user(uid):
                return redirect(url_for("admin.admin_dashboard"))
            return redirect(url_for("chats"))
        session.clear()

    return render_template("login.html")



@app.route('/service-worker.js')
def service_worker():
    response = make_response(send_from_directory('static', 'service-worker.js'))
    response.headers['Content-Type'] = 'application/javascript'
    response.headers['Service-Worker-Allowed'] = '/'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


@app.route('/manifest.json')
def web_manifest():
    response = make_response(send_from_directory('static', 'manifest.json'))
    response.headers['Content-Type'] = 'application/manifest+json'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response



@app.route("/check_session", methods=["GET"])
def check_session():
    uid = session.get("user_id")
    if not uid or not is_valid_objectid(str(uid)):
        return jsonify({"logged_in": False})
    db = get_db_connection()
    if not db.users.find_one({"_id": ObjectId(str(uid))}, {"_id": 1}):
        session.clear()
        return jsonify({"logged_in": False})
    return jsonify({"logged_in": True})

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ====================== ALLOWED FILES =======================================================

UPLOAD_FOLDER = os.path.join(os.getcwd(), "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)  # Ensure upload folder exists
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================= RENDER CHAT PAGE ==========================================
@app.route("/chat")
def chats():
    uid = session.get("user_id")
    if not uid or not is_valid_objectid(str(uid)):
        session.clear()
        return redirect(url_for("login"))

    db = get_db_connection()
    if not db.users.find_one({"_id": ObjectId(str(uid))}, {"_id": 1}):
        session.clear()
        return redirect(url_for("login"))

    from routes.admin_routes import is_admin_user
    is_admin = is_admin_user(uid)

    return render_template(
        "chat.html",
        firstname=session.get("firstname"),
        staffid=session.get("staffid"),
        user_id=session.get("user_id"),
        is_admin=is_admin
    )

# ================================= GET CHAT LIST (AJAX/Socket) ================================

def is_valid_objectid(id_str):
    try:
        ObjectId(id_str)
        return True
    except Exception:
        return False

def resolve_group_image_url(group):
    """Safely resolve a group's image field (GridFS ObjectId, static path, or empty) to a valid URL."""
    if not group:
        return "/static/images/dsa-logo.png"
    raw_img = group.get("image")
    if not raw_img:
        return "/static/images/dsa-logo.png"
    if isinstance(raw_img, ObjectId) or ObjectId.is_valid(str(raw_img)):
        return url_for("profile_images.get_group_image", group_id=str(group["_id"]))
    img_str = str(raw_img).strip()
    if img_str in ("/static/default_group.png", "/static/images/default-group.png", "default_group.png", ""):
        return "/static/images/dsa-logo.png"
    return img_str

def parse_timestamp(ts):
    """Safely convert timestamp to datetime. Fallback to UTC now if invalid."""
    if isinstance(ts, datetime):
        return ts
    try:
        return datetime.fromisoformat(str(ts))
    except Exception:
        return datetime.utcnow()

def get_last_message_info(chat, db):
    """
    Returns the last message info for a chat.
    """
    query = {}
    if chat["type"] == "group":
        query["group_id"] = ObjectId(chat["id"])
    else:
        query["private_chat_id"] = ObjectId(chat["id"])

    last_msg_cursor = db.messages.find(query).sort("timestamp", -1).limit(1)
    last_msg_list = list(last_msg_cursor)
    
    if not last_msg_list:
        return {
            "last_message": "",
            "message_type": "text",
            "file_name": None,
            "timestamp": datetime.utcnow()
        }

    msg = last_msg_list[0]
    msg_type = msg.get("message_type", "text")
    last_msg_text = msg.get("display_text") or msg.get("message") if msg_type == "system" else msg.get("message")
    return {
        "last_message": last_msg_text,
        "message_type": "text" if msg_type == "system" else msg_type,
        "file_name": msg.get("file_name"),
        "timestamp": msg.get("timestamp") or datetime.utcnow()
    }

@app.route("/get_chatlist", methods=["GET"])
def get_chatlist():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Not logged in"}), 401

    try:
        user_id = session["user_id"]
        db = get_db_connection()
        all_chats = get_user_chats(user_id)
        unread_count_data = get_unread_count(user_id)

        favourite_chat_ids = set()
        if is_valid_objectid(user_id):
            user_doc = db.users.find_one({"_id": ObjectId(user_id)}, {"favourite_chats": 1})
            if user_doc and isinstance(user_doc.get("favourite_chats"), list):
                favourite_chat_ids = {str(cid) for cid in user_doc["favourite_chats"] if cid}

        chat_list = []

        for chat in all_chats:
            chat_id = str(chat["id"])
            unread_count = (
                unread_count_data["group"].get(chat_id, 0)
                if chat["type"] == "group"
                else unread_count_data["private"].get(chat_id, 0)
            )

            # Resolve image and presence in memory from batch-fetched chat doc
            if chat["type"] == "group":
                image_url = resolve_group_image_url(chat.get("group_doc"))
                is_online = False
                last_seen = None
                other_user_id = None
            else:
                other_user_id = chat.get("other_user_id")
                other_user = chat.get("other_user_doc")
                if other_user and other_user.get("image"):
                    image_url = url_for("profile_images.get_profile_picture", user_id=str(other_user_id))
                else:
                    image_url = chat.get("image") or "/static/images/default-profile.png"

                is_online = is_user_currently_online(str(other_user_id)) if other_user_id else False
                if not is_online and other_user:
                    is_online = bool(other_user.get("is_online", False))
                last_seen = format_last_seen_iso(other_user.get("last_seen")) if other_user else None

            raw_ts = chat.get("raw_timestamp")
            safe_ts = parse_timestamp(raw_ts) if raw_ts else parse_timestamp(None)

            chat_list.append({
                "id": chat_id,
                "other_user_id": str(other_user_id) if other_user_id else None,
                "is_online": is_online if chat["type"] == "private" else False,
                "last_seen": last_seen if chat["type"] == "private" else None,
                "name": chat.get("name", "Unknown"),
                "type": chat.get("type", "private"),
                "last_message": chat.get("last_message_raw") or chat.get("last_message", ""),
                "message_type": chat.get("message_type", "text"),
                "file_name": chat.get("file_name"),
                "unread_count": unread_count,
                "is_favourite": chat_id in favourite_chat_ids,
                "timestamp": safe_ts.isoformat(),
                "image": image_url
            })

        # Sort chats by last message timestamp descending
        chat_list.sort(key=lambda x: parse_timestamp(x.get("timestamp")), reverse=True)

        return jsonify({"success": True, "chats": chat_list})

    except Exception as e:
        print("❌ Error in get_chatlist:", str(e))
        print(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/toggle_favourite_chat", methods=["POST"])
def toggle_favourite_chat():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Not logged in"}), 401

    try:
        data = request.get_json() or {}
        chat_id = str(data.get("chat_id") or "").strip()
        user_id = str(session.get("user_id") or data.get("user_id") or "").strip()

        if not chat_id or not is_valid_objectid(user_id):
            return jsonify({"success": False, "error": "Invalid chat or user ID"}), 400

        db = get_db_connection()
        user_obj_id = ObjectId(user_id)
        user_doc = db.users.find_one({"_id": user_obj_id}, {"favourite_chats": 1}) or {}
        current_favs = {str(cid) for cid in (user_doc.get("favourite_chats") or []) if cid}

        is_Currently_fav = chat_id in current_favs
        requested_state = data.get("is_favourite")
        new_fav_state = (not is_Currently_fav) if requested_state is None else bool(requested_state)

        if new_fav_state:
            db.users.update_one(
                {"_id": user_obj_id},
                {"$addToSet": {"favourite_chats": chat_id}}
            )
        else:
            db.users.update_one(
                {"_id": user_obj_id},
                {"$pull": {"favourite_chats": chat_id}}
            )

        return jsonify({
            "success": True,
            "chat_id": chat_id,
            "is_favourite": new_fav_state
        })
    except Exception as e:
        print("❌ Error in toggle_favourite_chat:", str(e))
        return jsonify({"success": False, "error": str(e)}), 500

# ================================================================================================================
#                                      WEB PUSH NOTIFICATIONS (VAPID)
# ================================================================================================================

def send_web_push_notification(user_id, title, body, url="/chat", extra_data=None):
    """
    Send a background Web Push notification to all subscriptions belonging to `user_id`.
    Invalid/expired endpoints (HTTP 404/410) are automatically pruned from db.push_subscriptions.
    """
    from config import VAPID_PRIVATE_KEY, VAPID_CLAIM_EMAIL, WEB_PUSH_ENABLED
    if not WEB_PUSH_ENABLED or not VAPID_PRIVATE_KEY:
        return False

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("⚠️ pywebpush is not installed; skipping push notification.")
        return False

    try:
        db = get_db_connection()
        user_obj_id = ObjectId(str(user_id)) if is_valid_objectid(str(user_id)) else user_id
        subs = list(db.push_subscriptions.find({"user_id": user_obj_id}))
        if not subs:
            return False

        payload_dict = {
            "title": title or "DSA Messenger",
            "body": body or "You have a new message",
            "url": url or "/chat",
            "timestamp": datetime.utcnow().isoformat()
        }
        if extra_data and isinstance(extra_data, dict):
            payload_dict.update(extra_data)

        payload_json = json.dumps(payload_dict)

        for s in subs:
            sub_info = s.get("subscription")
            if not sub_info or not isinstance(sub_info, dict) or not sub_info.get("endpoint"):
                continue

            try:
                webpush(
                    subscription_info=sub_info,
                    data=payload_json,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_CLAIM_EMAIL}
                )
            except WebPushException as ex:
                if ex.response is not None and ex.response.status_code in (404, 410):
                    # Subscription is expired or unregistered by client
                    db.push_subscriptions.delete_one({"_id": s["_id"]})
                else:
                    print(f"⚠️ Web push warning for subscription: {ex}")
            except Exception as e:
                print(f"⚠️ Web push dispatch error: {e}")

        return True
    except Exception as e:
        print(f"❌ Error in send_web_push_notification: {e}")
        return False


@app.route("/push/vapid_public_key", methods=["GET"])
@app.route("/push/vapid-public-key", methods=["GET"])
def get_vapid_public_key():
    from config import VAPID_PUBLIC_KEY, WEB_PUSH_ENABLED
    return jsonify({
        "success": True,
        "public_key": VAPID_PUBLIC_KEY,
        "enabled": bool(WEB_PUSH_ENABLED)
    })


@app.route("/push/subscribe", methods=["POST"])
def push_subscribe():
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Not logged in"}), 401

    data = request.get_json(silent=True) or {}
    subscription = data.get("subscription")
    if not subscription or not isinstance(subscription, dict) or not subscription.get("endpoint"):
        return jsonify({"success": False, "error": "Invalid subscription object"}), 400

    try:
        user_id = session["user_id"]
        user_obj_id = ObjectId(user_id) if is_valid_objectid(user_id) else user_id
        db = get_db_connection()
        db.push_subscriptions.update_one(
            {"endpoint": subscription["endpoint"]},
            {
                "$set": {
                    "user_id": user_obj_id,
                    "subscription": subscription,
                    "endpoint": subscription["endpoint"],
                    "user_agent": request.headers.get("User-Agent", ""),
                    "updated_at": datetime.utcnow()
                }
            },
            upsert=True
        )
        return jsonify({"success": True, "message": "Push subscription saved"})
    except Exception as e:
        print(f"❌ Error in push_subscribe: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/push/unsubscribe", methods=["POST"])
def push_unsubscribe():
    data = request.get_json(silent=True) or {}
    endpoint = data.get("endpoint")
    if not endpoint:
        return jsonify({"success": False, "error": "Missing endpoint"}), 400

    try:
        db = get_db_connection()
        db.push_subscriptions.delete_one({"endpoint": endpoint})
        return jsonify({"success": True, "message": "Push subscription removed"})
    except Exception as e:
        print(f"❌ Error in push_unsubscribe: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# =========================== GET SELECTED CHAT FROM THE CHAT LIST =====================================
@app.route('/chat/<chat_type>/<chat_id>')
def open_chat(chat_type, chat_id):
    """Render the chat page with messages and chat details."""
    user_id = session.get("user_id")
    if not user_id:
        return redirect(url_for("login"))  # Ensure user is logged in

    group = None
    private_chat = None
    messages = []

    if chat_type == "group":
        group = get_group_by_id(ObjectId(chat_id))  # Convert to ObjectId
        if not group:
            return "Group not found", 404
        messages = get_messages_for_group(ObjectId(chat_id))
    elif chat_type == "private":
        private_chat = get_private_chat_by_id(ObjectId(chat_id))
        if not private_chat:
            return "Private chat not found", 404
        messages = get_messages_for_private_chat(ObjectId(chat_id))

    else:
        return "Invalid chat type", 400

    return render_template(
        "chat.html",
        user_id=user_id,
        group=group,
        private_chat=private_chat,
        messages=messages,
        group_id=chat_id if chat_type == "group" else None,
        private_chat_id=chat_id if chat_type == "private" else None
    )

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

def extract_member_id_str(member):
    """Safely extract user_id string from either dict or ObjectId member entry."""
    if isinstance(member, dict):
        uid = member.get("user_id")
        if isinstance(uid, dict) and "$oid" in uid:
            return str(uid["$oid"])
        return str(uid) if uid else None
    return str(member) if member else None


def get_private_chat_block_state(chat_doc, current_user_id, db):
    """
    Returns (is_blocked_by_me, is_blocked_by_other, other_user_id_str) for a private chat document.
    Checks both chat_doc['blocked_by'] and user['blocked_users'].
    """
    if not chat_doc or not current_user_id:
        return False, False, None

    curr_uid_str = str(current_user_id)
    u1_str = str(chat_doc.get("user1_id", ""))
    u2_str = str(chat_doc.get("user2_id", ""))
    other_uid_str = u2_str if u1_str == curr_uid_str else u1_str

    blocked_by_strs = {str(uid) for uid in (chat_doc.get("blocked_by") or []) if uid}
    is_blocked_by_me = curr_uid_str in blocked_by_strs
    is_blocked_by_other = bool(other_uid_str and other_uid_str in blocked_by_strs)

    if is_valid_objectid(curr_uid_str) and is_valid_objectid(other_uid_str):
        curr_user_doc = db.users.find_one({"_id": ObjectId(curr_uid_str)}, {"blocked_users": 1})
        other_user_doc = db.users.find_one({"_id": ObjectId(other_uid_str)}, {"blocked_users": 1})
        curr_blocked = {str(uid) for uid in (curr_user_doc.get("blocked_users") or [])} if curr_user_doc else set()
        other_blocked = {str(uid) for uid in (other_user_doc.get("blocked_users") or [])} if other_user_doc else set()
        if other_uid_str in curr_blocked:
            is_blocked_by_me = True
        if curr_uid_str in other_blocked:
            is_blocked_by_other = True

    return is_blocked_by_me, is_blocked_by_other, other_uid_str


# ============================== SOCKET IO MESSAGE SEND ================================================
# This event is triggered when a user sends a message.

@socketio.on("send_message")
def handle_send_message(data):
    db = get_db_connection()

    user_id = data.get("user_id") or session.get("user_id")
    group_id = data.get("group_id")
    private_chat_id = data.get("private_chat_id")
    message = data.get("message")
    message_type = data.get("message_type", "text")
    reply_to_message_id = data.get("reply_to_message_id")
    file_id = data.get("file_id")  # GridFS id (string)
    file_name = data.get("file_name")  # filename from upload (string)
    temp_id = data.get("temp_id")

    if not user_id or not is_valid_objectid(str(user_id)):
        return {"success": False, "error": "Invalid or missing user_id"}

    if not group_id and not private_chat_id:
        print("❌ ERROR: Message must belong to either a group or private chat")
        return {"success": False, "error": "Message must belong to either a group or private chat"}

    try:
        user = db.users.find_one({"_id": ObjectId(user_id)}, {"firstname": 1, "lastname": 1})
        sender_name = f"{user.get('firstname', '')} {user.get('lastname', '')}".strip() if user else "Unknown"

        # If private_chat_id is accidentally a user_id, resolve or create the actual private_chat document
        if private_chat_id and is_valid_objectid(str(private_chat_id)):
            chat_doc = db.private_chats.find_one({"_id": ObjectId(private_chat_id)})
            if not chat_doc:
                # Check if private_chat_id was actually the other user's ID
                other_user_exists = db.users.find_one({"_id": ObjectId(private_chat_id)}, {"_id": 1})
                if other_user_exists:
                    existing_chat = db.private_chats.find_one({
                        "$or": [
                            {"user1_id": ObjectId(user_id), "user2_id": ObjectId(private_chat_id)},
                            {"user1_id": ObjectId(private_chat_id), "user2_id": ObjectId(user_id)}
                        ]
                    })
                    if existing_chat:
                        private_chat_id = str(existing_chat["_id"])
                        chat_doc = existing_chat
                    else:
                        new_chat = db.private_chats.insert_one({
                            "user1_id": ObjectId(user_id),
                            "user2_id": ObjectId(private_chat_id),
                            "messages": []
                        })
                        private_chat_id = str(new_chat.inserted_id)
                        chat_doc = db.private_chats.find_one({"_id": new_chat.inserted_id})

            if chat_doc:
                is_blocked_by_me, is_blocked_by_other, _ = get_private_chat_block_state(chat_doc, user_id, db)
                if is_blocked_by_me:
                    return {
                        "success": False,
                        "error": "You blocked this contact. Unblock them to send a message.",
                        "blocked": True,
                        "blocked_by_me": True
                    }
                if is_blocked_by_other:
                    return {
                        "success": False,
                        "error": "You cannot send messages to this contact.",
                        "blocked": True,
                        "blocked_by_other": True
                    }

        delivered_to = []
        if group_id and is_valid_objectid(str(group_id)):
            group = db.groups.find_one({"_id": ObjectId(group_id)})
            if group:
                for member in group.get("members", []):
                    mid_str = extract_member_id_str(member)
                    if mid_str and mid_str != str(user_id) and is_valid_objectid(mid_str):
                        delivered_to.append(ObjectId(mid_str))

        # store message text only for text messages, otherwise None
        stored_message = message if message_type == "text" else None

        message_doc = {
            "user_id": ObjectId(user_id),
            "group_id": ObjectId(group_id) if group_id else None,
            "private_chat_id": ObjectId(private_chat_id) if private_chat_id else None,
            "message": stored_message,
            "message_type": message_type,
            # store file reference and original filename
            "file_id": ObjectId(file_id) if (file_id and is_valid_objectid(str(file_id))) else None,
            "file_name": file_name if file_name else None,
            "timestamp": datetime.utcnow(),
            "read_by": [],
            "delivered_to": delivered_to,
            "status": "sent",
            "reply_to_message_id": ObjectId(reply_to_message_id) if (reply_to_message_id and is_valid_objectid(str(reply_to_message_id))) else None
        }

        message_id = db.messages.insert_one(message_doc).inserted_id

        message_data = {
            "id": str(message_id),
            "temp_id": temp_id,
            "user_id": str(message_doc["user_id"]),
            "group_id": str(message_doc["group_id"]) if message_doc.get("group_id") else None,
            "private_chat_id": str(message_doc["private_chat_id"]) if message_doc.get("private_chat_id") else None,
            "message": message_doc.get("message"),
            "message_type": message_doc.get("message_type"),
            "file_id": str(message_doc["file_id"]) if message_doc.get("file_id") else None,
            "file_name": message_doc.get("file_name"),
            "timestamp": message_doc["timestamp"].isoformat(),
            "status": "sent",
            "read_by": [],
            "delivered_to": [str(uid) for uid in delivered_to],
            "sender": sender_name,
            "reply_to_message_id": str(reply_to_message_id) if reply_to_message_id else None
        }

        # Attach quoted reply message details if applicable (include file info)
        if reply_to_message_id and is_valid_objectid(str(reply_to_message_id)):
            try:
                original_msg = db.messages.find_one({"_id": ObjectId(reply_to_message_id)}, {
                    "message": 1,
                    "message_type": 1,
                    "user_id": 1,
                    "file_id": 1,
                    "file_name": 1,
                    "deleted_for_all": 1
                })

                if original_msg:
                    replied_user = db.users.find_one({"_id": original_msg["user_id"]}, {"firstname": 1, "lastname": 1})
                    original_sender = f'{replied_user.get("firstname", "")} {replied_user.get("lastname", "")}'.strip() if replied_user else "Unknown"

                    message_data["reply_to"] = {
                        "message": "[Original message deleted]" if original_msg.get("deleted_for_all") else original_msg.get("message", ""),
                        "message_type": original_msg.get("message_type", "text"),
                        "file_id": str(original_msg.get("file_id")) if original_msg.get("file_id") else None,
                        "file_name": original_msg.get("file_name") if original_msg.get("file_name") else None,
                        "sender": original_sender,
                        "message_id": str(original_msg["_id"]),
                        "is_deleted": original_msg.get("deleted_for_all", False)
                    }

            except Exception as e:
                print(f"⚠️ Failed to fetch original reply message: {e}")

        room = str(group_id) if group_id else str(private_chat_id)
        chat_type = "group" if group_id else "private"

        # Ensure sender is in the room and emit to the chat room
        join_room(room)
        socketio.emit("receive_message", message_data, room=room)

        # Also emit to participants' personal user_<id> rooms so users who haven't opened this chat yet still receive it
        participants = get_chat_participants(room, chat_type)
        for participant_id in participants:
            if str(participant_id) != str(user_id):
                socketio.emit("receive_message", message_data, room=f"user_{participant_id}")

        # Send Web Push notification to background / offline recipients
        if message_type == "text":
            raw_msg = message_doc.get("message") or ""
            preview_body = (raw_msg[:80] + "...") if len(raw_msg) > 80 else raw_msg
        elif message_type == "image":
            preview_body = "📷 Photo"
        elif message_type == "video":
            preview_body = "🎥 Video"
        elif message_type in ("audio", "voice"):
            preview_body = "🎤 Voice message"
        elif file_name:
            preview_body = f"📎 {file_name}"
        else:
            preview_body = "Sent an attachment"

        push_title = sender_name
        if group_id:
            group_doc = db.groups.find_one({"_id": ObjectId(group_id)}, {"name": 1})
            if group_doc and group_doc.get("name"):
                push_title = f"{sender_name} ({group_doc['name']})"

        chat_url = f"/chat/{chat_type}/{room}"

        for participant_id in participants:
            p_id_str = str(participant_id)
            if p_id_str != str(user_id):
                socketio.start_background_task(
                    send_web_push_notification,
                    p_id_str,
                    push_title,
                    preview_body,
                    chat_url,
                    {"chat_id": room, "chat_type": chat_type}
                )

        return {"success": True, "message_id": str(message_id), "message": message_data}

    except Exception as e:
        print(f"❌ Error sending message: {e}")
        print(traceback.format_exc())
        return {"success": False, "error": str(e)}


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ================ JOINING ROOMS FOR GROUP AND PRIVATE CHATS ===========================================
# This allows users to join specific rooms for group and private chats

@socketio.on("join_group")
def handle_join_group(data):
    group_id = data.get("group_id")
    if group_id:
        join_room(str(group_id))
        print(f"User joined group: {group_id}")

@socketio.on("leave_group")
def handle_leave_group(data):
    group_id = data.get("group_id")
    if group_id:
        leave_room(str(group_id))
        print(f"User left group: {group_id}")

@socketio.on("join_private_chat")
def handle_join_private_chat(data):
    chat_id = data.get("chat_id")
    if chat_id:
        join_room(str(chat_id))
        print(f"User joined private chat: {chat_id}")

@socketio.on("leave_private_chat")
def handle_leave_private_chat(data):
    chat_id = data.get("chat_id")
    if chat_id:
        leave_room(str(chat_id))
        print(f"User left private chat: {chat_id}")

ONLINE_USER_SIDS = {}
SID_TO_USER = {}


def is_user_currently_online(uid, db_conn=None):
    uid_str = str(uid or "")
    if not uid_str:
        return False
    if uid_str in ONLINE_USER_SIDS and len(ONLINE_USER_SIDS[uid_str]) > 0:
        return True
    return False


def format_last_seen_iso(dt_val):
    if not dt_val:
        return None
    if isinstance(dt_val, datetime):
        return dt_val.isoformat() + ("Z" if dt_val.tzinfo is None else "")
    return str(dt_val)


@socketio.on("join_user_room")
def handle_join_user_room(data):
    user_id = str((data or {}).get("user_id") or session.get("user_id") or "")
    if user_id and is_valid_objectid(user_id):
        join_room(f"user_{user_id}")
        sid = request.sid
        SID_TO_USER[sid] = user_id
        ONLINE_USER_SIDS.setdefault(user_id, set()).add(sid)
        now = datetime.utcnow()
        try:
            db.users.update_one(
                {"_id": ObjectId(user_id)},
                {"$set": {"is_online": True, "last_seen": now}}
            )
        except Exception as e:
            print(f"⚠️ Failed updating online status on join: {e}")
        socketio.emit("user_presence_update", {
            "user_id": user_id,
            "is_online": True,
            "last_seen": format_last_seen_iso(now)
        })
        print(f"User joined personal room: user_{user_id}")


@socketio.on("disconnect")
def handle_socket_disconnect():
    sid = request.sid
    user_id = SID_TO_USER.pop(sid, None) or str(session.get("user_id") or "")
    if not user_id or not is_valid_objectid(user_id):
        return
    sids = ONLINE_USER_SIDS.get(user_id)
    if sids:
        sids.discard(sid)
        if len(sids) == 0:
            ONLINE_USER_SIDS.pop(user_id, None)
    now = datetime.utcnow()
    still_online = is_user_currently_online(user_id)
    try:
        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"is_online": still_online, "last_seen": now}}
        )
    except Exception as e:
        print(f"⚠️ Failed updating online status on disconnect: {e}")
    if not still_online:
        socketio.emit("user_presence_update", {
            "user_id": user_id,
            "is_online": False,
            "last_seen": format_last_seen_iso(now)
        })


@socketio.on("typing")
def handle_user_typing(data):
    if not data:
        return
    chat_id = str(data.get("chat_id") or "")
    chat_type = str(data.get("chat_type") or "private")
    user_id = str(data.get("user_id") or session.get("user_id") or "")
    if not chat_id or not user_id or not is_valid_objectid(user_id):
        return
    sender = db.users.find_one({"_id": ObjectId(user_id)}, {"firstname": 1, "lastname": 1})
    sender_name = f"{sender.get('firstname', '')} {sender.get('lastname', '')}".strip() if sender else "Someone"
    payload = {
        "chat_id": chat_id,
        "chat_type": chat_type,
        "user_id": user_id,
        "user_name": sender_name
    }
    socketio.emit("user_typing", payload, room=chat_id, include_self=False)
    for pid in get_chat_participants(chat_id, chat_type):
        if str(pid) != user_id:
            socketio.emit("user_typing", payload, room=f"user_{pid}")


@socketio.on("stop_typing")
def handle_user_stop_typing(data):
    if not data:
        return
    chat_id = str(data.get("chat_id") or "")
    chat_type = str(data.get("chat_type") or "private")
    user_id = str(data.get("user_id") or session.get("user_id") or "")
    if not chat_id or not user_id:
        return
    payload = {
        "chat_id": chat_id,
        "chat_type": chat_type,
        "user_id": user_id
    }
    socketio.emit("user_stop_typing", payload, room=chat_id, include_self=False)
    for pid in get_chat_participants(chat_id, chat_type):
        if str(pid) != user_id:
            socketio.emit("user_stop_typing", payload, room=f"user_{pid}")

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ================================UNREAD MESSAGE COUNT==================================================

@socketio.on("mark_messages_as_read")
def mark_messages_as_read(data):
    db = get_db_connection()
    chat_id = data.get("chat_id")
    chat_type = data.get("chat_type")
    user_id = data.get("user_id") or session.get("user_id")

    if not all([chat_id, chat_type, user_id]):
        return

    if not is_valid_objectid(str(chat_id)) or not is_valid_objectid(str(user_id)):
        return

    try:
        # Build the appropriate query based on chat type
        filter_query = {
            "user_id": {"$ne": ObjectId(user_id)},
            "read_by": {"$ne": ObjectId(user_id)}
        }

        if chat_type == "group":
            filter_query["group_id"] = ObjectId(chat_id)
        else:
            filter_query["private_chat_id"] = ObjectId(chat_id)

        # Find messages that will be marked as read so we can update their ticks for senders
        unread_msgs = list(db.messages.find(filter_query, {"_id": 1, "user_id": 1}))

        # Update all matching messages at once
        result = db.messages.update_many(
            filter_query,
            {
                "$addToSet": {"read_by": ObjectId(user_id)},
                "$set": {"status": "read"}
            }
        )

        # Notify all participants in the chat
        read_payload = {
            "chat_id": str(chat_id),
            "chat_type": chat_type,
            "read_by": str(user_id),
            "updated_count": result.modified_count,
            "count": result.modified_count,
            "timestamp": datetime.utcnow().isoformat()
        }

        participants = get_chat_participants(chat_id, chat_type)
        for participant in participants:
            socketio.emit("messages_marked_as_read", read_payload, room=f"user_{participant}")
        socketio.emit("messages_marked_as_read", read_payload, room=str(chat_id))

        # Emit status updates for individual messages so sender sees blue read ticks immediately
        for msg in unread_msgs:
            sender_id = str(msg.get("user_id"))
            status_payload = {
                "message_id": str(msg["_id"]),
                "chat_id": str(chat_id),
                "status": "read",
                "recipient_id": str(user_id),
                "timestamp": datetime.utcnow().isoformat()
            }
            if sender_id:
                socketio.emit("message_status_update", status_payload, room=f"user_{sender_id}")
            socketio.emit("message_status_update", status_payload, room=str(chat_id))

    except Exception as e:
        print(f"❌ Error marking messages as read: {e}")
        socketio.emit("error", {"code": "READ_UPDATE_FAILED"}, room=request.sid)


def get_chat_participants(chat_id, chat_type):
    db = get_db_connection()
    if not is_valid_objectid(str(chat_id)):
        return []
    if chat_type == "group":
        group = db.groups.find_one({"_id": ObjectId(chat_id)})
        if not group:
            return []
        result = []
        for member in group.get("members", []):
            mid = extract_member_id_str(member)
            if mid:
                result.append(mid)
        return result
    else:
        private_chat = db.private_chats.find_one({"_id": ObjectId(chat_id)})
        if not private_chat:
            return []
        return [str(private_chat["user1_id"]), str(private_chat["user2_id"])]


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================== SOCKET IO MESSAGE DELIVERED ===========================================
# This event is triggered when a message is delivered to the recipient.

@socketio.on("confirm_delivery")
@socketio.on("message_delivered")
def handle_message_delivered(data):
    db = get_db_connection()
    message_id = data.get("message_id")
    recipient_id = data.get("user_id") or session.get("user_id")

    if not message_id or not recipient_id:
        return
    if not is_valid_objectid(str(message_id)) or not is_valid_objectid(str(recipient_id)):
        return

    try:
        # Atomic operation to update delivered_to
        result = db.messages.update_one(
            {
                "_id": ObjectId(message_id),
                "delivered_to": {"$ne": ObjectId(recipient_id)}
            },
            {
                "$addToSet": {"delivered_to": ObjectId(recipient_id)}
            }
        )

        # Only set status to delivered if the message has NOT already been marked as read!
        db.messages.update_one(
            {
                "_id": ObjectId(message_id),
                "status": {"$ne": "read"}
            },
            {
                "$set": {"status": "delivered"}
            }
        )

        if result.modified_count > 0:
            message = db.messages.find_one({"_id": ObjectId(message_id)})
            if message and message.get("status") != "read":
                sender_id = str(message["user_id"])
                chat_id = str(message.get("group_id") or message.get("private_chat_id") or "")

                delivery_payload = {
                    "message_id": str(message_id),
                    "chat_id": str(chat_id),
                    "status": "delivered",
                    "recipient_id": str(recipient_id),
                    "timestamp": datetime.utcnow().isoformat()
                }
                socketio.emit("message_status_update", delivery_payload, room=f"user_{sender_id}")
                socketio.emit("message_status_update", delivery_payload, room=str(chat_id))

    except Exception as e:
        print(f"❌ Delivery update failed: {e}")
        socketio.emit("error", {"code": "DELIVERY_UPDATE_FAILED"}, room=request.sid)
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx



# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ DELETE CHAT FROM CHATLIST STARTS HERE ==============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route("/delete_chat/<chat_id>", methods=["POST"])
def delete_chat(chat_id):
    if "user_id" not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    user_id = session["user_id"]
    db = get_db_connection()

    chat = db.private_chats.find_one({"_id": ObjectId(chat_id)})
    if chat:
        # If it's a private chat, mark it as deleted
        db.private_chats.update_one({"_id": ObjectId(chat_id)}, {"$set": {"deleted": True}})
        return jsonify({"success": True, "message": "Private chat deleted."})

    group = db.groups.find_one({"_id": ObjectId(chat_id)})
    if group:
        user_obj_id = ObjectId(user_id)
        # If it's a group chat, remove the user from both users.groups and groups.members/admins
        db.users.update_one(
            {"_id": user_obj_id},
            {"$pull": {"groups": ObjectId(chat_id)}}
        )
        db.groups.update_one(
            {"_id": ObjectId(chat_id)},
            {
                "$pull": {
                    "members": {"$or": [{"user_id": user_obj_id}, {"user_id": str(user_id)}]},
                    "admins": user_obj_id
                }
            }
        )
        db.groups.update_one(
            {"_id": ObjectId(chat_id)},
            {"$pull": {"members": user_obj_id}}
        )
        return jsonify({"success": True, "message": "Removed from group chat."})

    return jsonify({"success": False, "error": "Chat not found"}), 404

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ DELETE CHAT FROM CHATLIST STARTS HERE ==============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ SOCKET STAR MESSAGE STARTS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@socketio.on("star_message")
def handle_star_message(data):
    try:
        db = get_db_connection()
        user_id = data["user_id"]
        message_id = data["message_id"]
        starred = data.get("starred", True)

        # Update the message in database
        update_op = {
            "$addToSet" if starred else "$pull": {
                "starred_by": ObjectId(user_id)
            },
            "$set": {
                "starred": starred,
                "starred_at": datetime.utcnow() if starred else None
            }
        }

        result = db.messages.update_one(
            {"_id": ObjectId(message_id)},
            update_op
        )

        if result.modified_count == 0:
            return

        # Get the updated message with full details
        message = db.messages.find_one({"_id": ObjectId(message_id)})
        if not message:
            return

        # Prepare the room ID (group or private chat)
        room = str(message.get("group_id") or message.get("private_chat_id"))

        # Emit to all clients in the chat room
        emit("message_starred", {
            "message_id": message_id,
            "user_id": user_id,
            "starred": starred,
            "group_id": str(message["group_id"]) if message.get("group_id") else None,
            "private_chat_id": str(message["private_chat_id"]) if message.get("private_chat_id") else None
        }, room=room)

    except Exception as e:
        print(f"Error handling star message: {str(e)}")

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ SOCKET STAR MESSAGE ENDS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ STAR MESSAGE STARTS HERE ===========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/star', methods=['POST'])
def star_message():
    try:
        data = request.get_json()
        message_id = data['message_id']
        starred = data['starred']
        user_id = session.get('user_id')
        
        # Update in MongoDB
        update_op = {
            '$addToSet' if starred else '$pull': {
                'starred_by': ObjectId(user_id)
            },
            '$set': {
                'starred': starred,
                'starred_at': datetime.utcnow() if starred else None
            }
        }
        
        result = db.messages.update_one(
            {'_id': ObjectId(message_id)},
            update_op
        )
        
        if result.modified_count == 0:
            return jsonify({'status': 'error', 'message': 'Message not found'}), 404
            
        return jsonify({'status': 'success', 'starred': starred})
        
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500
    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================= STAR MESSAGE ENDS HERE ============================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET STARRED MESSAGE STARTS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/starred', methods=['GET'])
def get_starred_messages():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'status': 'error', 'message': 'Unauthorized'}), 401
    
    # Get messages starred by current user
    starred_messages = list(db.messages.aggregate([
        {
            '$match': {
                'starred_by': ObjectId(user_id)
            }
        },
        {
            '$lookup': {
                'from': 'users',
                'localField': 'user_id',
                'foreignField': '_id',
                'as': 'sender'
            }
        },
        {
            '$unwind': '$sender'
        },
        {
            '$sort': {'starred_at': -1}
        },
        {
            '$project': {
                '_id': 1,
                'message': 1,
                'message_type': 1,
                'timestamp': 1,
                'group_id': 1,
                'private_chat_id': 1,
                'file_id': 1,  # Add this
                'file_name': 1,  # Add this
                'sender_name': {
                    '$concat': ['$sender.firstname', ' ', '$sender.lastname']
                },
                'is_own_message': {
                    '$eq': ['$user_id', ObjectId(user_id)]
                }
            }
        }
    ]))
    
    # Convert ObjectId and datetime to strings
    for msg in starred_messages:
        msg['_id'] = str(msg['_id'])
        msg['timestamp'] = msg['timestamp'].isoformat()

        # If this message has a file_id, treat it as a file-based message
        if msg.get('file_id'):
            msg['file_id'] = str(msg['file_id'])
            msg['file_url'] = f"/file/{msg['file_id']}"
            msg['message_type'] = msg.get('message_type', 'file')  # use stored type
            msg['file_name'] = msg.get('file_name', 'Unknown file')
        else:
            # msg['file_url'] = msg.get('message')  # fallback (e.g., text messages)
            # msg['message_type'] = detect_message_type(msg.get('message'))
            msg['file_url'] = None
            msg['message_type'] = 'text'


        if msg.get('group_id'):
            msg['group_id'] = str(msg['group_id'])
        if msg.get('private_chat_id'):
            msg['private_chat_id'] = str(msg['private_chat_id'])


    
    return jsonify({'messages': starred_messages})


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET STARRED MESSAGE ENDS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MESSAGE TYPE STARTS HERE =======================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# This function determines the type of message based on its content or file type.


import mimetypes

def detect_message_type(message, is_system=False):
    """
    Detects the type of a message based on content or file type.
    System messages are handled separately.
    """
    # System messages should be treated differently
    if is_system:
        return "system"

    if not message or not isinstance(message, str):
        return "text"

    mime_type, _ = mimetypes.guess_type(message)

    if mime_type:
        if mime_type.startswith("image/"):
            return "image"
        elif mime_type.startswith("video/"):
            return "video"
        elif mime_type.startswith("audio/"):
            return "audio"
        elif mime_type == "application/pdf":
            return "pdf"
        elif "msword" in mime_type or "officedocument.wordprocessingml" in mime_type:
            return "docx"
        elif "spreadsheetml" in mime_type:
            return "xlsx"
        elif "presentationml" in mime_type:
            return "pptx"
        elif mime_type == "application/zip":
            return "zip"

    # Default fallback → plain text
    return "text"


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MESSAGE TYPE ENDS HERE =========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ DELETE MESSAGE STARTS HERE =========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/delete-messages/<message_id>/delete', methods=['POST'])
def delete_message(message_id):
    try:
        # Validate message_id format
        if not ObjectId.is_valid(message_id):
            return jsonify({"error": "Invalid message ID format"}), 400

        data = request.json
        user_id = data.get('user_id')
        delete_type = data.get('delete_type')

        if not user_id:
            return jsonify({"error": "User ID is required"}), 400
        if delete_type not in ['for_me', 'for_everyone']:
            return jsonify({"error": "Invalid delete type"}), 400

        message = db.messages.find_one({"_id": ObjectId(message_id)})
        if not message:
            return jsonify({"error": "Message not found"}), 404

        is_sender = str(message['user_id']) == user_id


        if delete_type == 'for_me':
            db.messages.update_one(
                {"_id": ObjectId(message_id)},
                {"$addToSet": {"deleted_for_me": ObjectId(user_id)}}
            )

            # Notify only the user's session (emit to user room)
            socketio.emit('message_deleted', {
                'message_id': message_id,
                'action': 'deleted_for_me',
                'user_id': user_id,
                'chat_id': str(message.get('group_id') or message.get('private_chat_id')),
                'timestamp': datetime.utcnow().isoformat()
            }, room=f"user_{user_id}")  # emit only to the current user

            return jsonify({"success": True})


        elif delete_type == 'for_everyone':
            if not is_sender:
                return jsonify({"error": "Only the sender can delete for everyone"}), 403

            update_result = db.messages.update_one(
                {"_id": ObjectId(message_id)},
                {
                    "$set": {
                        "deleted_for_all": True,
                        "deleted_at": datetime.utcnow(),
                        "deleted_by": ObjectId(user_id),
                        "message": "This message was deleted",
                    }
                }
            )

            # Prepare deleted text
            deleted_text = "You deleted this message." if is_sender else "This message was deleted."

            # Notify via WebSocket
            chat_room = message.get('group_id') or message.get('private_chat_id')

            if chat_room:
                socketio.emit('message_deleted', {
                    'message_id': message_id,
                    'action': 'deleted_for_everyone',
                    'chat_id': str(chat_room),
                    'deleted_text': deleted_text,
                    'user_id': user_id,
                    'timestamp': datetime.utcnow().isoformat()
                }, room=str(chat_room))

            return jsonify({
                "success": True,
                "modified_count": update_result.modified_count
            })

    except Exception as e:
        return jsonify({"error": f"Server error: {str(e)}"}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================== DELETE MESSAGE ENDS HERE =========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ SEARCH USERS TO FORWARD TO STARTS HERE =============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route("/forward_search_users")
def forward_search_users():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify([])

    current_user_id = ObjectId(user_id)
    query = request.args.get("query", "").strip()

    # 1. Get user IDs from private chats involving current user
    private_chat_users = set()
    private_chats = private_chats_collection.find({
        "$or": [
            {"user1_id": current_user_id},
            {"user2_id": current_user_id}
        ]
    })

    for chat in private_chats:
        user1 = chat.get("user1_id")
        user2 = chat.get("user2_id")
        if user1 and user1 != current_user_id:
            private_chat_users.add(user1)
        if user2 and user2 != current_user_id:
            private_chat_users.add(user2)

    # 2. If query is provided, search all users (excluding current user); otherwise show existing chat users
    matched_users = []
    if query:
        matched_users = list(users_collection.find({
            "_id": {"$ne": current_user_id},
            "$or": [
                {"firstname": {"$regex": query, "$options": "i"}},
                {"lastname": {"$regex": query, "$options": "i"}},
                {"staffid": {"$regex": query, "$options": "i"}}
            ]
        }, {
            "_id": 1,
            "firstname": 1,
            "lastname": 1,
            "staffid": 1,
            "image_url": 1
        }).limit(30))
    elif private_chat_users:
        matched_users = list(users_collection.find({
            "_id": {"$in": list(private_chat_users)}
        }, {
            "_id": 1,
            "firstname": 1,
            "lastname": 1,
            "staffid": 1,
            "image_url": 1
        }))

    # 3. Get groups that the user is a member of and match name with query (if provided)
    group_filter = {
        "$or": [
            {"members": current_user_id},
            {"members.user_id": current_user_id}
        ]
    }
    if query:
        group_filter["name"] = {"$regex": query, "$options": "i"}

    matched_groups = list(groups_collection.find(group_filter, {
        "_id": 1,
        "name": 1,
        "image": 1
    }))

    # 4. Combine results with chat_type label for frontend differentiation
    results = []

    for user in matched_users:
        results.append({
            "id": str(user["_id"]),
            "firstname": user.get("firstname", ""),
            "lastname": user.get("lastname", ""),
            "staffid": user.get("staffid", ""),
            "image_url": url_for("profile_images.get_profile_picture", user_id=str(user["_id"])),
            "chat_type": "private"
        })

    for group in matched_groups:
        results.append({
            "id": str(group["_id"]),
            "firstname": group.get("name", "Group"),
            "lastname": "",
            "staffid": "Group",
            "image_url": group.get("image") or "/static/images/dsa-logo.png",
            "chat_type": "group"
        })

    return jsonify(results)

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ SEARCH USERS TO FORWARD TO ENDS HERE ==============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ FORWARD MESSAGES STARTS HERE =======================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/forward_message', methods=['POST'])
def forward_message():
    db = get_db_connection()
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        required_fields = ['user_id', 'original_message_id']
        if not all(field in data for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        if bool(data.get('target_group_id')) == bool(data.get('target_private_chat_id')):
            return jsonify({"error": "Must specify exactly one of target_group_id or target_private_chat_id"}), 400

        try:
            user_id = ObjectId(data['user_id'])
            original_message_id = ObjectId(data['original_message_id'])
            target_group_id = ObjectId(data['target_group_id']) if data.get('target_group_id') else None
            target_private_chat_id = ObjectId(data['target_private_chat_id']) if data.get('target_private_chat_id') else None
        except Exception as e:
            return jsonify({"error": "Invalid ID format", "details": str(e)}), 400

        # If target_private_chat_id is actually a user_id (from forward_search_users), resolve/create the private_chat
        if target_private_chat_id:
            chat_doc = db.private_chats.find_one({"_id": target_private_chat_id})
            if not chat_doc:
                other_user = db.users.find_one({"_id": target_private_chat_id}, {"_id": 1})
                if other_user:
                    existing_chat = db.private_chats.find_one({
                        "$or": [
                            {"user1_id": user_id, "user2_id": target_private_chat_id},
                            {"user1_id": target_private_chat_id, "user2_id": user_id}
                        ]
                    })
                    if existing_chat:
                        target_private_chat_id = existing_chat["_id"]
                    else:
                        new_chat = db.private_chats.insert_one({
                            "user1_id": user_id,
                            "user2_id": target_private_chat_id,
                            "messages": []
                        })
                        target_private_chat_id = new_chat.inserted_id

        # Also check if target_group_id was mistakenly passed a user_id
        if target_group_id and not db.groups.find_one({"_id": target_group_id}):
            other_user = db.users.find_one({"_id": target_group_id}, {"_id": 1})
            if other_user:
                existing_chat = db.private_chats.find_one({
                    "$or": [
                        {"user1_id": user_id, "user2_id": target_group_id},
                        {"user1_id": target_group_id, "user2_id": user_id}
                    ]
                })
                if existing_chat:
                    target_private_chat_id = existing_chat["_id"]
                else:
                    new_chat = db.private_chats.insert_one({
                        "user1_id": user_id,
                        "user2_id": target_group_id,
                        "messages": []
                    })
                    target_private_chat_id = new_chat.inserted_id
                target_group_id = None

        original_message = db.messages.find_one({"_id": original_message_id})
        if not original_message:
            return jsonify({"error": "Original message not found"}), 404

        sender_user = db.users.find_one({"_id": user_id}, {"firstname": 1, "lastname": 1})
        sender_name = f"{sender_user.get('firstname', '')} {sender_user.get('lastname', '')}".strip() if sender_user else "Unknown"

        forward_source = None
        if original_message.get('private_chat_id'):
            forward_source = "private_chat"
        elif original_message.get('group_id'):
            if target_group_id and original_message['group_id'] == target_group_id:
                forward_source = "same_group"
            else:
                forward_source = "external_group"

        forwarded_msg = {
            "user_id": user_id,
            "group_id": target_group_id,
            "private_chat_id": target_private_chat_id,
            "message": original_message.get('message'),
            "message_type": original_message.get('message_type', 'text'),
            "file_id": original_message.get('file_id'),
            "file_name": original_message.get('file_name'),
            "timestamp": datetime.utcnow(),
            "forwarded": True,
            "forwarded_from": {
                "message_id": original_message['_id'],
                "user_id": original_message['user_id'],
                "group_id": original_message.get('group_id'),
                "private_chat_id": original_message.get('private_chat_id'),
                "timestamp": original_message.get('timestamp')
            },
            "forward_source": forward_source,
            "original_sender": original_message['user_id'],
            "read_by": [],
            "delivered_to": [],
            "status": "sent",
            "deleted_for_me": []
        }

        if original_message.get('message_type') in ['image', 'video']:
            forwarded_msg['mediaUrl'] = original_message.get('mediaUrl', '')

        result = db.messages.insert_one(forwarded_msg)

        # Serialize message for frontend (compatible with receive_message / displayMessage)
        serialized_msg = {
            "id": str(result.inserted_id),
            "user_id": str(user_id),
            "sender": sender_name,
            "group_id": str(target_group_id) if target_group_id else None,
            "private_chat_id": str(target_private_chat_id) if target_private_chat_id else None,
            "message": original_message.get('message'),
            "message_type": original_message.get('message_type', 'text'),
            "file_id": str(original_message['file_id']) if original_message.get('file_id') else None,
            "file_name": original_message.get('file_name'),
            "timestamp": forwarded_msg['timestamp'].isoformat(),
            "status": "sent",
            "read_by": [],
            "delivered_to": [],
            "forwarded": True,
            "forwarded_from": {
                "message_id": str(original_message['_id']),
                "user_id": str(original_message['user_id']),
                "group_id": str(original_message.get('group_id')) if original_message.get('group_id') else None,
                "private_chat_id": str(original_message.get('private_chat_id')) if original_message.get('private_chat_id') else None,
                "timestamp": original_message['timestamp'].isoformat() if isinstance(original_message.get('timestamp'), datetime) else str(original_message.get('timestamp', ''))
            },
            "forward_source": forward_source,
            "original_sender": str(original_message['user_id']),
            "mediaUrl": forwarded_msg.get('mediaUrl', '')
        }

        chat_type = "group" if target_group_id else "private"
        chat_room = str(target_group_id or target_private_chat_id)

        # Emit receive_message to the chat room and participants' personal rooms
        socketio.emit("receive_message", serialized_msg, room=chat_room)
        participants = get_chat_participants(chat_room, chat_type)
        for participant_id in participants:
            socketio.emit("receive_message", serialized_msg, room=f"user_{participant_id}")

        return jsonify({
            "status": "success",
            "message": "Message forwarded successfully",
            "forwarded_message_id": str(result.inserted_id)
        }), 200

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({
            "error": "Server error",
            "message": str(e)
        }), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ FORWARD MESSAGES ENDS HERE =========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET STAFF NAMES STARTS HERE ===============================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/get_staff_names', methods=['GET'])
def get_staff_names():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    user_obj_id = ObjectId(user_id)

    staff_names = list(db.users.find({}, {
        '_id': 0,
        'firstname': 1,
        'image': 1,
        'timestamp': 1
    }))

    return jsonify({
        'groups': [
            {
                'id': str(group.get('_id', '')),
                'name': group.get('name', ''),
                'image': group.get('image', ''),
                'timestamp': group.get('timestamp')
            } for group in staff_names
        ]
    })


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET STAFF NAMES ENDS HERE ===============================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET GROUPS STARTS HERE ===============================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/get_groups', methods=['GET'])
def get_groups():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    user_obj_id = ObjectId(user_id)

    # 🔹 1. Fetch all groups where the user is a member
    groups = list(db.groups.find({
        '$or': [
            {'members': user_obj_id},
            {'members.user_id': user_obj_id}
        ]
    }, {
        '_id': 1,
        'name': 1,
        'image': 1,
        'timestamp': 1
    }))

    return jsonify({
        'groups': [
            {
                'id': str(group['_id']),
                'name': group['name'],
                'image': group.get('image'),
                'timestamp': group.get('timestamp')
            } for group in groups
        ]
    })

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET GROUPS ENDS HERE ======================================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx




# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET ALL GROUPSS AND PRIVATE CHATS STARTS HERE =============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


@app.route('/get_groups_and_private_chats', methods=['GET'])
def get_groups_and_private_chats():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    try:
        user_obj_id = ObjectId(user_id)
    except Exception:
        return jsonify({'error': 'Invalid user_id'}), 400

    # ✅ 1. Fetch groups where the user is a member
    groups = list(db.groups.find(
        {
            "$or": [
                {"members": user_obj_id},
                {"members.user_id": user_obj_id}
            ]
        },
        {"_id": 1, "name": 1, "image": 1, "timestamp": 1}
    ))

    formatted_groups = []
    for group in groups:
        last_msg = db.messages.find_one(
            {"group_id": group["_id"]},
            sort=[("timestamp", -1)]
        )
        formatted_groups.append({
            'id': str(group['_id']),
            'name': group['name'],
            'image': resolve_group_image_url(group),
            'last_message': last_msg['message'] if last_msg else None,
            'last_timestamp': last_msg['timestamp'].isoformat() if last_msg and last_msg.get('timestamp') else None
        })

    # ✅ 2. Fetch private chats where user is a participant
    private_chats = list(db.private_chats.find({
        '$or': [
            {'user1_id': user_obj_id},
            {'user2_id': user_obj_id}
        ]
    }))

    formatted_private_chats = []
    for chat in private_chats:
        other_user_id = chat['user2_id'] if chat['user1_id'] == user_obj_id else chat['user1_id']
        other_user = db.users.find_one(
            {'_id': other_user_id},
            {'staffid': 1, 'firstname': 1, 'lastname': 1, 'image': 1}
        )

        last_msg = db.messages.find_one(
            {"private_chat_id": chat["_id"]},
            sort=[("timestamp", -1)]
        )

        if other_user:
            formatted_private_chats.append({
                'chat_id': str(chat['_id']),
                'with_user': {
                    'id': str(other_user['_id']),
                    'staffid': other_user.get('staffid'),
                    'firstname': other_user.get('firstname'),
                    'lastname': other_user.get('lastname'),
                    "image": url_for("profile_images.get_profile_picture", user_id=str(other_user["_id"]))
                },
                'last_message': last_msg['message'] if last_msg else None,
                'last_timestamp': last_msg['timestamp'].isoformat() if last_msg and last_msg.get('timestamp') else None
            })

    return jsonify({
        'groups': formatted_groups,
        'private_chats': formatted_private_chats
    })



# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET ALL GROUPSS AND PRIVATE CHATS ENDS HERE ===============================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET ALL PRIVATE MESSAGES STARTS HERE ======================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route("/get_private_messages", methods=["GET"])
def get_private_messages():
    db = get_db_connection()
    chat_id = request.args.get("chat_id")  # private_chat_id
    current_user_id = request.args.get("user_id")

    if not chat_id or not current_user_id:
        return jsonify({"error": "Invalid request"}), 400

    try:
        chat_obj_id = ObjectId(chat_id)
        current_user_obj_id = ObjectId(current_user_id)

        query = {
            "private_chat_id": chat_obj_id,
            "deleted_for_me": {"$nin": [current_user_obj_id]},
        }

        messages_cursor = db.messages.find(query).sort("timestamp", 1)

        messages = []
        for msg in messages_cursor:
            user = db.users.find_one(
                {"_id": ObjectId(msg["user_id"])},
                {"firstname": 1, "lastname": 1}
            )
            sender_name = f"{user['firstname']} {user['lastname']}" if user else "Unknown User"

            is_starred = current_user_obj_id in msg.get("starred_by", [])

            if msg.get("deleted_for_all"):
                message_content = None
                file_url = None
            else:
                message_content = msg["message"] if msg["message_type"] == "text" else None
                file_url = msg["message"] if msg["message_type"] in ["image", "file", "video", "audio"] else None

            message_data = {
                "id": str(msg["_id"]),
                "user_id": str(msg["user_id"]),
                "sender": sender_name,
                "private_chat_id": str(msg["private_chat_id"]),
                "message": message_content,
                "file_url": file_url,
                "message_type": msg["message_type"],
                "timestamp": msg["timestamp"].isoformat() if "timestamp" in msg else None,
                "starred": is_starred,
                "is_deleted": msg.get("deleted_for_all", False)
            }

            messages.append(message_data)

        return jsonify({"messages": messages})

    except Exception as e:
        print(f"❌ ERROR: Fetching private messages failed - {e}")
        return jsonify({"error": "Something went wrong"}), 500
    

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET ALL PRIVATE MESSAGES ENDS HERE ========================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET CHAT HISTORY STARTS HERE ==============================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/chat-info/<chat_type>/<chat_id>')
def get_chat_info(chat_type, chat_id):
    try:
        if chat_type == 'group':
            group = db.groups.find_one({'_id': ObjectId(chat_id)})
            if not group:
                return jsonify({'error': 'Group not found'}), 404

            grp_img = resolve_group_image_url(group)
            normalized_members, _ = normalize_group_members_and_admins(group, db)
            online_count = sum(1 for m in normalized_members if is_user_currently_online(str(m.get('id'))))
            return jsonify({
                'id': str(group['_id']),
                'type': 'group',
                'name': group.get('name'),
                'description': group.get('description', ''),
                'image': grp_img,
                'members_count': len(normalized_members),
                'online_count': online_count
            })

        elif chat_type == 'private':
            private_chat = db.private_chats.find_one({'_id': ObjectId(chat_id)})
            if not private_chat:
                return jsonify({'error': 'Private chat not found'}), 404

            current_user_id = request.args.get('user_id') or session.get('user_id')
            user1 = private_chat['user1_id']
            user2 = private_chat['user2_id']

            other_user_id = user1 if str(user1) != str(current_user_id) else user2
            other_user = db.users.find_one({'_id': ObjectId(other_user_id)})

            if not other_user:
                return jsonify({'error': 'User not found'}), 404

            is_blocked_by_me, is_blocked_by_other, _ = get_private_chat_block_state(
                private_chat, current_user_id, db
            )
            other_uid_str = str(other_user['_id'])
            is_online = is_user_currently_online(other_uid_str) or bool(other_user.get('is_online', False))
            last_seen = format_last_seen_iso(other_user.get('last_seen'))

            return jsonify({
                'id': str(private_chat['_id']),
                'type': 'private',
                'other_user_id': other_uid_str,
                'name': f"{other_user.get('firstname', '')} {other_user.get('lastname', '')}".strip(),
                "image": url_for("profile_images.get_profile_picture", user_id=other_uid_str),
                'is_online': is_online,
                'last_seen': last_seen,
                'is_blocked_by_me': is_blocked_by_me,
                'is_blocked_by_other': is_blocked_by_other,
                'is_blocked': is_blocked_by_me or is_blocked_by_other
            })

        else:
            return jsonify({'error': 'Invalid chat type'}), 400

    except Exception as e:
        print("🚨 Error in /chat-info:", e)
        return jsonify({'error': 'Internal server error'}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= GET CHAT HISTORY ENDS HERE ================================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= CREATE GROUP STARTS HERE =================================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/create_group', methods=['POST'])
def create_group():
    data = request.json
    name = data.get("name")
    description = data.get("description", "")
    image = data.get("image", "/static/images/dsa-logo.png")
    created_by = data.get("created_by")
    members = data.get("members", [])

    if not name or not created_by or not members:
        return jsonify({"error": "Missing required fields"}), 400

    if created_by not in members:
        members.append(created_by)

    member_entries = [
        {
            "user_id": ObjectId(uid),
            "role": "admin" if uid == created_by else "member",
            "joined_at": datetime.utcnow()
        }
        for uid in members
    ]

    group_doc = {
        "name": name,
        "description": description,
        "image": image,
        "created_by": ObjectId(created_by),
        "admins": [ObjectId(created_by)],
        "members": member_entries,
        "settings": {
            "who_can_add_members": "admins",
            "who_can_change_info": "admins"
        },
        "timestamp": datetime.utcnow()
    }

    group_id = groups_collection.insert_one(group_doc).inserted_id

    for user_id in members:
        users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$addToSet": {"groups": group_id}}
        )

    # 🔎 Fetch creator's name for system message
    creator = users_collection.find_one(
        {"_id": ObjectId(created_by)},
        {"firstname": 1, "lastname": 1}
    )
    creator_name = f"{creator.get('firstname', '')} {creator.get('lastname', '')}".strip() if creator else "Unknown User"

    # ✅ Insert system message with event type + human-readable text
    system_message = {
        "system": True,
        "group_id": group_id,
        "private_chat_id": None,
        "message": "created_group",        # short event type
        "display_text": f"{creator_name} created this group",  # 👈 human-friendly text
        "message_type": "system",
        "triggered_by": ObjectId(created_by),
        "timestamp": datetime.utcnow(),
        "read_by": [],
        "delivered_to": [],
        "status": "sent"
    }
    inserted_sys = messages_collection.insert_one(system_message)

    # Notify all added members in real time so the new group appears in their chat list
    sys_payload = {
        "id": str(inserted_sys.inserted_id),
        "group_id": str(group_id),
        "group_name": name,
        "group_image": image,
        "message": system_message["display_text"],
        "display_text": system_message["display_text"],
        "message_type": "system",
        "triggered_by": str(created_by),
        "sender": creator_name,
        "timestamp": system_message["timestamp"].isoformat()
    }
    for uid in members:
        if str(uid) != str(created_by):
            socketio.emit("receive_message", sys_payload, room=f"user_{uid}")

    return jsonify({
        "success": True,
        "group_id": str(group_id),
        "name": name,
        "image": image,
        "message": "Group created successfully"
    }), 201

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ========================================= CREATE GROUP ENDS HERE =================================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GROUP ADMIN & MEMBER HELPERS =======================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

def normalize_group_members_and_admins(group, db):
    """
    Ensures group['members'] is a list of {'user_id': ObjectId, 'role': 'admin'|'member', 'joined_at': datetime}
    and group['admins'] is a list of ObjectId, and guarantees at least one admin if the group has members
    (just like WhatsApp). Persists changes to DB if normalization was needed.
    """
    raw_members = group.get("members") or []
    raw_admins = group.get("admins") or []
    created_by = group.get("created_by")

    admin_id_strs = set()
    for a in raw_admins:
        aid = extract_member_id_str(a)
        if aid and is_valid_objectid(aid):
            admin_id_strs.add(aid)

    creator_id_str = str(created_by) if (created_by and is_valid_objectid(str(created_by))) else None

    normalized_members = []
    seen_uids = set()
    needs_db_update = False

    for m in raw_members:
        uid_str = extract_member_id_str(m)
        if not uid_str or not is_valid_objectid(uid_str):
            needs_db_update = True
            continue
        if uid_str in seen_uids:
            needs_db_update = True
            continue
        seen_uids.add(uid_str)

        if isinstance(m, dict):
            role = m.get("role", "member")
            joined_at = m.get("joined_at") or group.get("timestamp") or datetime.utcnow()
            if not isinstance(m.get("user_id"), ObjectId):
                needs_db_update = True
        else:
            role = "member"
            joined_at = group.get("timestamp") or datetime.utcnow()
            needs_db_update = True

        if uid_str in admin_id_strs or role == "admin":
            role = "admin"
            admin_id_strs.add(uid_str)
        elif not admin_id_strs and creator_id_str and uid_str == creator_id_str:
            role = "admin"
            admin_id_strs.add(uid_str)
            needs_db_update = True

        normalized_members.append({
            "user_id": ObjectId(uid_str),
            "role": role,
            "joined_at": joined_at
        })

    # WhatsApp rule: if a group has members but no admin at all, promote the creator (if member) or first member to admin
    has_member_admin = any(m["role"] == "admin" for m in normalized_members)
    if normalized_members and not has_member_admin:
        promoted = False
        if creator_id_str:
            for m in normalized_members:
                if str(m["user_id"]) == creator_id_str:
                    m["role"] = "admin"
                    admin_id_strs.add(creator_id_str)
                    promoted = True
                    break
        if not promoted:
            normalized_members[0]["role"] = "admin"
            admin_id_strs.add(str(normalized_members[0]["user_id"]))
        needs_db_update = True

    # Keep admin_id_strs limited to current members
    member_id_strs = {str(m["user_id"]) for m in normalized_members}
    valid_admin_strs = [ m_str for m_str in admin_id_strs if m_str in member_id_strs ]
    if len(valid_admin_strs) != len(raw_admins):
        needs_db_update = True

    normalized_admins = [ObjectId(aid) for aid in valid_admin_strs]

    if needs_db_update:
        db.groups.update_one(
            {"_id": group["_id"]},
            {"$set": {"members": normalized_members, "admins": normalized_admins}}
        )

    group["members"] = normalized_members
    group["admins"] = normalized_admins
    return normalized_members, {str(a) for a in normalized_admins}


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MEMBERS OF BOTH GROUP AND PRIVATE CHAT STARTS HERE =============================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/get_group_members', methods=['GET'])
def get_group_members():
    try:
        group_id = request.args.get('group_id')
        current_user_id = str(request.args.get('user_id') or session.get('user_id') or '')
        if not group_id or not is_valid_objectid(group_id):
            return jsonify({'error': 'Missing or invalid group_id'}), 400

        group = db.groups.find_one({'_id': ObjectId(group_id)})
        if not group:
            return jsonify({'error': 'Group not found'}), 404

        normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)
        creator_id_str = str(group.get('created_by')) if group.get('created_by') else None
        is_current_user_admin = current_user_id in admin_id_strs

        members_data = []
        for member in normalized_members:
            try:
                member_uid_str = str(member['user_id'])
                role = member.get('role', 'member')
                user = db.users.find_one(
                    {'_id': ObjectId(member_uid_str)},
                    {'_id': 1, 'firstname': 1, 'lastname': 1, 'staffid': 1, 'image': 1}
                )
                if user:
                    members_data.append({
                        'id': str(user['_id']),
                        'firstname': user.get('firstname', ''),
                        'lastname': user.get('lastname', ''),
                        'staffid': user.get('staffid', ''),
                        'image': url_for(
                            "profile_images.get_profile_picture",
                            user_id=str(user["_id"])
                        ),
                        'role': role,
                        'is_admin': role == 'admin',
                        'is_creator': str(user['_id']) == creator_id_str,
                        'is_you': str(user['_id']) == current_user_id
                    })
            except Exception as inner_e:
                print(f"⚠️ Skipping invalid member: {inner_e}")
                continue

        # Sort like WhatsApp: "You" first, then Group Admins, then alphabetically by name
        members_data.sort(key=lambda m: (
            0 if m['is_you'] else 1,
            0 if m['role'] == 'admin' else 1,
            f"{m.get('firstname', '')} {m.get('lastname', '')}".lower()
        ))

        return jsonify({
            'group_id': str(group['_id']),
            'group_name': group.get('name', ''),
            'is_admin': is_current_user_admin,
            'created_by': creator_id_str,
            'total_members': len(members_data),
            'members': members_data
        })

    except Exception as e:
        print("❌ Error in get_group_members:", e)
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MEMBERS OF BOTH GROUP AND PRIVATE CHAT ENDS HERE ===============================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET CHAT DETAILS (BOTH GROUP AND PRIVATE) STARTS HERE ==============================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# OVERVIEW TAB

@app.route('/get_chat_details', methods=['GET'])
def get_chat_details():
    chat_type = request.args.get('chat_type')
    chat_id = request.args.get('chat_id')
    user_id = request.args.get('user_id')

    if not chat_type or not chat_id:
        return jsonify({'error': 'Missing parameters'}), 400

    try:
        if chat_type == "private":
            if not user_id:
                return jsonify({'error': 'Missing user_id for private chat'}), 400

            chat = db.private_chats.find_one({'_id': ObjectId(chat_id)})
            if not chat:
                return jsonify({'error': 'Private chat not found'}), 404

            # Determine the other user
            user_obj_id = ObjectId(user_id)
            other_user_id = chat['user2_id'] if chat['user1_id'] == user_obj_id else chat['user1_id']

            other_user = db.users.find_one(
                {'_id': other_user_id},
                {'firstname': 1, 'lastname': 1, 'staffid': 1, 'image': 1}
            )

            if not other_user:
                return jsonify({'error': 'Other user not found'}), 404

            is_blocked_by_me, is_blocked_by_other, _ = get_private_chat_block_state(
                chat, user_id, db
            )

            response_data = {
                'id': str(chat['_id']),
                'type': 'private',
                'is_blocked_by_me': is_blocked_by_me,
                'is_blocked_by_other': is_blocked_by_other,
                'is_blocked': is_blocked_by_me or is_blocked_by_other,
                'with_user': {
                    'id': str(other_user['_id']),
                    'firstname': other_user.get('firstname', ''),
                    'lastname': other_user.get('lastname', ''),
                    'staffid': other_user.get('staffid', 'N/A'),
                    'image': url_for("profile_images.get_profile_picture", user_id=str(other_user["_id"]))
                }
            }
            return jsonify(response_data)

        elif chat_type == "group":
            group = db.groups.find_one(
                {'_id': ObjectId(chat_id)},
                {'name': 1, 'description': 1, 'image': 1, 'timestamp': 1, 'members': 1, 'admins': 1, 'created_by': 1}
            )
            if not group:
                return jsonify({'error': 'Group not found'}), 404

            normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)
            current_uid = str(user_id or session.get('user_id') or '')
            ts = group.get('timestamp')
            formatted_ts = ts.strftime("%d %B %Y") if isinstance(ts, datetime) else str(ts or "Unknown")

            return jsonify({
                'id': str(group['_id']),
                'type': 'group',
                'name': group.get('name'),
                'description': group.get('description', ''),
                'image': resolve_group_image_url(group),
                'timestamp': formatted_ts,
                'members_count': len(normalized_members),
                'is_admin': current_uid in admin_id_strs
            })

    except Exception as e:
        print("❌ Error in get_chat_details:", e)
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET CHAT DETAILS (BOTH GROUP AND PRIVATE) ENDS HERE ===============================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ ADD MEMBER TO GROUP STARTS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


@app.route('/add_group_member', methods=['POST'])
def add_group_member():
    try:
        data = request.json or {}
        group_id = data.get('group_id')
        user_ids = data.get('user_ids')
        actor_id = str(data.get('user_id') or session.get('user_id') or '')

        if not group_id or not user_ids or not isinstance(user_ids, list):
            return jsonify({'error': 'Missing or invalid group_id/user_ids'}), 400

        group = db.groups.find_one({'_id': ObjectId(group_id)})
        if not group:
            return jsonify({'error': 'Group not found'}), 404

        normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)

        # Enforce WhatsApp admin check if group has admins
        if actor_id and admin_id_strs and actor_id not in admin_id_strs:
            return jsonify({'error': 'Only group admins can add members'}), 403

        existing_user_ids = {str(m['user_id']) for m in normalized_members}

        new_members = []
        added_names = []
        skipped = []

        for user_id_str in user_ids:
            if not is_valid_objectid(str(user_id_str)):
                skipped.append({'user_id': str(user_id_str), 'reason': 'Invalid user ID'})
                continue
            user = db.users.find_one({'_id': ObjectId(user_id_str)})
            if not user:
                skipped.append({'user_id': user_id_str, 'reason': 'User not found'})
                continue

            if user_id_str in existing_user_ids:
                skipped.append({'user_id': user_id_str, 'reason': 'Already in group'})
                continue

            new_members.append({
                "user_id": ObjectId(user_id_str),
                "role": "member",
                "joined_at": datetime.utcnow()
            })
            existing_user_ids.add(user_id_str)
            added_names.append(f"{user.get('firstname', '')} {user.get('lastname', '')}".strip())

            # Also add group_id to user's groups array
            db.users.update_one(
                {"_id": ObjectId(user_id_str)},
                {"$addToSet": {"groups": ObjectId(group_id)}}
            )

        if new_members:
            db.groups.update_one(
                {"_id": ObjectId(group_id)},
                {"$push": {"members": {"$each": new_members}}}
            )

            # Create system message for added members
            actor_user = db.users.find_one({"_id": ObjectId(actor_id)}, {"firstname": 1, "lastname": 1}) if is_valid_objectid(actor_id) else None
            actor_name = f"{actor_user.get('firstname', '')} {actor_user.get('lastname', '')}".strip() if actor_user else "Admin"
            added_str = ", ".join(added_names)
            display_text = f"{actor_name} added {added_str}"

            sys_msg = {
                "system": True,
                "group_id": ObjectId(group_id),
                "private_chat_id": None,
                "message": "added_member",
                "display_text": display_text,
                "message_type": "system",
                "triggered_by": ObjectId(actor_id) if is_valid_objectid(actor_id) else None,
                "timestamp": datetime.utcnow(),
                "read_by": [],
                "delivered_to": [],
                "status": "sent"
            }
            inserted_sys = db.messages.insert_one(sys_msg)

            sys_payload = {
                "id": str(inserted_sys.inserted_id),
                "group_id": str(group_id),
                "group_name": group.get("name"),
                "group_image": group.get("image") or "/static/default_group.png",
                "message": display_text,
                "display_text": display_text,
                "message_type": "system",
                "triggered_by": actor_id,
                "sender": actor_name,
                "timestamp": sys_msg["timestamp"].isoformat()
            }
            socketio.emit("receive_message", sys_payload, room=str(group_id))
            for m in new_members:
                socketio.emit("receive_message", sys_payload, room=f"user_{m['user_id']}")
            socketio.emit("group_members_updated", {"group_id": str(group_id)}, room=str(group_id))

        response = {
            'message': 'Members processed',
            'added': [str(m['user_id']) for m in new_members],
            'skipped': skipped,
            'all_skipped': len(new_members) == 0 and len(skipped) > 0,
            'all_added': len(new_members) > 0 and len(skipped) == 0,
            'partial_success': len(new_members) > 0 and len(skipped) > 0
        }

        return jsonify(response), 200

    except Exception as e:
        print("❌ Error in add_group_member:", e)
        traceback.print_exc()
        return jsonify({'error': 'Internal Server Error', 'details': str(e)}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ ADD MEMBER TO GROUP ENDS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ EXIT / LEAVE GROUP & ADMIN ACTIONS START HERE ======================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

@app.route('/leave_group', methods=['POST'])
def leave_group_route():
    try:
        data = request.json or {}
        group_id = data.get('group_id')
        user_id = str(data.get('user_id') or session.get('user_id') or '')

        if not group_id or not is_valid_objectid(str(group_id)):
            return jsonify({'success': False, 'error': 'Invalid or missing group_id'}), 400
        if not user_id or not is_valid_objectid(str(user_id)):
            return jsonify({'success': False, 'error': 'Unauthorized or invalid user_id'}), 401

        group_obj_id = ObjectId(group_id)
        user_obj_id = ObjectId(user_id)

        group = db.groups.find_one({'_id': group_obj_id})
        if not group:
            return jsonify({'success': False, 'error': 'Group not found'}), 404

        normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)

        # Check if user is in the group
        remaining_members = [m for m in normalized_members if str(m['user_id']) != user_id]
        remaining_admin_strs = {aid for aid in admin_id_strs if aid != user_id}

        # Remove group from user's groups list as well
        db.users.update_one(
            {'_id': user_obj_id},
            {'$pull': {'groups': group_obj_id}}
        )

        # WhatsApp Rule: If the leaving user was the last admin and other members remain,
        # automatically promote the longest-standing / first remaining member to Group Admin
        new_auto_admin_id = None
        if remaining_members and not any(m.get('role') == 'admin' for m in remaining_members):
            remaining_members[0]['role'] = 'admin'
            new_auto_admin_id = str(remaining_members[0]['user_id'])
            remaining_admin_strs.add(new_auto_admin_id)

        updated_admins = [ObjectId(aid) for aid in remaining_admin_strs if is_valid_objectid(aid)]

        db.groups.update_one(
            {'_id': group_obj_id},
            {
                '$set': {
                    'members': remaining_members,
                    'admins': updated_admins
                }
            }
        )

        # Get leaving user's name for system message
        leaving_user = db.users.find_one({'_id': user_obj_id}, {'firstname': 1, 'lastname': 1})
        user_name = f"{leaving_user.get('firstname', '')} {leaving_user.get('lastname', '')}".strip() if leaving_user else "A member"
        display_text = f"{user_name} left"

        sys_msg = {
            "system": True,
            "group_id": group_obj_id,
            "private_chat_id": None,
            "message": "left_group",
            "display_text": display_text,
            "message_type": "system",
            "triggered_by": user_obj_id,
            "timestamp": datetime.utcnow(),
            "read_by": [],
            "delivered_to": [],
            "status": "sent"
        }
        inserted_sys = db.messages.insert_one(sys_msg)

        sys_payload = {
            "id": str(inserted_sys.inserted_id),
            "group_id": str(group_id),
            "message": display_text,
            "message_type": "system",
            "timestamp": sys_msg["timestamp"].isoformat()
        }
        socketio.emit("receive_message", sys_payload, room=str(group_id))

        # If a new admin was auto-assigned, insert a system message and notify
        if new_auto_admin_id:
            new_admin_user = db.users.find_one({'_id': ObjectId(new_auto_admin_id)}, {'firstname': 1, 'lastname': 1})
            new_admin_name = f"{new_admin_user.get('firstname', '')} {new_admin_user.get('lastname', '')}".strip() if new_admin_user else "A member"
            promo_text = f"{new_admin_name} is now a group admin"
            promo_msg = {
                "system": True,
                "group_id": group_obj_id,
                "private_chat_id": None,
                "message": "promoted_admin",
                "display_text": promo_text,
                "message_type": "system",
                "triggered_by": ObjectId(new_auto_admin_id),
                "target_user_id": ObjectId(new_auto_admin_id),
                "timestamp": datetime.utcnow(),
                "read_by": [],
                "delivered_to": [],
                "status": "sent"
            }
            inserted_promo = db.messages.insert_one(promo_msg)
            socketio.emit("receive_message", {
                "id": str(inserted_promo.inserted_id),
                "group_id": str(group_id),
                "message": promo_text,
                "message_type": "system",
                "timestamp": promo_msg["timestamp"].isoformat()
            }, room=str(group_id))

        socketio.emit("group_members_updated", {
            "group_id": str(group_id),
            "left_user_id": user_id
        }, room=str(group_id))

        return jsonify({
            "success": True,
            "group_id": str(group_id),
            "message": f"You exited {group.get('name', 'the group')}"
        }), 200

    except Exception as e:
        print("❌ Error in /leave_group:", e)
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/group_admin_action', methods=['POST'])
def group_admin_action():
    """
    WhatsApp-style Make Group Admin / Dismiss as Admin endpoint.
    Expects JSON: { group_id, target_user_id, action: 'promote' | 'demote', user_id (optional) }
    """
    try:
        data = request.json or {}
        group_id = data.get('group_id')
        target_user_id = str(data.get('target_user_id') or '')
        action = data.get('action')  # 'promote' or 'demote'
        actor_id = str(data.get('user_id') or session.get('user_id') or '')

        if not group_id or not is_valid_objectid(str(group_id)):
            return jsonify({'success': False, 'error': 'Invalid group_id'}), 400
        if not target_user_id or not is_valid_objectid(target_user_id):
            return jsonify({'success': False, 'error': 'Invalid target_user_id'}), 400
        if action not in ('promote', 'demote'):
            return jsonify({'success': False, 'error': 'Invalid action; must be promote or demote'}), 400
        if not actor_id or not is_valid_objectid(actor_id):
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        group_obj_id = ObjectId(group_id)
        group = db.groups.find_one({'_id': group_obj_id})
        if not group:
            return jsonify({'success': False, 'error': 'Group not found'}), 404

        normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)

        # Verify requester is a group admin
        if actor_id not in admin_id_strs:
            return jsonify({'success': False, 'error': 'Only group admins can manage admin roles'}), 403

        # Find target member
        target_member = next((m for m in normalized_members if str(m['user_id']) == target_user_id), None)
        if not target_member:
            return jsonify({'success': False, 'error': 'User is not a member of this group'}), 404

        if action == 'promote':
            target_member['role'] = 'admin'
            admin_id_strs.add(target_user_id)
        elif action == 'demote':
            # Prevent demoting if they are the only admin in the group
            if len(admin_id_strs) <= 1 and target_user_id in admin_id_strs:
                return jsonify({'success': False, 'error': 'Group must have at least one admin'}), 400
            target_member['role'] = 'member'
            admin_id_strs.discard(target_user_id)

        updated_admins = [ObjectId(aid) for aid in admin_id_strs if is_valid_objectid(aid)]

        db.groups.update_one(
            {'_id': group_obj_id},
            {
                '$set': {
                    'members': normalized_members,
                    'admins': updated_admins
                }
            }
        )

        actor_user = db.users.find_one({'_id': ObjectId(actor_id)}, {'firstname': 1, 'lastname': 1})
        target_user = db.users.find_one({'_id': ObjectId(target_user_id)}, {'firstname': 1, 'lastname': 1})
        actor_name = f"{actor_user.get('firstname', '')} {actor_user.get('lastname', '')}".strip() if actor_user else "Admin"
        target_name = f"{target_user.get('firstname', '')} {target_user.get('lastname', '')}".strip() if target_user else "Member"

        if action == 'promote':
            msg_code = "promoted_admin"
            display_text = f"{actor_name} made {target_name} a group admin"
        else:
            msg_code = "demoted_admin"
            display_text = f"{actor_name} dismissed {target_name} as admin"

        sys_msg = {
            "system": True,
            "group_id": group_obj_id,
            "private_chat_id": None,
            "message": msg_code,
            "display_text": display_text,
            "message_type": "system",
            "triggered_by": ObjectId(actor_id),
            "target_user_id": ObjectId(target_user_id),
            "timestamp": datetime.utcnow(),
            "read_by": [],
            "delivered_to": [],
            "status": "sent"
        }
        inserted_sys = db.messages.insert_one(sys_msg)

        sys_payload = {
            "id": str(inserted_sys.inserted_id),
            "group_id": str(group_id),
            "message": display_text,
            "message_type": "system",
            "timestamp": sys_msg["timestamp"].isoformat()
        }
        socketio.emit("receive_message", sys_payload, room=str(group_id))

        update_payload = {
            "group_id": str(group_id),
            "target_user_id": target_user_id,
            "role": target_member['role'],
            "action": action
        }
        socketio.emit("group_members_updated", update_payload, room=str(group_id))
        socketio.emit("group_members_updated", update_payload, room=f"user_{target_user_id}")

        return jsonify({
            "success": True,
            "group_id": str(group_id),
            "target_user_id": target_user_id,
            "new_role": target_member['role'],
            "message": f"{target_name} is now a group admin" if action == 'promote' else f"{target_name} was dismissed as admin"
        }), 200

    except Exception as e:
        print("❌ Error in /group_admin_action:", e)
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/remove_group_member', methods=['POST'])
def remove_group_member():
    """
    Allows a group admin to remove a member from the group (like WhatsApp).
    """
    try:
        data = request.json or {}
        group_id = data.get('group_id')
        target_user_id = str(data.get('target_user_id') or '')
        actor_id = str(data.get('user_id') or session.get('user_id') or '')

        if not group_id or not is_valid_objectid(str(group_id)):
            return jsonify({'success': False, 'error': 'Invalid group_id'}), 400
        if not target_user_id or not is_valid_objectid(target_user_id):
            return jsonify({'success': False, 'error': 'Invalid target_user_id'}), 400
        if not actor_id or not is_valid_objectid(actor_id):
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401

        group_obj_id = ObjectId(group_id)
        group = db.groups.find_one({'_id': group_obj_id})
        if not group:
            return jsonify({'success': False, 'error': 'Group not found'}), 404

        normalized_members, admin_id_strs = normalize_group_members_and_admins(group, db)

        if actor_id not in admin_id_strs:
            return jsonify({'success': False, 'error': 'Only group admins can remove members'}), 403

        if target_user_id == actor_id:
            return jsonify({'success': False, 'error': 'Use Exit Group to leave the group yourself'}), 400

        remaining_members = [m for m in normalized_members if str(m['user_id']) != target_user_id]
        if len(remaining_members) == len(normalized_members):
            return jsonify({'success': False, 'error': 'User is not in this group'}), 404

        admin_id_strs.discard(target_user_id)
        updated_admins = [ObjectId(aid) for aid in admin_id_strs if is_valid_objectid(aid)]

        db.groups.update_one(
            {'_id': group_obj_id},
            {
                '$set': {
                    'members': remaining_members,
                    'admins': updated_admins
                }
            }
        )

        db.users.update_one(
            {'_id': ObjectId(target_user_id)},
            {'$pull': {'groups': group_obj_id}}
        )

        actor_user = db.users.find_one({'_id': ObjectId(actor_id)}, {'firstname': 1, 'lastname': 1})
        target_user = db.users.find_one({'_id': ObjectId(target_user_id)}, {'firstname': 1, 'lastname': 1})
        actor_name = f"{actor_user.get('firstname', '')} {actor_user.get('lastname', '')}".strip() if actor_user else "Admin"
        target_name = f"{target_user.get('firstname', '')} {target_user.get('lastname', '')}".strip() if target_user else "Member"

        display_text = f"{actor_name} removed {target_name}"
        sys_msg = {
            "system": True,
            "group_id": group_obj_id,
            "private_chat_id": None,
            "message": "removed_member",
            "display_text": display_text,
            "message_type": "system",
            "triggered_by": ObjectId(actor_id),
            "target_user_id": ObjectId(target_user_id),
            "timestamp": datetime.utcnow(),
            "read_by": [],
            "delivered_to": [],
            "status": "sent"
        }
        inserted_sys = db.messages.insert_one(sys_msg)

        socketio.emit("receive_message", {
            "id": str(inserted_sys.inserted_id),
            "group_id": str(group_id),
            "message": display_text,
            "message_type": "system",
            "timestamp": sys_msg["timestamp"].isoformat()
        }, room=str(group_id))

        socketio.emit("group_members_updated", {"group_id": str(group_id)}, room=str(group_id))
        socketio.emit("removed_from_group", {
            "group_id": str(group_id),
            "group_name": group.get("name", "group")
        }, room=f"user_{target_user_id}")

        return jsonify({
            "success": True,
            "group_id": str(group_id),
            "target_user_id": target_user_id,
            "message": f"Removed {target_name} from group"
        }), 200

    except Exception as e:
        print("❌ Error in /remove_group_member:", e)
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/block_contact', methods=['POST'])
def block_contact():
    """
    Block or unblock a contact from the Contact Info slide-in modal.
    Expects JSON: { chat_id, target_user_id (optional), user_id (optional), action: 'block' | 'unblock' | 'toggle' }
    """
    try:
        data = request.json or {}
        chat_id = str(data.get('chat_id') or '')
        target_user_id = str(data.get('target_user_id') or '')
        user_id = str(data.get('user_id') or session.get('user_id') or '')
        action = str(data.get('action') or 'toggle').lower()

        if not user_id or not is_valid_objectid(user_id):
            return jsonify({'success': False, 'error': 'Unauthorized or invalid user_id'}), 401

        user_obj_id = ObjectId(user_id)
        chat_doc = None

        if chat_id and is_valid_objectid(chat_id):
            chat_doc = db.private_chats.find_one({'_id': ObjectId(chat_id)})

        if not chat_doc and target_user_id and is_valid_objectid(target_user_id):
            target_obj_id = ObjectId(target_user_id)
            chat_doc = db.private_chats.find_one({
                '$or': [
                    {'user1_id': user_obj_id, 'user2_id': target_obj_id},
                    {'user1_id': target_obj_id, 'user2_id': user_obj_id}
                ]
            })

        if not chat_doc:
            return jsonify({'success': False, 'error': 'Private chat not found'}), 404

        chat_obj_id = chat_doc['_id']
        chat_id_str = str(chat_obj_id)
        is_blocked_by_me, is_blocked_by_other, other_uid_str = get_private_chat_block_state(chat_doc, user_id, db)

        if not other_uid_str or not is_valid_objectid(other_uid_str):
            return jsonify({'success': False, 'error': 'Contact user not found'}), 404

        other_obj_id = ObjectId(other_uid_str)
        other_user = db.users.find_one({'_id': other_obj_id}, {'firstname': 1, 'lastname': 1})
        other_name = f"{other_user.get('firstname', '')} {other_user.get('lastname', '')}".strip() if other_user else "Contact"

        if action == 'toggle':
            should_block = not is_blocked_by_me
        elif action == 'block':
            should_block = True
        elif action == 'unblock':
            should_block = False
        else:
            return jsonify({'success': False, 'error': 'Invalid action'}), 400

        if should_block:
            db.private_chats.update_one(
                {'_id': chat_obj_id},
                {'$addToSet': {'blocked_by': user_obj_id}}
            )
            db.users.update_one(
                {'_id': user_obj_id},
                {'$addToSet': {'blocked_users': other_obj_id}}
            )
            now_blocked_by_me = True
            msg_text = f"You blocked {other_name}"
        else:
            db.private_chats.update_one(
                {'_id': chat_obj_id},
                {'$pull': {'blocked_by': user_obj_id}}
            )
            db.users.update_one(
                {'_id': user_obj_id},
                {'$pull': {'blocked_users': other_obj_id}}
            )
            now_blocked_by_me = False
            msg_text = f"You unblocked {other_name}"

        # Emit real-time update to both users so active chat UI and Contact Info modal stay in sync
        event_payload = {
            'chat_id': chat_id_str,
            'blocker_id': user_id,
            'target_user_id': other_uid_str,
            'blocked': now_blocked_by_me
        }
        socketio.emit('contact_block_updated', event_payload, room=chat_id_str)
        socketio.emit('contact_block_updated', event_payload, room=f"user_{user_id}")
        socketio.emit('contact_block_updated', event_payload, room=f"user_{other_uid_str}")

        return jsonify({
            'success': True,
            'chat_id': chat_id_str,
            'target_user_id': other_uid_str,
            'is_blocked_by_me': now_blocked_by_me,
            'is_blocked_by_other': is_blocked_by_other,
            'is_blocked': now_blocked_by_me or is_blocked_by_other,
            'message': msg_text
        }), 200

    except Exception as e:
        print("❌ Error in /block_contact:", e)
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ EXIT / LEAVE GROUP & ADMIN ACTIONS END HERE ========================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MEDIA MESSAGE STARTS HERE =====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
@app.route("/get_media", methods=["GET"])
def get_media():
    try:
        chat_id = request.args.get("chat_id")
        chat_type = request.args.get("chat_type")

        if not chat_id or not chat_type:
            return jsonify({"error": "Missing chat_id or chat_type"}), 400

        # Build query based on chat type
        if chat_type == "group":
            query = {"group_id": ObjectId(chat_id), "message_type": {"$in": ["image", "video", "audio"]}}
        elif chat_type == "private":
            query = {"private_chat_id": ObjectId(chat_id), "message_type": {"$in": ["image", "video", "audio"]}}
        else:
            return jsonify({"error": "Invalid chat type"}), 400

        # Fetch from messages collection
        media_messages = list(db.messages.find(query).sort("timestamp", -1))

        # Format response
        media_list = []
        for msg in media_messages:
            media_list.append({
                "id": str(msg["_id"]),
                # "file_id": str(msg.get("file_id")),
                "file_id": str(msg["file_id"]) if msg.get("file_id") else None,
                "file_name": msg.get("file_name"),
                "message_type": msg.get("message_type"),
                "timestamp": msg.get("timestamp")
            })

        return jsonify(media_list), 200

    except Exception as e:
        print("❌ Error in /get_media:", str(e))
        return jsonify({"error": "Server error"}), 500
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET MEDIA MESSAGE ENDS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET FILE MESSAGE STARTS HERE =====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
@app.route("/get_files", methods=["GET"])
def get_files():
    try:
        chat_id = request.args.get("chat_id")
        chat_type = request.args.get("chat_type")

        if not chat_id or not chat_type:
            return jsonify({"error": "Missing chat_id or chat_type"}), 400

        # Build query based on chat type
        if chat_type == "group":
            query = {"group_id": ObjectId(chat_id), "message_type": "file"}
        elif chat_type == "private":
            query = {"private_chat_id": ObjectId(chat_id), "message_type": "file"}
        else:
            return jsonify({"error": "Invalid chat type"}), 400

        # Fetch file messages
        file_messages = list(db.messages.find(query).sort("timestamp", -1))

        # Format response
        file_list = []
        for msg in file_messages:
            file_list.append({
                "id": str(msg["_id"]),
                "file_id": str(msg["file_id"]) if msg.get("file_id") else None,
                "file_name": msg.get("file_name"),
                "message_type": msg.get("message_type"),
                "timestamp": msg.get("timestamp")
            })

        return jsonify(file_list), 200

    except Exception as e:
        print("❌ Error in /get_files:", str(e))
        return jsonify({"error": "Server error"}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET FILE MESSAGE ENDS HERE ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ GET LINKS, EDIT MESSAGE & UPDATE GROUP INFO ========================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

URL_EXTRACTION_REGEX = re.compile(r'((?:https?://|www\.)[^\s<>"\'`]+)', re.IGNORECASE)


@app.route("/get_links", methods=["GET"])
def get_links():
    try:
        chat_id = request.args.get("chat_id")
        chat_type = request.args.get("chat_type")
        user_id = request.args.get("user_id") or session.get("user_id")

        if not chat_id or not chat_type or not is_valid_objectid(chat_id):
            return jsonify({"error": "Missing or invalid chat_id or chat_type"}), 400

        if chat_type == "group":
            query = {"group_id": ObjectId(chat_id), "deleted_for_all": {"$ne": True}}
        elif chat_type == "private":
            query = {"private_chat_id": ObjectId(chat_id), "deleted_for_all": {"$ne": True}}
        else:
            return jsonify({"error": "Invalid chat type"}), 400

        messages = list(db.messages.find(query).sort("timestamp", -1).limit(500))
        links_list = []

        for msg in messages:
            if user_id and is_valid_objectid(str(user_id)):
                deleted_for = [str(uid) for uid in (msg.get("deleted_for") or [])]
                if str(user_id) in deleted_for:
                    continue
            text = str(msg.get("message") or "")
            if not text or msg.get("message_type") in ("system", "image", "video", "audio", "file"):
                continue
            found_urls = URL_EXTRACTION_REGEX.findall(text)
            if not found_urls:
                continue
            ts = msg.get("timestamp")
            ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts or "")
            for raw_url in found_urls:
                clean_url = raw_url.rstrip(".,;:!?)")
                href = clean_url if clean_url.lower().startswith(("http://", "https://")) else f"https://{clean_url}"
                links_list.append({
                    "message_id": str(msg["_id"]),
                    "url": clean_url,
                    "href": href,
                    "message": text,
                    "timestamp": ts_str
                })

        return jsonify(links_list), 200
    except Exception as e:
        print("❌ Error in /get_links:", str(e))
        return jsonify({"error": "Server error"}), 500


@app.route("/edit_message", methods=["POST"])
def edit_message():
    try:
        data = request.get_json() or {}
        message_id = str(data.get("message_id") or "").strip()
        new_text = str(data.get("new_message") or "").strip()
        user_id = str(session.get("user_id") or data.get("user_id") or "").strip()

        if not message_id or not is_valid_objectid(message_id):
            return jsonify({"success": False, "error": "Invalid message ID"}), 400
        if not new_text:
            return jsonify({"success": False, "error": "Message cannot be empty"}), 400
        if not user_id or not is_valid_objectid(user_id):
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        msg = db.messages.find_one({"_id": ObjectId(message_id)})
        if not msg:
            return jsonify({"success": False, "error": "Message not found"}), 404
        if str(msg.get("user_id")) != user_id:
            return jsonify({"success": False, "error": "You can only edit your own messages"}), 403
        if msg.get("deleted_for_all"):
            return jsonify({"success": False, "error": "Cannot edit a deleted message"}), 400

        edited_at = datetime.utcnow()
        db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {
                "message": new_text,
                "edited": True,
                "edited_at": edited_at
            }}
        )

        chat_type = "group" if msg.get("group_id") else "private"
        chat_id = str(msg.get("group_id") or msg.get("private_chat_id") or "")

        payload = {
            "message_id": message_id,
            "chat_id": chat_id,
            "chat_type": chat_type,
            "new_message": new_text,
            "edited": True,
            "edited_at": edited_at.isoformat()
        }

        if chat_id:
            socketio.emit("message_edited", payload, room=chat_id)
            for pid in get_chat_participants(chat_id, chat_type):
                socketio.emit("message_edited", payload, room=f"user_{pid}")

        return jsonify({"success": True, **payload})
    except Exception as e:
        print("❌ Error in /edit_message:", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/update_group_info", methods=["POST"])
def update_group_info():
    try:
        data = request.get_json() or {}
        group_id = str(data.get("group_id") or "").strip()
        user_id = str(session.get("user_id") or data.get("user_id") or "").strip()

        if not group_id or not is_valid_objectid(group_id):
            return jsonify({"success": False, "error": "Invalid group ID"}), 400
        if not user_id or not is_valid_objectid(user_id):
            return jsonify({"success": False, "error": "Unauthorized"}), 401

        group = db.groups.find_one({"_id": ObjectId(group_id)})
        if not group:
            return jsonify({"success": False, "error": "Group not found"}), 404

        _, admin_id_strs = normalize_group_members_and_admins(group, db)
        if user_id not in admin_id_strs:
            return jsonify({"success": False, "error": "Only group admins can edit group info"}), 403

        update_fields = {}
        if "name" in data:
            new_name = str(data.get("name") or "").strip()
            if not new_name:
                return jsonify({"success": False, "error": "Group name cannot be empty"}), 400
            update_fields["name"] = new_name

        if "description" in data:
            update_fields["description"] = str(data.get("description") or "").strip()

        image_file_id = str(data.get("image_file_id") or "").strip()
        if image_file_id and is_valid_objectid(image_file_id):
            update_fields["image"] = ObjectId(image_file_id)

        if not update_fields:
            return jsonify({"success": False, "error": "No changes provided"}), 400

        db.groups.update_one({"_id": ObjectId(group_id)}, {"$set": update_fields})
        updated_group = db.groups.find_one({"_id": ObjectId(group_id)})
        resolved_img = resolve_group_image_url(updated_group)

        actor = db.users.find_one({"_id": ObjectId(user_id)}, {"firstname": 1, "lastname": 1})
        actor_name = f"{actor.get('firstname', '')} {actor.get('lastname', '')}".strip() if actor else "An admin"
        sys_msg = insert_and_emit_group_system_message(
            group_id,
            f"{actor_name} updated the group info",
            actor_id=user_id,
            db_conn=db
        )

        event_payload = {
            "group_id": group_id,
            "name": updated_group.get("name", ""),
            "description": updated_group.get("description", ""),
            "image": f"{resolved_img}?t={int(datetime.utcnow().timestamp())}",
            "updated_by": user_id,
            "system_message": sys_msg
        }
        socketio.emit("group_info_updated", event_payload, room=group_id)
        for pid in get_chat_participants(group_id, "group"):
            socketio.emit("group_info_updated", event_payload, room=f"user_{pid}")

        return jsonify({"success": True, **event_payload})
    except Exception as e:
        print("❌ Error in /update_group_info:", str(e))
        return jsonify({"success": False, "error": str(e)}), 500


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# ================================================ RUN ====================================================
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# Start Application
if __name__ == '__main__':
    # print(app.url_map)
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=5005, 
        debug=True,
        allow_unsafe_werkzeug=True
    ) 