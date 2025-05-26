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
MONGO_URI = "mongodb://localhost:27017/chatDatabase"

# Simple local client
mongo_client = MongoClient(MONGO_URI)

# Set up database and GridFS
db = mongo_client["chatDatabase"]
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

@get_messages_bp.route("/get_messages", methods=["GET"])
def get_messages():
    db = get_db_connection()  # Get MongoDB connection
    chat_id = request.args.get("chat_id")
    chat_type = request.args.get("chat_type")
    current_user_id = request.args.get("user_id")  # Get current user ID from request

    if not chat_id or chat_type not in ["group", "private"]:
        return jsonify({"error": "Invalid request"}), 400

    try:
        chat_obj_id = ObjectId(chat_id)
        current_user_obj_id = ObjectId(current_user_id) if current_user_id else None

        query = {"group_id": chat_obj_id} if chat_type == "group" else {"private_chat_id": chat_obj_id}
        messages_cursor = db.messages.find(query).sort("timestamp", 1)  # Sort ascending

        messages = []
        for msg in messages_cursor:
            user = db.users.find_one({"_id": ObjectId(msg["user_id"])}, {"firstname": 1, "lastname": 1})
            sender_name = f"{user['firstname']} {user['lastname']}" if user else "Unknown User"

            # Check if current user has starred this message
            is_starred = current_user_obj_id in msg.get("starred_by", []) if current_user_obj_id else False

            message_content = None if msg["message_type"] != "text" else msg["message"]
            file_url = msg["message"] if msg["message_type"] in ["image", "file", "video", "audio"] else None

            # Ensure timestamp is in ISO format
            timestamp_iso = msg["timestamp"].isoformat() if "timestamp" in msg else None

            # Base message structure
            message_data = {
                "id": str(msg["_id"]),
                "user_id": str(msg["user_id"]),
                "sender": sender_name,
                "group_id": str(msg["group_id"]) if msg.get("group_id") else None,
                "private_chat_id": str(msg["private_chat_id"]) if msg.get("private_chat_id") else None,
                "message": message_content,
                "file_url": file_url,
                "message_type": msg["message_type"],
                "timestamp": timestamp_iso,
                "starred": is_starred,
                "starred_by": [str(uid) for uid in msg.get("starred_by", [])],
                "starred_at": msg.get("starred_at", None) and msg["starred_at"].isoformat()
            }

            # Add reply_to info if present
            reply_id = msg.get("reply_to_message_id")
            if reply_id:
                original_msg = db.messages.find_one({"_id": reply_id}, {
                    "message": 1,
                    "message_type": 1,
                    "user_id": 1
                })

                if original_msg:
                    reply_user = db.users.find_one({"_id": original_msg["user_id"]}, {"firstname": 1, "lastname": 1})
                    reply_sender = f"{reply_user.get('firstname', '')} {reply_user.get('lastname', '')}".strip() if reply_user else "Unknown"

                    message_data["reply_to"] = {
                        "message": original_msg.get("message", ""),
                        "message_type": original_msg.get("message_type", "text"),
                        "sender": reply_sender,
                        "message_id": str(original_msg["_id"])
                    }

            messages.append(message_data)

        return jsonify({"messages": messages})

    except Exception as e:
        print(f"❌ ERROR: Fetching messages failed - {e}")
        return jsonify({"error": "Something went wrong"}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx



