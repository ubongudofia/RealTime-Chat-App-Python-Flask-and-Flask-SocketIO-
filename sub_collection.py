from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
# from flask_login import UserMixin
import certifi
from datetime import datetime
import datetime as dt
import pytz
import gridfs
from bson.objectid import ObjectId
import sqlite3
import os
from pymongo import MongoClient
from pymongo import UpdateOne
from bson import ObjectId

# MongoDB connection string
mongo_client = "mongodb://localhost:27017/chatDatabase"

try:
    # Connect to MongoDB with SSL certification
    client = MongoClient(mongo_client)  # Use MongoClient correctly

    # Get the database
    chat_db = client.get_database("chatDatabase")

    # Check if connection is successful by listing collections
    collections = chat_db.list_collection_names()

    print("✅ Successfully connected to MongoDB!")
    print("Collections in 'chatDatabase':", collections)
except Exception as e:
    print("❌ Error connecting to MongoDB:", e)





# =============================================================================
# MongoDB connection
client = MongoClient("mongodb://localhost:27017/")
chat_db = client["chatDatabase"]

# Define validator schema without "default"
subscription_validator = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["user_id", "endpoint", "keys", "created_at"],
        "properties": {
            "user_id": {
                "bsonType": "objectId",
                "description": "The user who owns this subscription"
            },
            "endpoint": {
                "bsonType": "string",
                "description": "Push service endpoint URL"
            },
            "keys": {
                "bsonType": "object",
                "required": ["p256dh", "auth"],
                "properties": {
                    "p256dh": {"bsonType": "string"},
                    "auth": {"bsonType": "string"}
                }
            },
            "created_at": {
                "bsonType": "date",
                "description": "When this subscription was created"
            },
            "last_used": {
                "bsonType": "date",
                "description": "Last time a notification was sent to this subscription"
            },
            "active": {
                "bsonType": "bool",
                "description": "Whether this subscription is active"
            }
        }
    }
}

# Create collection with validator
try:
    chat_db.create_collection("subscriptions", validator=subscription_validator)
    print("✅ subscriptions collection created")
except Exception as e:
    print(f"⚠️ {e}")

# Create compound index for deduplication
chat_db.subscriptions.create_index(
    [("user_id", 1), ("endpoint", 1)],
    unique=True
)

print("✅ Index on {user_id, endpoint} created")
