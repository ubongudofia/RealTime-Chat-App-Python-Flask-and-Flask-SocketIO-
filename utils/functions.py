from datetime import datetime, timedelta
from pymongo import MongoClient
from flask import Flask, request, jsonify, render_template, make_response, redirect, Request, url_for, session, send_from_directory, Response, flash
from pymongo import DESCENDING, MongoClient
import certifi
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import pytz
from bson.objectid import ObjectId
from flask_pymongo import PyMongo
from werkzeug.utils import secure_filename
import os
import re
import gridfs
from gridfs.errors import NoFile
from pymongo.errors import PyMongoError


import traceback

# ======================= DATABASE CONNECTION ======================================================
# Set up shared database client and GridFS (URI comes from environment via config.py)
from config import MONGO_URI, MONGO_DB_NAME
_mongo_client = MongoClient(MONGO_URI)
_db = _mongo_client[MONGO_DB_NAME]

def get_db_connection():
    return _db


def get_mongo_client():
    return _mongo_client


# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================= ALLOWED FILES =======================================================
# Allowed file extensions
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "mp4", "mp3", "pdf", "docx"}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================= TIMESTAMP ===========================================================
# Timestamp
# This function formats a timestamp to a more readable format.
def format_timestamp(timestamp):
    return datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S').strftime('%I:%M %p')

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================= GET GROUP BY ID ======================================================
# ✅ Function to get a group by ID
# This function retrieves a group from the database based on the group_id.

def get_group_by_id(group_id):
    db = get_db_connection()
    group = db.groups.find_one({"_id": ObjectId(group_id)}, {"_id": 1, "name": 1})
    if group:
        group["id"] = str(group["_id"])  # Convert ObjectId to string for JSON compatibility
        del group["_id"]
    return group  # Returns a dictionary or None

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# =============================== GET MESSAGES FOR GROUP ============================================
# ✅ Function to get messages for a group
# This function retrieves messages for a group based on the group_id.

def get_messages_for_group(group_id):
    db = get_db_connection()

    try:
        # Validate ObjectId
        group_id = ObjectId(group_id)

        messages_cursor = db.messages.find(
            {"group_id": group_id},
            {"_id": 1, "user_id": 1, "message": 1, "message_type": 1, "timestamp": 1}
        ).sort("timestamp", 1)

        messages = []
        for msg in messages_cursor:
            user = db.users.find_one({"_id": ObjectId(msg["user_id"])}, {"firstname": 1, "lastname": 1})
            sender_name = f"{user['firstname']} {user['lastname']}" if user else "Unknown User"

            # Handle different message types
            file_path = None
            if msg.get("message_type") in ["image", "file", "video", "audio"] and msg.get("message"):
                file_path = f"/uploads/{msg['message']}" if not msg["message"].startswith("/uploads/") else msg["message"]

            messages.append({
                "id": str(msg["_id"]),
                "user_id": str(msg["user_id"]),
                "sender": sender_name,
                "message": msg["message"] if msg["message_type"] == "text" else None,
                "message_type": msg["message_type"],
                "file_path": file_path,
                "timestamp": str(msg.get("timestamp", "Unknown time"))  # Convert to string
            })

        return messages

    except (PyMongoError, Exception) as e:
        print(f"❌ Error fetching group messages: {e}")
        return []
    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================= GET MESSAGES FOR PRIVATE CHAT ============================================
# ✅ Function to get messages for a private chat
# This function retrieves messages for a private chat based on the private_chat_id.

def get_messages_for_private_chat(private_chat_id):
    db = get_db_connection()

    try:
        # Validate ObjectId
        private_chat_id = ObjectId(private_chat_id)

        messages_cursor = db.messages.find(
            {"private_chat_id": private_chat_id},
            {"_id": 1, "user_id": 1, "message": 1, "message_type": 1, "timestamp": 1}
        ).sort("timestamp", 1)

        messages = []
        for msg in messages_cursor:
            user = db.users.find_one({"_id": ObjectId(msg["user_id"])}, {"firstname": 1, "lastname": 1})
            sender_name = f"{user['firstname']} {user['lastname']}" if user else "Unknown User"

            # Handle different message types
            file_path = None
            if msg.get("message_type") in ["image", "file", "video", "audio"] and msg.get("message"):
                file_path = f"/uploads/{msg['message']}" if not msg["message"].startswith("/uploads/") else msg["message"]

            messages.append({
                "id": str(msg["_id"]),
                "user_id": str(msg["user_id"]),
                "sender": sender_name,
                "message": msg["message"] if msg["message_type"] == "text" else None,
                "message_type": msg["message_type"],
                "file_path": file_path,
                "timestamp": str(msg.get("timestamp", "Unknown time"))  # Convert to string
            })

        return messages

    except (PyMongoError, Exception) as e:
        print(f"❌ Error fetching private messages: {e}")
        return []

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ========================= GET PRIVATE CHAT BY ID ======================================================
# ✅ Function to get a private chat by ID

