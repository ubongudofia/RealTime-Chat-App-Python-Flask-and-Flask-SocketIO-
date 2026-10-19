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
# import datetime

# MongoDB connection string
mongo_client = "mongodb://localhost:27017/chatDatabase"
# mongo_client = "mongodb://192.168.1.173/chatDatabase"

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
client = MongoClient("mongodb://192.168.1.173/chatDatabase")
chat_db = client["chatDatabase"]
messages_collection = chat_db["messages"]
groups = chat_db["groups"]


# indexes
# Ensure you have these indexes for better performance
# chat_db.messages.create_index([("group_id", 1), ("read_by", 1)])
# chat_db.messages.create_index([("private_chat_id", 1), ("read_by", 1)])
# chat_db.messages.create_index([("status", 1)])
# ======================================================================

# FIRST MIGRATION SCRIPT TO ADD file_id FIELD TO MESSAGES COLLECTION

# Update all documents that don't have file_id
# result = messages_collection.update_many(
#     {"file_id": {"$exists": False}},
#     {"$set": {"file_id": None}}
# )

# print(f"✅ Migration complete. Modified {result.modified_count} documents.")

# ===================================================================================

# # SECOND MIGRATION SCRIPT TO ADD file_name FIELD TO MESSAGES COLLECTION
# SUPPORTED_MEDIA_TYPES = ["file", "image", "video", "audio"]

# def migrate_files_to_file_name():
#     cursor = messages_collection.find({
#         "message_type": {"$in": SUPPORTED_MEDIA_TYPES},
#         "message": {"$regex": r"^/uploads/"}  # only old-style uploads
#     })

#     count = 0
#     for msg in cursor:
#         file_path = msg.get("message")
#         if not file_path:
#             continue

#         # Extract the filename only (e.g. "amao.jpeg")
#         file_name = os.path.basename(file_path)

#         update_data = {
#             "$set": {"file_name": file_name},
#             "$unset": {"message": ""}  # removes the old message path
#         }

#         messages_collection.update_one({"_id": msg["_id"]}, update_data)
#         count += 1
#         print(f"✅ Migrated {msg['_id']} → file_name={file_name}")

#     print(f"\n🎉 Migration complete. {count} documents updated.")

# migrate_files_to_file_name()



# ===============================================================================================
# bad_groups = []

# for group in groups.find():
#     for member in group.get("members", []):
#         if isinstance(member, dict):
#             # Proper structure, check if user_id is still wrapped in a dict
#             if isinstance(member.get("user_id"), dict):
#                 bad_groups.append(group["_id"])
#                 break
#         elif isinstance(member, ObjectId):
#             # Member is stored directly as ObjectId (invalid schema)
#             bad_groups.append(group["_id"])
#             break

# print("Groups with bad members:", bad_groups)


# bad_groups = [
#     ObjectId('67c9082132874336da385fd1'), 
#     ObjectId('67c9082232874336da385fd2'), 
#     ObjectId('67c9082232874336da385fd3'), 
#     ObjectId('67c9082232874336da385fd4'), 
#     ObjectId('67c9082332874336da385fda')
# ]

# for group_id in bad_groups:
#     group = groups.find_one({"_id": group_id})
#     if not group:
#         continue

#     fixed_members = []
#     changed = False

#     for member in group.get("members", []):
#         # Case 1: Member is directly an ObjectId (bad)
#         if isinstance(member, ObjectId):
#             fixed_members.append({
#                 "user_id": member,
#                 "role": "member",
#                 "joined_at": datetime.utcnow()
#             })
#             changed = True

#         # Case 2: Member is a dict but user_id is still a dict with $oid
#         elif isinstance(member, dict) and isinstance(member.get("user_id"), dict):
#             raw_oid = member["user_id"].get("$oid")
#             if raw_oid:
#                 fixed_members.append({
#                     "user_id": ObjectId(raw_oid),
#                     "role": member.get("role", "member"),
#                     "joined_at": member.get("joined_at", datetime.utcnow())
#                 })
#                 changed = True
#             else:
#                 fixed_members.append(member)  # keep as is if not broken

#         # Case 3: Already valid
#         else:
#             fixed_members.append(member)

#     if changed:
#         groups.update_one({"_id": group_id}, {"$set": {"members": fixed_members}})
#         print(f"✅ Fixed group {group_id}")
#     else:
#         print(f"✔️ No changes needed for group {group_id}")



# ==============================================UPDATE ON GROUPS FIELD=====================================


# UPDATE GROUP FIELD IN GRROUPS COLLECTION
# import datetime as dt  # Add this import

