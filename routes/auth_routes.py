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

user_auth_bp = Blueprint('user_reg_and_login', __name__)

# =================================== REGISTER APP ROUTE ===================================
# App Register Page Route

@user_auth_bp.route('/register')
def register():
    if "user_id" not in session:
        return redirect('/login')
    # # Fetch all groups except "CIVILLIAN STAFF" and "OFFICERS"
    # groups = list(db.groups.find(
    #     {"name": {"$nin": ["CIVILLIAN STAFF", "OFFICERS"]}},
    #     {"_id": 1, "name": 1}
    # ))

    # ✅ Only fetch specific groups allowed during registration
    allowed_groups = ["DEO", "DCS", "DNPT", "DOA", "DLSO", "DCYBER", "DFA", "DLOG", "DPPR", "DELSPACE"]
    groups = list(db.groups.find(
        {"name": {"$in": allowed_groups}},
        {"_id": 1, "name": 1}
    ))

    questions_collection = db['security_questions']
    questions = questions_collection.find()
    questions_list = [q['question'] for q in questions]

    return render_template("register.html", groups=groups, questions=questions_list)

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ====================================== REGISTRATION FORM SUBMIT ============================

@user_auth_bp.route('/submit_register', methods=['POST'])
def submit_register():
    try:
        staffid = request.form.get('staffid')
        fname = request.form.get('fname')
        lname = request.form.get('lname')
        directorate = request.form.get('group_id')
        password = request.form.get('password')
        con_password = request.form.get('con_password')
        profile_picture = request.files.get('profile_picture')
        security_question = request.form.get('security_question')
        security_answer = request.form.get('security_answer')

        if not all([staffid, fname, lname, directorate, password, con_password, profile_picture, security_question, security_answer]):
            return jsonify({"success": False, "message": "All fields are required"}), 400

        if password != con_password:
            return jsonify({"success": False, "message": "Passwords do not match"}), 400

        # Hash the password
        hashed_password = generate_password_hash(password)
        hashed_answer = generate_password_hash(security_answer)

        # Check if the user already exists
        existing_user = db.users.find_one({"staffid": staffid})
        if existing_user:
            return jsonify({"success": False, "message": "User with this Staff ID already exists"}), 400

        # Remove previous profile picture if exists
        existing_user_pic = db.users.find_one({"staffid": staffid}, {"image": 1})
        if existing_user_pic and "image" in existing_user_pic:
            fs.delete(ObjectId(existing_user_pic["image"]))

        # Store new profile picture in GridFS
        profile_picture_id = fs.put(profile_picture, filename=profile_picture.filename, content_type=profile_picture.content_type)


        # Get the selected group name
        group = db.groups.find_one({"_id": ObjectId(directorate)})
        if not group:
            return jsonify({"success": False, "error": "Invalid group selected"}), 400
        # group_name = group["name"]  # Store group name in the directorate field

        # Normalize staff ID
        staffid_upper = staffid.upper()

        # Always include the selected directorate
        group_ids = [ObjectId(directorate)]

        # Determine user group based on staff ID prefix
        if staffid_upper.startswith("DSA"):
            civillian_group = db.groups.find_one({"name": "CIVILLIAN STAFF"}, {"_id": 1})
            if not civillian_group:
                return jsonify({"success": False, "error": "CIVILLIAN STAFF group not found"}), 500
            group_ids.append(civillian_group["_id"])

        # elif staffid_upper.startswith("N"):
        #     officers_group = db.groups.find_one({"name": "OFFICERS"}, {"_id": 1})
        #     if not officers_group:
        #         return jsonify({"success": False, "error": "OFFICERS"}), 500
        #     group_ids.append(officers_group["_id"])


        # Insert new user into MongoDB
        user_data = {
            "staffid": staffid,
            "firstname": fname,
            "lastname": lname,
            "directorate": group["name"],  # Store group name in the directorate field
            "password": hashed_password,
            "image": str(profile_picture_id),  # Store the GridFS file ID
            "groups": group_ids,
            "security_question": security_question,
            "security_answer": hashed_answer,
        }
        insert_result = db.users.insert_one(user_data)
        new_user_id = insert_result.inserted_id
        

        db.groups.update_many(
            {"_id": {"$in": group_ids}},
            {"$addToSet": {"members": {
                "user_id": new_user_id,
                "role": "member",
                "joined_at": datetime.utcnow()
            }}}
        )

        # )
        return jsonify({"success": True, "message": "Registration successful!"}), 201

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ============================== LOGIN APP ROUTE =============================================

# App login Verification Route (handles both /submit_login and /login)
@user_auth_bp.route('/submit_login', methods=['POST'])
@user_auth_bp.route('/login', methods=['GET', 'POST'])
def submit_login():
    if request.method == 'GET':
        if "user_id" in session:
            try:
                user = users.find_one({"_id": ObjectId(session["user_id"])})
                if user:
                    from routes.admin_routes import is_admin_user
                    if is_admin_user(str(user["_id"])):
                        return redirect("/admin")
                    return redirect("/chat")
                session.clear()
            except Exception:
                session.clear()
        return render_template("login.html")

    data = request.get_json(silent=True) or request.form.to_dict() or {}
    staffid = (data.get("staffid") or "").strip()
    password = (data.get("password") or "").strip()
    remember_me = data.get("remember", False)
    if isinstance(remember_me, str):
        remember_me = remember_me.lower() in ("true", "1", "on", "yes")

    is_ajax = request.is_json or request.headers.get("X-Requested-With") == "XMLHttpRequest"

    if not staffid or not password:
        if is_ajax:
            return jsonify({"success": False, "error": "Missing credentials"}), 400
        return render_template("login.html", error="Staff ID and password are required")

    # Case-insensitive lookup with trimmed staffid
    user = users.find_one({"staffid": {"$regex": f"^{re.escape(staffid)}$", "$options": "i"}})

    if not user:
        if is_ajax:
            return jsonify({"success": False, "error": "User not found"}), 404
        return render_template("login.html", error="User not found")

    stored_password = user.get("password")
    if not stored_password or not check_password_hash(stored_password, password):
        if is_ajax:
            return jsonify({"success": False, "error": "Invalid credentials"}), 401
        return render_template("login.html", error="Invalid credentials")

    # Store session details
    session['user_id'] = str(user["_id"])
    session['firstname'] = user.get('firstname', '')
    session['lastname'] = user.get('lastname', '')
    session['staffid'] = user.get('staffid', '')

    from routes.admin_routes import is_admin_user
    is_admin = is_admin_user(str(user["_id"]))
    session['is_admin'] = is_admin

    if remember_me:
        session.permanent = True  # Keeps cookie for permanent_session_lifetime
        current_app.permanent_session_lifetime = timedelta(days=30)

    redirect_target = "/admin" if is_admin else "/chat"

    if is_ajax:
        return jsonify({"success": True, "redirect": redirect_target})
    return redirect(redirect_target)
    
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

