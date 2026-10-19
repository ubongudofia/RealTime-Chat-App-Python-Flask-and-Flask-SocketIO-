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
get_last_messages_bp = Blueprint('get_last_messages', __name__)


# ================================ GET LAST MESSAGES ===================================

@get_last_messages_bp.route("/get_last_message", methods=["GET"])
def get_last_message():
    db = get_db_connection()
    chat_id = request.args.get("chat_id")
    chat_type = request.args.get("chat_type")
    current_user_id = request.args.get("user_id")

    if not chat_id or chat_type not in ["group", "private"]:
        return jsonify({"error": "Invalid request"}), 400

    try:
        chat_obj_id = ObjectId(chat_id)
        current_user_obj_id = ObjectId(current_user_id) if current_user_id else None

        # Base query
        query = {
            "$or": [
                {"deleted_for_all": False},
                {"deleted_for_all": {"$exists": False}}
            ]
        }

        # Only filter out messages deleted for this user if we have their ID
        if current_user_obj_id:
            query["deleted_for_me"] = {"$nin": [current_user_obj_id]}

        if chat_type == "group":
            query["group_id"] = chat_obj_id
        else:
            query["private_chat_id"] = chat_obj_id

        # Get last message
        last_message = db.messages.find_one(query, sort=[("timestamp", -1)])

        if not last_message:
            return jsonify({
                "message": None,
                "timestamp": None,
                "is_deleted": False
            })
        
        # Format timestamp to Today / Yesterday / YYYY-MM-DD
        msg_time = last_message["timestamp"]
        if isinstance(msg_time, str):
            msg_time = datetime.fromisoformat(msg_time)
        elif not isinstance(msg_time, datetime):
            msg_time = datetime.fromtimestamp(msg_time)


        return jsonify({
            "message": "[Message deleted]" if last_message.get("deleted_for_all") else last_message.get("message"),
            "timestamp": msg_time.isoformat(),  # ✅ Always ISO format
            "is_deleted": last_message.get("deleted_for_all", False)
        })

    except Exception as e:
        print(f"Error fetching last message: {e}")
        return jsonify({"error": "Something went wrong"}), 500
