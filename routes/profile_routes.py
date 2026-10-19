

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
profile_bp = Blueprint('user_profile', __name__)


# ======================================== USER PROFILE ============================================
# Protected Route (Only accessible when logged in)
@profile_bp.route('/profile', methods=['GET'])
def profile():
    if 'user_id' not in session:
        return redirect(url_for('user_reg_and_login.login'))

    user_id = session.get("user_id")
    db = get_db_connection()
    user = db.users.find_one({"_id": ObjectId(user_id)}) if ObjectId.is_valid(str(user_id)) else None

    if not user:
        return redirect(url_for('user_reg_and_login.login'))

    firstname = user.get("firstname", session.get("firstname", ""))
    lastname = user.get("lastname", session.get("lastname", ""))
    staffid = user.get("staffid", session.get("staffid", ""))
    directorate = user.get("directorate", "Not Assigned")
    about = user.get("about") or "Available"
    has_custom_photo = bool(user.get("image") and ObjectId.is_valid(str(user.get("image"))))

    # Count groups user belongs to
    groups_count = db.groups.count_documents({
        "$or": [
            {"members": ObjectId(user_id)},
            {"members.user_id": ObjectId(user_id)}
        ]
    })

    return render_template(
        "profile.html",
        user_id=str(user["_id"]),
        firstname=firstname,
        lastname=lastname,
        full_name=f"{firstname} {lastname}".strip(),
        staffid=staffid,
        directorate=directorate,
        about=about,
        has_custom_photo=has_custom_photo,
        groups_count=groups_count
    )


@profile_bp.route('/profile/update', methods=['POST'])
def update_profile():
    if 'user_id' not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        user_id = session.get("user_id")
        if not ObjectId.is_valid(str(user_id)):
            return jsonify({"success": False, "error": "Invalid session user"}), 400

        data = request.get_json() or {}
        db = get_db_connection()
        update_fields = {}

        if "firstname" in data or "lastname" in data:
            firstname = (data.get("firstname") or "").strip()
            lastname = (data.get("lastname") or "").strip()
            if not firstname or not lastname:
                return jsonify({"success": False, "error": "First name and last name cannot be empty"}), 400
            update_fields["firstname"] = firstname
            update_fields["lastname"] = lastname
            session["firstname"] = firstname
            session["lastname"] = lastname

        if "about" in data:
            about = (data.get("about") or "").strip()
            if not about:
                about = "Available"
            update_fields["about"] = about[:140]

        if not update_fields:
            return jsonify({"success": False, "error": "No changes provided"}), 400

        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": update_fields}
        )

        return jsonify({
            "success": True,
            "message": "Profile updated successfully",
            "firstname": update_fields.get("firstname", session.get("firstname", "")),
            "lastname": update_fields.get("lastname", session.get("lastname", "")),
            "about": update_fields.get("about")
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@profile_bp.route('/profile/upload_photo', methods=['POST'])
def upload_profile_photo():
    if 'user_id' not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        user_id = session.get("user_id")
        if not ObjectId.is_valid(str(user_id)):
            return jsonify({"success": False, "error": "Invalid user ID"}), 400

        if "profile_picture" not in request.files:
            return jsonify({"success": False, "error": "No image file selected"}), 400

        photo = request.files["profile_picture"]
        if not photo or photo.filename == "":
            return jsonify({"success": False, "error": "No image file selected"}), 400

        ext = photo.filename.rsplit(".", 1)[-1].lower() if "." in photo.filename else ""
        if ext not in {"png", "jpg", "jpeg", "gif", "webp"}:
            return jsonify({"success": False, "error": "Only PNG, JPG, JPEG, GIF, or WEBP images are allowed"}), 400

        db = get_db_connection()
        user = db.users.find_one({"_id": ObjectId(user_id)}, {"image": 1})

        # Delete previous GridFS image if valid
        if user and user.get("image") and ObjectId.is_valid(str(user["image"])):
            try:
                fs.delete(ObjectId(user["image"]))
            except Exception:
                pass

        new_image_id = fs.put(
            photo,
            filename=secure_filename(photo.filename),
            content_type=photo.mimetype or f"image/{ext}"
        )

        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"image": str(new_image_id)}}
        )

        return jsonify({
            "success": True,
            "message": "Profile photo updated",
            "image_url": f"/profile_picture/{user_id}?t={int(datetime.utcnow().timestamp())}"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@profile_bp.route('/profile/remove_photo', methods=['POST'])
def remove_profile_photo():
    if 'user_id' not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        user_id = session.get("user_id")
        if not ObjectId.is_valid(str(user_id)):
            return jsonify({"success": False, "error": "Invalid user ID"}), 400

        db = get_db_connection()
        user = db.users.find_one({"_id": ObjectId(user_id)}, {"image": 1})

        if user and user.get("image") and ObjectId.is_valid(str(user["image"])):
            try:
                fs.delete(ObjectId(user["image"]))
            except Exception:
                pass

        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"image": None}}
        )

        return jsonify({
            "success": True,
            "message": "Profile photo removed",
            "image_url": "/static/images/default-profile.png"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@profile_bp.route('/profile/change_password', methods=['POST'])
def change_password():
    if 'user_id' not in session:
        return jsonify({"success": False, "error": "Unauthorized"}), 401

    try:
        user_id = session.get("user_id")
        data = request.get_json() or {}
        current_password = data.get("current_password") or ""
        new_password = data.get("new_password") or ""
        confirm_password = data.get("confirm_password") or ""

        if not all([current_password, new_password, confirm_password]):
            return jsonify({"success": False, "error": "All password fields are required"}), 400

        if new_password != confirm_password:
            return jsonify({"success": False, "error": "New passwords do not match"}), 400

        if len(new_password) < 4:
            return jsonify({"success": False, "error": "New password must be at least 4 characters"}), 400

        db = get_db_connection()
        user = db.users.find_one({"_id": ObjectId(user_id)})
        if not user or not check_password_hash(user.get("password", ""), current_password):
            return jsonify({"success": False, "error": "Current password is incorrect"}), 400

        db.users.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"password": generate_password_hash(new_password)}}
        )

        return jsonify({"success": True, "message": "Password changed successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
