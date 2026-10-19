from flask import Flask, Blueprint, current_app,  request, jsonify, render_template, make_response, redirect, Request, url_for, session, send_from_directory, Response, flash
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
from utils.functions import get_db_connection
from bson import ObjectId
from bson.errors import InvalidId






# ======================= DATABASE CONNECTION ======================================================
from config import MONGO_URI, MONGO_DB_NAME  # loaded from environment / .env

# Simple local client
from utils.functions import get_mongo_client
mongo_client = get_mongo_client()  # shared connection pool

# Set up database and GridFS
db = mongo_client[MONGO_DB_NAME]
fs = gridfs.GridFS(db)  # GridFS instance

# Set up Flask-PyMongo
  

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
# BLUEPRINTS NAME
get_messages_bp = Blueprint('get_all_messages', __name__)


# ================================ GET MESSAGES ===================================


# ================================================================================================================
#                                            GET MESSAGES
# ================================================================================================================

@get_messages_bp.route("/get_messages", methods=["GET"])
def get_messages():
    db = get_db_connection()
    chat_id = request.args.get("chat_id")
    chat_type = request.args.get("chat_type")
    current_user_id = request.args.get("user_id")

    if not chat_id or chat_type not in ["group", "private"]:
        return jsonify({"error": "Invalid request"}), 400

    try:
        chat_obj_id = ObjectId(chat_id)
        current_user_obj_id = ObjectId(current_user_id) if current_user_id else None

        # Build base query
        query = {}
        if current_user_obj_id:
            query["deleted_for_me"] = {"$nin": [current_user_obj_id]}

        if chat_type == "group":
            query["group_id"] = chat_obj_id
        else:
            query["private_chat_id"] = chat_obj_id

        # Cursor pagination: limit & before (id or ISO timestamp)
        before = request.args.get("before") or request.args.get("before_id")
        limit = request.args.get("limit", default=50, type=int)
        if limit < 1:
            limit = 50
        elif limit > 200:
            limit = 200

        if before:
            if ObjectId.is_valid(before):
                before_obj = ObjectId(before)
                ref_msg = db.messages.find_one({"_id": before_obj}, {"timestamp": 1})
                if ref_msg and isinstance(ref_msg.get("timestamp"), datetime):
                    query["$or"] = [
                        {"timestamp": {"$lt": ref_msg["timestamp"]}},
                        {"timestamp": ref_msg["timestamp"], "_id": {"$lt": before_obj}}
                    ]
                else:
                    query["_id"] = {"$lt": before_obj}
            else:
                try:
                    dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
                    query["timestamp"] = {"$lt": dt}
                except Exception:
                    pass

        # Fetch limit + 1 in reverse chronological order to determine has_more
        messages_cursor = db.messages.find(query).sort([("timestamp", -1), ("_id", -1)]).limit(limit + 1)
        raw_msgs = list(messages_cursor)
        has_more = len(raw_msgs) > limit
        if has_more:
            raw_msgs = raw_msgs[:limit]

        # Reverse so older messages come first (chronological order)
        raw_msgs.reverse()

        # Batch resolve reply messages
        reply_ids = [m["reply_to_message_id"] for m in raw_msgs if m.get("reply_to_message_id")]
        replies_map = {}
        if reply_ids:
            for rep in db.messages.find(
                {"_id": {"$in": reply_ids}},
                {"message": 1, "message_type": 1, "user_id": 1, "file_id": 1, "file_name": 1, "deleted_for_all": 1}
            ):
                replies_map[rep["_id"]] = rep

        # Batch resolve users for senders, replies, and system events
        user_ids = set()
        for msg in raw_msgs:
            if msg.get("user_id") and ObjectId.is_valid(str(msg["user_id"])):
                user_ids.add(ObjectId(str(msg["user_id"])))
            if msg.get("triggered_by") and ObjectId.is_valid(str(msg["triggered_by"])):
                user_ids.add(ObjectId(str(msg["triggered_by"])))
            if msg.get("target_user_id") and ObjectId.is_valid(str(msg["target_user_id"])):
                user_ids.add(ObjectId(str(msg["target_user_id"])))

        for rep in replies_map.values():
            if rep.get("user_id") and ObjectId.is_valid(str(rep["user_id"])):
                user_ids.add(ObjectId(str(rep["user_id"])))

        users_map = {}
        if user_ids:
            for u in db.users.find({"_id": {"$in": list(user_ids)}}, {"firstname": 1, "lastname": 1}):
                users_map[u["_id"]] = u

        messages = []
        for msg in raw_msgs:
            # ✅ Handle system messages separately
            if msg.get("message_type") == "system":
                triggered_by = msg.get("triggered_by")
                target_user_id = msg.get("target_user_id")
                triggered_name = "Someone"
                if triggered_by:
                    u_doc = users_map.get(ObjectId(str(triggered_by))) if ObjectId.is_valid(str(triggered_by)) else None
                    if u_doc:
                        triggered_name = f"{u_doc.get('firstname', '')} {u_doc.get('lastname', '')}".strip() or "Someone"

                actor_label = "You" if (triggered_by and str(triggered_by) == str(current_user_id)) else triggered_name
                msg_code = msg.get("message")

                if msg_code == "created_group":
                    system_text = f"{actor_label} created this group"
                elif msg_code == "left_group":
                    system_text = f"{actor_label} left"
                elif msg_code == "promoted_admin":
                    if target_user_id and str(target_user_id) == str(current_user_id):
                        system_text = "You are now a group admin"
                    elif msg.get("display_text"):
                        system_text = msg.get("display_text")
                    else:
                        system_text = f"{actor_label} made a member a group admin"
                elif msg_code == "demoted_admin":
                    if target_user_id and str(target_user_id) == str(current_user_id):
                        system_text = f"{actor_label} dismissed you as admin"
                    else:
                        system_text = msg.get("display_text") or f"{actor_label} dismissed an admin"
                else:
                    system_text = msg.get("display_text") or msg.get("message", "System event")

                message_data = {
                    "id": str(msg["_id"]),
                    "user_id": None,
                    "sender": "System",
                    "message": system_text,
                    "message_type": "system",
                    "timestamp": msg["timestamp"].isoformat() if "timestamp" in msg and isinstance(msg["timestamp"], datetime) else None,
                }
                messages.append(message_data)
                continue

            # ✅ Normal user messages
            user_id = msg.get("user_id")
            sender_name = "Unknown User"
            if user_id:
                u_doc = users_map.get(ObjectId(str(user_id))) if ObjectId.is_valid(str(user_id)) else None
                if u_doc:
                    sender_name = f"{u_doc.get('firstname', '')} {u_doc.get('lastname', '')}".strip() or "Unknown User"

            is_starred = current_user_obj_id in msg.get("starred_by", []) if current_user_obj_id else False

            if msg.get("deleted_for_all"):
                message_content = None
            else:
                message_content = msg["message"] if msg.get("message_type") == "text" else None

            # For files: use stored file_id + file_name (GridFS)
            file_id = str(msg.get("file_id")) if msg.get("file_id") else None
            file_name = msg.get("file_name") if msg.get("file_name") else None

            message_data = {
                "id": str(msg["_id"]),
                "user_id": str(user_id) if user_id else None,
                "sender": sender_name,
                "group_id": str(msg["group_id"]) if msg.get("group_id") else None,
                "private_chat_id": str(msg["private_chat_id"]) if msg.get("private_chat_id") else None,
                "message": message_content,
                "file_id": file_id,
                "file_name": file_name,
                "message_type": msg.get("message_type"),
                "timestamp": msg["timestamp"].isoformat() if "timestamp" in msg and isinstance(msg["timestamp"], datetime) else None,
                "starred": is_starred,
                "starred_by": [str(uid) for uid in msg.get("starred_by", [])],
                "starred_at": msg.get("starred_at").isoformat() if isinstance(msg.get("starred_at"), datetime) else None,
                "is_deleted": msg.get("deleted_for_all", False),
                "status": "read" if (msg.get("status") == "read" or any(str(r_uid) != str(user_id) for r_uid in msg.get("read_by", []))) else msg.get("status", "sent"),
                "delivered_to": [str(uid) for uid in msg.get("delivered_to", [])],
                "read_by": [str(uid) for uid in msg.get("read_by", [])],
                "forwarded": msg.get("forwarded", False),
                "edited": bool(msg.get("edited", False)),
                "edited_at": msg["edited_at"].isoformat() if isinstance(msg.get("edited_at"), datetime) else None,
            }

            # Replies
            reply_ref_id = msg.get("reply_to_message_id")
            if reply_ref_id:
                original_msg = replies_map.get(reply_ref_id)
                if original_msg:
                    reply_user_id = original_msg.get("user_id")
                    reply_user = users_map.get(ObjectId(str(reply_user_id))) if (reply_user_id and ObjectId.is_valid(str(reply_user_id))) else None
                    reply_sender = f"{reply_user.get('firstname', '')} {reply_user.get('lastname', '')}".strip() if reply_user else "Unknown"

                    message_data["reply_to"] = {
                        "message": "[Original message deleted]" if original_msg.get("deleted_for_all") else original_msg.get("message", ""),
                        "message_type": original_msg.get("message_type", "text"),
                        "file_id": str(original_msg.get("file_id")) if original_msg.get("file_id") else None,
                        "file_name": original_msg.get("file_name") if original_msg.get("file_name") else None,
                        "sender": reply_sender,
                        "message_id": str(original_msg["_id"]),
                        "is_deleted": original_msg.get("deleted_for_all", False)
                    }

            messages.append(message_data)

        oldest_id = messages[0]["id"] if messages else None
        oldest_timestamp = messages[0]["timestamp"] if messages else None

        return jsonify({
            "messages": messages,
            "has_more": has_more,
            "oldest_id": oldest_id,
            "oldest_timestamp": oldest_timestamp
        })

    except Exception as e:
        print(f"❌ ERROR: Fetching messages failed - {e}")
        return jsonify({"error": "Something went wrong"}), 500