# # run migration
# for group in groups.find({}):
#     updates = {}

#     # 1. Ensure description exists
#     if "description" not in group:
#         updates["description"] = ""

#     # 2. Set created_by (default: first member if not defined)
#     if "created_by" not in group:
#         creator = group["members"][0] if group.get("members") else None
#         updates["created_by"] = creator

#     # 3. Setup admins (default: created_by)
#     if "admins" not in group:
#         updates["admins"] = [updates["created_by"]]

#     # 4. Convert members from list of ObjectIds → list of objects
#     new_members = []
#     for m in group.get("members", []):
#         uid = m if isinstance(m, ObjectId) else ObjectId(m["$oid"]) if "$oid" in m else m

#         role = "admin" if uid == updates["created_by"] else "member"

#         # Fix: Use datetime.datetime.strptime() instead of datetime.strptime()
#         new_members.append({
#             "user_id": uid,
#             "role": role,
#             "joined_at": datetime.strptime(group["timestamp"], "%Y-%m-%d %H:%M:%S")
#         })

#     updates["members"] = new_members

#     # 5. Add default settings
#     if "settings" not in group:
#         updates["settings"] = {
#             "who_can_add_members": "admins",
#             "who_can_change_info": "admins"
#         }

#     # 6. Convert timestamp string → ISODate
#     if isinstance(group.get("timestamp"), str):
#         updates["timestamp"] = datetime.strptime(group["timestamp"], "%Y-%m-%d %H:%M:%S")

#     # Apply updates
#     groups.update_one({"_id": group["_id"]}, {"$set": updates})

# print("✅ Migration complete!")
# # =============================================================================




# ====================================================================================================

# def add_forwarding_fields():
#     # Get all messages that don't have the 'forwarded' field
#     query = {'forwarded': {'$exists': False}}
    
#     # Create bulk operations for efficient update
#     bulk_operations = []
    
#     # Get total count for progress tracking
#     total_messages = messages_collection.count_documents(query)
#     print(f"Found {total_messages} messages to update")
    
#     # Batch processing parameters
#     batch_size = 1000
#     processed = 0
    
#     # Process in batches to avoid memory issues
#     for message in messages_collection.find(query).batch_size(batch_size):
#         bulk_operations.append(
#             UpdateOne(
#                 {'_id': message['_id']},
#                 {
#                     '$set': {
#                         'forwarded': False,  # Default to False for existing messages
#                         'forwarded_from': None,  # No forwarding info for existing messages
#                         'forward_source': None,  # No source for existing messages
#                         'original_sender': message['user_id']  # Original sender is the message author
#                     }
#                 }
#             )
#         )
        
#         processed += 1
#         if processed % batch_size == 0:
#             # Execute batch update
#             result = messages_collection.bulk_write(bulk_operations)
#             print(f"Processed {processed}/{total_messages} messages. Modified {result.modified_count} documents")
#             bulk_operations = []
    
#     # Process remaining operations
#     if bulk_operations:
#         result = messages_collection.bulk_write(bulk_operations)
#         print(f"Processed final batch. Modified {result.modified_count} documents")
    
#     print(f"Completed! Updated {processed} messages")


# add_forwarding_fields()













# Update all messages that don't have the starred fields
# result = messages_collection.update_many(
#     {"starred": {"$exists": False}}, 
#     {
#         "$set": {
#             "starred": False,
#             "starred_by": [],
#             "starred_at": None
#         }
#     }
# )

# print(f"Updated {result.modified_count} messages with new starred fields.")

# result = messages_collection.update_many(
#     {},
#     {
#         "$set": {
#             "deleted_for_me": [],
#             "deleted_for_all": False,
#             "deleted_at": None,
#             "deleted_by": None
#         }
#     }
# )

# print(f"Updated {result.modified_count} documents")

# # =====================================================================================

# SCRIPT TO CREATE A GROUP FOR CIVILLIAN STAFF
from pymongo import MongoClient
from bson.objectid import ObjectId    


from datetime import datetime

# groups_collection = chat_db['groups']  # or 'groups' if that's more accurate

# new_group = {
#    "name": "DELSPACE",
#    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),  # same format as sample
#    "image": "/static/images/dsa-logo.png"
# }

# result = groups_collection.insert_one(new_group)
# print(f"Inserted new group with ID: {result.inserted_id}")



# =======================================================================================

# collection = chat_db["security_questions"]

