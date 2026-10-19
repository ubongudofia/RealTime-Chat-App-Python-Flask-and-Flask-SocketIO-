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
import mimetypes





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

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# BLUEPRINTS NAME
# Create a blueprint for the profile images routes
profile_pictures_bp = Blueprint('profile_images', __name__)

# # ====================== FILE UPLOAD =======================================================

# # xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Allowed file types (optional safety)
ALLOWED_EXTENSIONS = {
    "png", "jpg", "jpeg", "gif", "webp",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip",
    "mp4", "mp3", "wav", "ogg", "webm", "m4a", "aac"
}

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# ====================== FILE UPLOAD HANDLER (GridFS) ==========================

@profile_pictures_bp.route("/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file part"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"success": False, "error": "No selected file"}), 400

    if not allowed_file(file.filename):
        return jsonify({"success": False, "error": "File type not allowed"}), 400

    filename = secure_filename(file.filename)
    content_type = file.mimetype or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    lower_name = filename.lower()

    try:
        # Save file to GridFS
        file_id = fs.put(file, filename=filename, content_type=content_type)

        # Detect general type (image, video, audio, document, etc.)
        if content_type.startswith("audio/") or lower_name.startswith("voice_note_") or lower_name.endswith((".mp3", ".wav", ".ogg", ".m4a", ".aac")):
            file_type = "audio"
        elif content_type.startswith("image/"):
            file_type = "image"
        elif content_type.startswith("video/"):
            file_type = "video"
        else:
            file_type = "file"

        return jsonify({
            "success": True,
            "file_id": str(file_id),
            "file_name": filename,
            "file_type": file_type
        })

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ====================== FILE RETRIEVAL HANDLER ================================
@profile_pictures_bp.route("/file/<file_id>")
def get_file(file_id):
    try:
        file = fs.get(ObjectId(file_id))
        return Response(file.read(), mimetype=file.content_type)
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 404


# ============================= GET ALL GROUP PROFILE IMAGE ==================================
@profile_pictures_bp.route('/group_image/<group_id>')
def get_group_image(group_id):
    default_img_dir = os.path.join(current_app.root_path, 'static', 'images')
    try:
        db = get_db_connection()

        if not ObjectId.is_valid(group_id):  # Ensure valid ObjectId
            return send_from_directory(default_img_dir, 'dsa-logo.png')

        group = db.groups.find_one({"_id": ObjectId(group_id)}, {"image": 1})
        if not group or not group.get("image"):
            return send_from_directory(default_img_dir, 'dsa-logo.png')

        image_id = str(group["image"])
        if not ObjectId.is_valid(image_id):  # Ensure valid image ID
            return send_from_directory(default_img_dir, 'dsa-logo.png')

        try:
            image_file = fs.get(ObjectId(image_id))  # Retrieve image from GridFS
        except NoFile:
            return send_from_directory(default_img_dir, 'dsa-logo.png')

        return Response(image_file.read(), mimetype=image_file.content_type)

    except Exception as e:
        return send_from_directory(default_img_dir, 'dsa-logo.png')
    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# =================================== GET USER PROFILE PICTURE ===============================
@profile_pictures_bp.route('/profile_picture/<user_id>')
def get_profile_picture(user_id):
    default_img_dir = os.path.join(current_app.root_path, 'static', 'images')
    try:
        db = get_db_connection()

        if not ObjectId.is_valid(user_id):
            return send_from_directory(default_img_dir, 'default-profile.png')

        user = db.users.find_one({"_id": ObjectId(user_id)}, {"image": 1})

        if not user or not user.get("image"):
            return send_from_directory(default_img_dir, 'default-profile.png')

        image_id = str(user["image"])

        if not ObjectId.is_valid(image_id):
            return send_from_directory(default_img_dir, 'default-profile.png')

        try:
            image_file = fs.get(ObjectId(image_id))
        except NoFile:
            return send_from_directory(default_img_dir, 'default-profile.png')

        response = Response(image_file.read(), mimetype=image_file.content_type)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response

    except Exception as e:
        print(f"Error serving profile picture: {e}")
        return send_from_directory(default_img_dir, 'default-profile.png')


# Display in HTML
# <img src="/profile_picture/{{ user_id }}" alt="Profile Picture">

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx 