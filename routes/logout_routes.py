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
# BLUEPRINTS NAME
# Create a blueprint for the logout routes
logout_bp = Blueprint('logout', __name__)

# ========================== LOGOUT =================================
@logout_bp.route('/logout', methods=['GET'])
def logout():
    session.clear()  # Completely clear the session
    return redirect(url_for('login'))  # Adjust to your login route name
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


# ========================== GET SESSION DATA =================================
@logout_bp.route('/get_session_data', methods=['GET'])
def get_session_data():
    """Returns the logged-in user's session data to the frontend."""
    if 'user_id' not in session:
        return jsonify({'success': False, 'error': 'Not logged in'}), 403

    return jsonify({
        'success': True,
        'user_id': session.get('user_id'),
        'firstname': session.get('firstname'),
        'lastname': session.get('lastname'),
        'staffid': session.get('staffid'),
        'group_id': session.get('group_id'),
        'private_chat_id': session.get('private_chat_id')
    })

# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