# List of security questions
# questions = [
#     "What was the name of your first pet?",
#     "What is the name of the street you grew up on?",
#     "What was the model of your first car?",
#     "What was your childhood nickname?",
#     "What school did you attend for sixth grade?",
#     "What was the name of your elementary school?",
#     "What is your mother’s maiden name?",
#     "What is the name of your oldest cousin?",
#     "What is your father’s middle name?",
#     "What was the name of your first teacher?",
#     "What was the name of your best friend in childhood?",
#     "In what city were you born?",
#     "What year did you graduate high school?",
#     "What was the destination of your first flight?",
#     "What is the month and year of your oldest sibling’s birthday?",
#     "What is your favorite movie?",
#     "What is your favorite book as a child?",
#     "What is your favorite food?",
#     "What was your favorite subject in school?",
#     "What is your dream job?",
#     "What was the first website you remember visiting?",
#     "What is the name of your favorite childhood toy?",
#     "Who was your favorite cartoon character growing up?",
#     "What was the name of the first concert you attended?",
#     "What was your first job?"
# ]

# # Prepare documents
# documents = [{"question": q} for q in questions]

# # Insert into the collection
# result = collection.insert_many(documents)
# print(f"Inserted {len(result.inserted_ids)} security questions.")


# ============================================================================

# users_collection = chat_db['users']

# Update all users that don't have security_question and security_answer fields
# result = users_collection.update_many(
#     {
#         "$or": [
#             {"security_question": {"$exists": False}},
#             {"security_answer": {"$exists": False}}
#         ]
#     },
#     {
#         "$set": {
#             "security_question": "",
#             "security_answer": ""
#         }
#     }
# )

# print(f"Updated {result.modified_count} user(s) with empty security fields.")


# Update all users that don't have security_question and security_answer fields

# from pymongo import MongoClient

# # MongoDB connection
# client = MongoClient("mongodb://localhost:27017/")
# chat_db = client["chatDatabase"]
# groups_collection = chat_db['groups']

# # Update groups that don't have a "members" field
# result = groups_collection.update_many(
#     {
#         "members": {"$exists": False}
#     },
#     {
#         "$set": {
#             "members": []
#         }
#     }
# )

# print(f"Updated {result.modified_count} group(s) with empty 'members' fields.")




# ============================================================================

# SCRIPT TO CREATE A GROUP FOR CIVILLIAN STAFF
# from pymongo import MongoClient
# from bson.objectid import ObjectId    


from datetime import datetime

# groups_collection = chat_db['groups']  # or 'groups' if that's more accurate

# new_group = {
#     "name": "TRAIN THE TRAINER",
#     "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),  # same format as sample
#     "image": "/static/images/savl-logo.png"
# }

# result = groups_collection.insert_one(new_group)
# print(f"Inserted new group with ID: {result.inserted_id}")



# ==============================================================================





# Connect to SQLite
# sqlite_conn = sqlite3.connect("chatdatabase.db")
# sqlite_cursor = sqlite_conn.cursor()





# # Get the database
# chat_db = client.get_database("chatDatabase")
# messages_collection = chat_db["messages"]

# # Add is_read field to all messages that don't have it
# result = messages_collection.update_many(
#     {"reply_to_message_id": {"$exists": False}},  # Target only documents that lack this field
#     {"$set": {"reply_to_message_id": False}}
# )

# print(f"Updated {result.modified_count} messages with reply_to_message_id=False.")










# # Connect to MongoDB with GridFS
# mongo_client = MongoClient("mongodb+srv://udofiaubong10:qAWzNlJT6x2vSCdb@dsamessenger.tqp9u.mongodb.net", tlsCAFile=certifi.where())
# mongo_db = mongo_client["chatDatabase"]
# fs = gridfs.GridFS(mongo_db)

# # Create indexes for faster message retrieval
# mongo_db.messages.create_index([("group_id", 1)])
# mongo_db.messages.create_index([("private_chat_id", 1)])
# mongo_db.messages.create_index([("timestamp", -1)])

# print("✅ Indexes created successfully!")













# groups_collection = mongo_db["groups"]
# fs = gridfs.GridFS(mongo_db)


# # Define a default image ID or URL
# default_image_url = "/static/images/dsa-logo.png"  # Default image URL

# # Update all groups to include an image field
# result = groups_collection.update_many(
#     {},  # Empty filter means update all documents
#     {"$set": {"image": default_image_url}}  # Set default image field
# )

# print(f"Updated {result.modified_count} groups with an image field.")














# # Define the Civillian Staff Group ID
# civillian_staff_group_id = ObjectId("67c9082332874336da385fda")

# # Update all users by adding the 'groups' field and including the Civillian Staff group
# mongo_db.users.update_many(
#     {"groups": {"$exists": False}},  # Only users without the field will be updated
#     {"$set": {"groups": [civillian_staff_group_id]}}  # Add the general group
# )