def get_private_chat_by_id(chat_id):
    db = get_db_connection()
    private_chat = db.private_chats.find_one({"_id": ObjectId(chat_id)}, {"_id": 1, "user1_id": 1, "user2_id": 1})
    if private_chat:
        private_chat["id"] = str(private_chat["_id"])
        private_chat["user1_id"] = str(private_chat["user1_id"])
        private_chat["user2_id"] = str(private_chat["user2_id"])
        del private_chat["_id"]
    return private_chat  # Returns a dictionary or None

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================================= GET USER CHAT ================================================
# # Define the user's timezone

user_timezone = pytz.timezone('Africa/Lagos')  # Update with the correct timezone


def get_user_chats(user_id):
    db = get_db_connection()
    user_obj_id = ObjectId(user_id)

    user = db.users.find_one({"_id": user_obj_id}, {"groups": 1})
    user_group_ids = user.get("groups", []) if user else []

    # Get user's groups (by user.groups list OR membership in group.members), excluding deleted ones
    group_chats = list(db.groups.find(
        {
            "$or": [
                {"_id": {"$in": user_group_ids}},
                {"members": user_obj_id},
                {"members.user_id": user_obj_id}
            ],
            "deleted": {"$ne": True}
        },
        {"_id": 1, "name": 1, "image": 1}
    ))

    # Bulk query: get last message for ALL groups in one aggregation
    group_ids = [g["_id"] for g in group_chats]
    group_last_messages = {}
    if group_ids:
        group_pipeline = [
            {"$match": {"group_id": {"$in": group_ids}, "deleted_for_me": {"$nin": [user_obj_id]}}},
            {"$sort": {"timestamp": -1, "_id": -1}},
            {"$group": {
                "_id": "$group_id",
                "message": {"$first": "$message"},
                "message_type": {"$first": "$message_type"},
                "file_name": {"$first": "$file_name"},
                "display_text": {"$first": "$display_text"},
                "timestamp": {"$first": "$timestamp"}
            }}
        ]
        for doc in db.messages.aggregate(group_pipeline):
            group_last_messages[doc["_id"]] = doc

    formatted_group_chats = []
    for group in group_chats:
        last_msg = group_last_messages.get(group["_id"])
        msg_text = ""
        msg_type = "text"
        file_name = None
        ts = None
        if last_msg:
            msg_type = last_msg.get("message_type", "text")
            msg_text = (
                last_msg.get("display_text") or last_msg.get("message")
                if msg_type == "system"
                else last_msg.get("message", "")
            )
            file_name = last_msg.get("file_name")
            ts = last_msg.get("timestamp")

        formatted_group_chats.append({
            "id": str(group["_id"]),
            "name": group.get("name", "Unnamed Group"),
            "type": "group",
            "image": group.get("image", ""),
            "group_doc": group,
            "last_message": format_last_message(msg_text) if msg_text else "No messages yet",
            "last_message_raw": msg_text or "",
            "message_type": "text" if msg_type == "system" else msg_type,
            "file_name": file_name,
            "raw_timestamp": ts,
            "timestamp": format_timestamp(ts) if ts else ""
        })

    # Get private chats, excluding deleted ones
    private_chats = list(db.private_chats.find(
        {
            "$or": [{"user1_id": user_obj_id}, {"user2_id": user_obj_id}],
            "deleted": {"$ne": True}
        }
    ))

    # Bulk query: get other users info for ALL private chats in one query
    other_user_ids = []
    for chat in private_chats:
        oid = chat["user1_id"] if chat["user2_id"] == user_obj_id else chat["user2_id"]
        other_user_ids.append(oid)

    other_users_map = {}
    if other_user_ids:
        for u in db.users.find(
            {"_id": {"$in": list(set(other_user_ids))}},
            {"firstname": 1, "lastname": 1, "image": 1, "is_online": 1, "last_seen": 1}
        ):
            other_users_map[u["_id"]] = u

    # Bulk query: get last message for ALL private chats in one aggregation
    private_chat_ids = [c["_id"] for c in private_chats]
    private_last_messages = {}
    if private_chat_ids:
        private_pipeline = [
            {"$match": {"private_chat_id": {"$in": private_chat_ids}, "deleted_for_me": {"$nin": [user_obj_id]}}},
            {"$sort": {"timestamp": -1, "_id": -1}},
            {"$group": {
                "_id": "$private_chat_id",
                "message": {"$first": "$message"},
                "message_type": {"$first": "$message_type"},
                "file_name": {"$first": "$file_name"},
                "display_text": {"$first": "$display_text"},
                "timestamp": {"$first": "$timestamp"}
            }}
        ]
        for doc in db.messages.aggregate(private_pipeline):
            private_last_messages[doc["_id"]] = doc

    private_chat_data = []
    for chat in private_chats:
        other_user_id = chat["user1_id"] if chat["user2_id"] == user_obj_id else chat["user2_id"]
        other_user = other_users_map.get(other_user_id)

        chat_name = f"{other_user.get('firstname', '')} {other_user.get('lastname', '')}".strip() if other_user else "Unknown"
        profile_picture = f"/profile_picture/{other_user_id}" if other_user and other_user.get("image") else "/static/images/default-profile.png"

        last_msg = private_last_messages.get(chat["_id"])
        msg_text = ""
        msg_type = "text"
        file_name = None
        ts = None
        if last_msg:
            msg_type = last_msg.get("message_type", "text")
            msg_text = (
                last_msg.get("display_text") or last_msg.get("message")
                if msg_type == "system"
                else last_msg.get("message", "")
            )
            file_name = last_msg.get("file_name")
            ts = last_msg.get("timestamp")

        private_chat_data.append({
            "id": str(chat["_id"]),
            "other_user_id": str(other_user_id),
            "other_user_doc": other_user,
            "name": chat_name,
            "type": "private",
            "image": profile_picture,
            "last_message": format_last_message(msg_text) if msg_text else "No messages yet",
            "last_message_raw": msg_text or "",
            "message_type": "text" if msg_type == "system" else msg_type,
            "file_name": file_name,
            "raw_timestamp": ts,
            "timestamp": format_timestamp(ts) if ts else "",
            "is_online": bool(other_user.get("is_online", False)) if other_user else False,
            "last_seen": other_user.get("last_seen") if other_user else None
        })

    all_chats = formatted_group_chats + private_chat_data
    all_chats.sort(
        key=lambda c: c.get("raw_timestamp") or datetime.min,
        reverse=True
    )
    return all_chats

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================== FORMAT LAST MESSAGES =================================================

def format_last_message(msg):
    """Detect file URLs and format them properly."""
    if msg is None:
        return "No messages yet"

    # Check if it's a file path (assumes files are stored in /uploads/)
    file_pattern = re.compile(r"^/uploads/[\w.-]+\.(\w+)$")
    match = file_pattern.match(msg)

    if match:
        file_ext = match.group(1).upper()  # Extract file extension
        return f"📁 {file_ext} File"  # Example: "📁 PDF File"

    return msg[:20]  # Truncate normal text messages

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ==================================== FORMAT TIMESTAMP ================================================

def format_timestamp(timestamp):
    """Format timestamps like WhatsApp: time for today, 'Yesterday' for yesterday, and date for older messages."""
    if not timestamp:
        return ""

    utc_time = timestamp.replace(tzinfo=pytz.utc)
    local_time = utc_time.astimezone(user_timezone)

    now = datetime.now(user_timezone).date()
    msg_date = local_time.date()

    if msg_date == now:
        return local_time.strftime('%I:%M %p')  # Show time (e.g., 10:30 AM)
    elif msg_date == now - timedelta(days=1):
        return "Yesterday"
    else:
        return local_time.strftime('%d-%b-%y')  # Show date (e.g., 22-Mar-25)

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ======================================= GET CHATS ====================================================