# # Step 2: Migrate Users
# sqlite_cursor.execute("SELECT id, staffid, firstname, lastname, directorate, password, timestamp FROM users")
# users_mapping = {}  # SQLite user_id → MongoDB _id

# for user in sqlite_cursor.fetchall():
#     user_id, staffid, firstname, lastname, directorate, password, timestamp = user

#     # Image Handling - Store latest profile image in GridFS
#     image_id = None
#     image_path = os.path.normpath(f"uploads/{staffid}.jpg")  # Normalize path

#     if os.path.isfile(image_path):
#         with open(image_path, "rb") as image_file:
#             image_id = fs.put(image_file, filename=f"{staffid}.jpg")  # Overwrites old image
#     else:
#         print(f"⚠️ No profile image found for {staffid}, skipping...")

#     mongo_user_id = mongo_db.users.insert_one({
#         "staffid": staffid,
#         "firstname": firstname,
#         "lastname": lastname,
#         "directorate": directorate,
#         "password": password,
#         "timestamp": timestamp,
#         "image_id": str(image_id) if image_id else None  # Store GridFS image ID
#     }).inserted_id

#     users_mapping[user_id] = mongo_user_id  # Store user mapping

# print("✅ Users migrated successfully!")



# # Step 1: Migrate Groups and Store Mapping (SQLite id → MongoDB _id)
# sqlite_cursor.execute("SELECT id, name, timestamp FROM groups")
# group_mapping = {}

# for group in sqlite_cursor.fetchall():
#     sqlite_group_id, group_name, timestamp = group
#     mongo_group_id = mongo_db.groups.insert_one({
#         "name": group_name,
#         "timestamp": timestamp
#     }).inserted_id
#     group_mapping[sqlite_group_id] = mongo_group_id  # Store mapping

# print("✅ Groups migrated successfully!")



# # Step 3: Migrate User-Group Relationships
# sqlite_cursor.execute("SELECT user_id, group_id FROM user_groups")

# for user_id, group_id in sqlite_cursor.fetchall():
#     if user_id in users_mapping and group_id in group_mapping:
#         mongo_db.users.update_one(
#             {"_id": users_mapping[user_id]},
#             {"$addToSet": {"groups": group_mapping[group_id]}}
#         )

# print("✅ User-group relationships migrated!")



# # Step 4: Migrate Private Chats
# sqlite_cursor.execute("SELECT id, user1_id, user2_id FROM private_chats")
# private_chats = sqlite_cursor.fetchall()

# for chat in private_chats:
#     chat_id, user1_id, user2_id = chat

#     if user1_id in users_mapping and user2_id in users_mapping:
#         mongo_db.private_chats.insert_one({
#             "_id": ObjectId(),  # Generate a new ObjectId instead of using chat_id
#             "user1_id": users_mapping[user1_id],  # Map SQLite ID to MongoDB ObjectId
#             "user2_id": users_mapping[user2_id]   # Map SQLite ID to MongoDB ObjectId
#         })

# print("✅ Private chats migrated successfully!")



# # Step 4: Migrate Messages
# sqlite_cursor.execute("SELECT id, user_id, group_id, private_chat_id, message, message_type, timestamp FROM messages")

# for message in sqlite_cursor.fetchall():
#     msg_id, user_id, group_id, private_chat_id, message_text, message_type, timestamp = message

#     # Determine correct group or private chat reference
#     mongo_group_id = group_mapping.get(group_id, None)
#     mongo_private_chat_id = None if private_chat_id is None else ObjectId()

#     # Handle media files (images, videos, audio, etc.)
#     file_id = None
#     if message_type in ("image", "file", "audio", "video"):
#         file_path = os.path.normpath(f"uploads/{message_text}")  # Normalize path

#         if os.path.isfile(file_path):
#             with open(file_path, "rb") as file:
#                 file_id = fs.put(file, filename=message_text)  # Store in GridFS
#         else:
#             print(f"⚠️ File {file_path} not found, skipping...")

#     # Insert message into MongoDB
#     mongo_db.messages.insert_one({
#         "user_id": users_mapping[user_id],
#         "group_id": mongo_group_id,
#         "private_chat_id": mongo_private_chat_id,
#         "message": message_text if message_type == "text" else None,
#         "file_id": str(file_id) if file_id else None,
#         "message_type": message_type,
#         "timestamp": timestamp
#     })

# print("✅ Messages migrated successfully!")



# # Close connections
# sqlite_conn.close()
# mongo_client.close()