def get_chats():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "User not logged in"}), 401

    db = get_db_connection()
    user_obj_id = ObjectId(user_id)

    # Fetch user's private chats
    private_chats = list(db.private_chats.find({
        "$or": [{"user1_id": user_obj_id}, {"user2_id": user_obj_id}],
        "deleted": {"$ne": True}
    }))

    other_user_ids = [c["user1_id"] if c["user2_id"] == user_obj_id else c["user2_id"] for c in private_chats]
    other_users_map = {
        u["_id"]: u for u in db.users.find(
            {"_id": {"$in": list(set(other_user_ids))}},
            {"firstname": 1, "lastname": 1, "image": 1}
        )
    }

    private_chat_list = []
    for chat in private_chats:
        other_user_id = chat["user1_id"] if chat["user2_id"] == user_obj_id else chat["user2_id"]
        other_user = other_users_map.get(other_user_id)
        if other_user:
            private_chat_list.append({
                "chat_id": str(chat["_id"]),
                "chat_type": "private",
                "name": f"{other_user.get('firstname', 'Unknown')} {other_user.get('lastname', '')}".strip(),
                "image_url": url_for("profile_images.get_profile_picture", user_id=str(other_user["_id"])) if other_user.get("image") else None,
                "unread_count": 0
            })

    # Fetch user's group chats
    user_groups = list(db.groups.find(
        {"$or": [{"members": user_obj_id}, {"members.user_id": user_obj_id}], "deleted": {"$ne": True}},
        {"_id": 1, "name": 1, "image": 1}
    ))
    group_chat_list = [{
        "chat_id": str(group["_id"]),
        "chat_type": "group",
        "name": group.get("name", "Unnamed Group"),
        "image_url": "/static/images/dsa-logo.png",
        "unread_count": 0
    } for group in user_groups]

    return jsonify({"success": True, "chats": private_chat_list + group_chat_list})

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# =================================== GET UNREAD COUNT ==================================================

def get_unread_count(user_id):
    db = get_db_connection()
    user_obj_id = ObjectId(user_id)

    unread_private = {}
    unread_group = {}

    # Private Chats: Count unread messages from others in a single aggregation
    private_chats = list(db.private_chats.find(
        {"$or": [{"user1_id": user_obj_id}, {"user2_id": user_obj_id}], "deleted": {"$ne": True}},
        {"_id": 1}
    ))
    private_chat_ids = [c["_id"] for c in private_chats]
    if private_chat_ids:
        pipeline = [
            {
                "$match": {
                    "private_chat_id": {"$in": private_chat_ids},
                    "user_id": {"$ne": user_obj_id},          # Others' messages
                    "message_type": {"$ne": "system"},
                    "system": {"$ne": True},
                    "read_by": {"$nin": [user_obj_id]},       # Not read by current user
                    "deleted_for_me": {"$nin": [user_obj_id]}
                }
            },
            {"$group": {"_id": "$private_chat_id", "count": {"$sum": 1}}}
        ]
        for doc in db.messages.aggregate(pipeline):
            unread_private[str(doc["_id"])] = doc["count"]

    # Group Chats: Count unread messages from others in a single aggregation
    user_groups = db.users.find_one({"_id": user_obj_id}, {"groups": 1})
    group_ids = set(user_groups.get("groups", [])) if user_groups else set()
    for g in db.groups.find(
        {"$or": [{"members": user_obj_id}, {"members.user_id": user_obj_id}], "deleted": {"$ne": True}},
        {"_id": 1}
    ):
        group_ids.add(g["_id"])

    group_ids_list = list(group_ids)
    if group_ids_list:
        pipeline = [
            {
                "$match": {
                    "group_id": {"$in": group_ids_list},
                    "user_id": {"$ne": user_obj_id},          # Exclude own messages
                    "message_type": {"$ne": "system"},
                    "system": {"$ne": True},
                    "read_by": {"$nin": [user_obj_id]},       # Not read by current user
                    "deleted_for_me": {"$nin": [user_obj_id]}
                }
            },
            {"$group": {"_id": "$group_id", "count": {"$sum": 1}}}
        ]
        for doc in db.messages.aggregate(pipeline):
            unread_group[str(doc["_id"])] = doc["count"]

    return {"private": unread_private, "group": unread_group}

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

