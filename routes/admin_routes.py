from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for, current_app
from pymongo import DESCENDING
from bson.objectid import ObjectId
from bson.errors import InvalidId
from werkzeug.security import generate_password_hash
from datetime import datetime, timedelta
import os
import re
import mimetypes
import gridfs

from utils.functions import get_db_connection, get_mongo_client
import config as app_config

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')


def get_gridfs():
    mongo_client = get_mongo_client()
    db = mongo_client[app_config.MONGO_DB_NAME]
    return gridfs.GridFS(db), db


def is_admin_user(user_id=None):
    """Check if the current session user has admin privileges.
    Bootstraps the first user as admin if no admin exists yet."""
    if not user_id:
        user_id = session.get("user_id")
    if not user_id or not ObjectId.is_valid(str(user_id)):
        return False

    db = get_db_connection()
    user = db.users.find_one({"_id": ObjectId(str(user_id))})
    if not user:
        return False

    # 1. Explicit admin role or flag
    if user.get("role") in ["admin", "superadmin"] or user.get("is_admin") is True:
        return True

    # 2. Staff ID starts with ADMIN or contains /ADMIN/
    staffid = str(user.get("staffid", "")).strip().upper()
    if staffid.startswith("ADMIN") or "ADMIN" in staffid:
        return True

    # 3. Bootstrap: if zero users have admin role, promote the current logged-in user
    admin_count = db.users.count_documents({
        "$or": [
            {"role": {"$in": ["admin", "superadmin"]}},
            {"is_admin": True}
        ]
    })
    if admin_count == 0:
        db.users.update_one(
            {"_id": user["_id"]},
            {"$set": {"role": "admin", "is_admin": True}}
        )
        return True

    return False


def admin_required(f):
    """Decorator to protect admin routes."""
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            if request.path.startswith("/admin/api/"):
                return jsonify({"success": False, "error": "Authentication required"}), 401
            return redirect(url_for("login"))

        if not is_admin_user(session["user_id"]):
            if request.path.startswith("/admin/api/"):
                return jsonify({"success": False, "error": "Administrator privilege required"}), 403
            return redirect("/chat")
        return f(*args, **kwargs)
    return decorated_function


# ==============================================================================
#                               ADMIN MAIN VIEW
# ==============================================================================

@admin_bp.route("")
@admin_bp.route("/")
@admin_required
def admin_dashboard():
    db = get_db_connection()
    user = db.users.find_one({"_id": ObjectId(session["user_id"])})
    admin_name = f"{user.get('firstname', '')} {user.get('lastname', '')}".strip() if user else "Admin"
    admin_staffid = user.get("staffid", "") if user else ""
    return render_template(
        "admin.html",
        admin_name=admin_name,
        admin_staffid=admin_staffid,
        user_id=session["user_id"]
    )


# ==============================================================================
#                               DASHBOARD STATS API
# ==============================================================================

@admin_bp.route("/api/stats", methods=["GET"])
@admin_required
def get_stats():
    db = get_db_connection()
    try:
        total_users = db.users.count_documents({})
        online_users = db.users.count_documents({"is_online": True})

        # New users in the last 7 days (if _id timestamp or created_at)
        one_week_ago = datetime.utcnow() - timedelta(days=7)
        new_users_week = db.users.count_documents({
            "$or": [
                {"created_at": {"$gte": one_week_ago}},
                {"_id": {"$gte": ObjectId.from_datetime(one_week_ago)}}
            ]
        })

        total_groups = db.groups.count_documents({})
        total_private_chats = db.private_chats.count_documents({})
        total_messages = db.messages.count_documents({})

        # Today's messages
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_messages = db.messages.count_documents({
            "timestamp": {"$gte": today_start}
        })

        # Messages by type breakdown
        type_pipeline = [
            {"$group": {"_id": "$message_type", "count": {"$sum": 1}}}
        ]
        type_counts = {item["_id"] or "text": item["count"] for item in db.messages.aggregate(type_pipeline)}

        # GridFS Storage
        fs_files_count = db["fs.files"].count_documents({})
        storage_pipeline = [
            {"$group": {"_id": None, "total_size": {"$sum": "$length"}}}
        ]
        storage_result = list(db["fs.files"].aggregate(storage_pipeline))
        total_bytes = storage_result[0]["total_size"] if storage_result else 0
        total_mb = round(total_bytes / (1024 * 1024), 2)

        # Directorate distribution
        dir_pipeline = [
            {"$match": {"directorate": {"$exists": True, "$ne": None, "$ne": ""}}},
            {"$group": {"_id": "$directorate", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 8}
        ]
        directorates = [{"name": item["_id"], "count": item["count"]} for item in db.users.aggregate(dir_pipeline)]

        # Recent activities (last 10 messages/events)
        recent_events = []
        recent_users = list(db.users.find({}, {"firstname": 1, "lastname": 1, "staffid": 1, "directorate": 1}).sort("_id", DESCENDING).limit(5))
        for u in recent_users:
            recent_events.append({
                "type": "user_registered",
                "title": f"New user {u.get('firstname', '')} {u.get('lastname', '')} ({u.get('staffid', '')})",
                "subtitle": f"Directorate: {u.get('directorate', 'None')}",
                "timestamp": u["_id"].generation_time.isoformat()
            })

        recent_groups = list(db.groups.find({}, {"name": 1, "created_at": 1}).sort("_id", DESCENDING).limit(5))
        for g in recent_groups:
            ts = g.get("created_at")
            if not ts:
                ts = g["_id"].generation_time
            recent_events.append({
                "type": "group_created",
                "title": f"Group '{g.get('name', 'Unnamed')}' created",
                "subtitle": "Group chat",
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts)
            })

        # Sort combined recent events by timestamp descending
        recent_events.sort(key=lambda x: x["timestamp"], reverse=True)
        recent_events = recent_events[:8]

        return jsonify({
            "success": True,
            "stats": {
                "total_users": total_users,
                "online_users": online_users,
                "new_users_week": new_users_week,
                "total_groups": total_groups,
                "total_private_chats": total_private_chats,
                "total_messages": total_messages,
                "today_messages": today_messages,
                "media_files_count": fs_files_count,
                "media_storage_mb": total_mb,
                "type_breakdown": type_counts,
                "directorates": directorates,
                "recent_events": recent_events
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               USER MANAGEMENT API
# ==============================================================================

@admin_bp.route("/api/users", methods=["GET"])
@admin_required
def get_users():
    db = get_db_connection()
    try:
        search = (request.args.get("search") or "").strip()
        directorate = request.args.get("directorate")
        role = request.args.get("role")
        status = request.args.get("status")
        page = max(1, request.args.get("page", 1, type=int))
        limit = min(100, max(10, request.args.get("limit", 20, type=int)))
        skip = (page - 1) * limit

        query = {}
        if search:
            regex = {"$regex": re.escape(search), "$options": "i"}
            query["$or"] = [
                {"firstname": regex},
                {"lastname": regex},
                {"staffid": regex},
                {"directorate": regex}
            ]

        if directorate and directorate != "all":
            query["directorate"] = directorate

        if role and role != "all":
            if role == "admin":
                query["$or"] = [{"role": "admin"}, {"is_admin": True}]
            else:
                query["$and"] = [
                    {"role": {"$ne": "admin"}},
                    {"is_admin": {"$ne": True}}
                ]

        if status and status != "all":
            if status == "online":
                query["is_online"] = True
            elif status in ["active", "suspended", "banned"]:
                query["status"] = status

        total_count = db.users.count_documents(query)
        users_cursor = db.users.find(query).sort("_id", DESCENDING).skip(skip).limit(limit)

        users_list = []
        for u in users_cursor:
            uid = str(u["_id"])
            is_adm = (u.get("role") in ["admin", "superadmin"] or u.get("is_admin") is True or str(u.get("staffid", "")).upper().startswith("ADMIN"))
            users_list.append({
                "id": uid,
                "staffid": u.get("staffid", ""),
                "firstname": u.get("firstname", ""),
                "lastname": u.get("lastname", ""),
                "fullname": f"{u.get('firstname', '')} {u.get('lastname', '')}".strip() or u.get("staffid", "User"),
                "directorate": u.get("directorate", "N/A"),
                "role": "admin" if is_adm else (u.get("role") or "user"),
                "status": u.get("status", "active"),
                "is_online": bool(u.get("is_online", False)),
                "last_seen": u.get("last_seen").isoformat() if isinstance(u.get("last_seen"), datetime) else None,
                "created_at": u["_id"].generation_time.isoformat(),
                "groups_count": len(u.get("groups", []))
            })

        return jsonify({
            "success": True,
            "users": users_list,
            "total": total_count,
            "page": page,
            "limit": limit,
            "pages": max(1, (total_count + limit - 1) // limit)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    db = get_db_connection()
    fs, _ = get_gridfs()
    try:
        data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
        staffid = (data.get("staffid") or "").strip().upper()
        fname = (data.get("firstname") or "").strip()
        lname = (data.get("lastname") or "").strip()
        directorate_name = (data.get("directorate") or "").strip()
        password = data.get("password")
        role = data.get("role", "user")
        status = data.get("status", "active")
        security_q = data.get("security_question", "What is your primary staff appointment?")
        security_a = data.get("security_answer", "DSA")

        if not staffid or not fname or not lname or not password:
            return jsonify({"success": False, "error": "Staff ID, first name, last name, and password are required"}), 400

        existing = db.users.find_one({"staffid": staffid})
        if existing:
            return jsonify({"success": False, "error": f"User with Staff ID '{staffid}' already exists"}), 400

        hashed_pw = generate_password_hash(password)
        hashed_ans = generate_password_hash(security_a)

        # Resolve directorate group if provided
        group_ids = []
        if directorate_name:
            dir_group = db.groups.find_one({"name": directorate_name})
            if dir_group:
                group_ids.append(dir_group["_id"])

        if staffid.startswith("DSA"):
            civ_group = db.groups.find_one({"name": "CIVILLIAN STAFF"})
            if civ_group and civ_group["_id"] not in group_ids:
                group_ids.append(civ_group["_id"])

        new_user_doc = {
            "staffid": staffid,
            "firstname": fname,
            "lastname": lname,
            "directorate": directorate_name,
            "password": hashed_pw,
            "role": role,
            "is_admin": (role == "admin"),
            "status": status,
            "groups": group_ids,
            "security_question": security_q,
            "security_answer": hashed_ans,
            "created_at": datetime.utcnow(),
            "is_online": False,
            "last_seen": datetime.utcnow()
        }

        # Check if avatar file uploaded
        if "avatar" in request.files and request.files["avatar"].filename:
            f = request.files["avatar"]
            fid = fs.put(f, filename=f.filename, content_type=f.content_type)
            new_user_doc["image"] = str(fid)

        res = db.users.insert_one(new_user_doc)
        new_id = res.inserted_id

        # Add to groups
        if group_ids:
            db.groups.update_many(
                {"_id": {"$in": group_ids}},
                {"$addToSet": {"members": {
                    "user_id": new_id,
                    "role": "member",
                    "joined_at": datetime.utcnow()
                }}}
            )

        return jsonify({
            "success": True,
            "message": "User created successfully",
            "user_id": str(new_id)
        }), 201

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/users/<user_id>", methods=["GET"])
@admin_required
def get_user_detail(user_id):
    if not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Invalid user ID"}), 400
    db = get_db_connection()
    try:
        u = db.users.find_one({"_id": ObjectId(user_id)})
        if not u:
            return jsonify({"success": False, "error": "User not found"}), 404

        # Resolve groups
        group_ids = [gid for gid in u.get("groups", []) if ObjectId.is_valid(str(gid))]
        groups = []
        if group_ids:
            groups_docs = db.groups.find({"_id": {"$in": [ObjectId(str(g)) for g in group_ids]}}, {"name": 1, "description": 1})
            groups = [{"id": str(g["_id"]), "name": g.get("name", "Unnamed")} for g in groups_docs]

        # Activity stats
        sent_messages_count = db.messages.count_documents({"user_id": ObjectId(user_id)})

        is_adm = (u.get("role") in ["admin", "superadmin"] or u.get("is_admin") is True or str(u.get("staffid", "")).upper().startswith("ADMIN"))

        return jsonify({
            "success": True,
            "user": {
                "id": str(u["_id"]),
                "staffid": u.get("staffid", ""),
                "firstname": u.get("firstname", ""),
                "lastname": u.get("lastname", ""),
                "fullname": f"{u.get('firstname', '')} {u.get('lastname', '')}".strip(),
                "directorate": u.get("directorate", "N/A"),
                "role": "admin" if is_adm else (u.get("role") or "user"),
                "status": u.get("status", "active"),
                "is_online": bool(u.get("is_online", False)),
                "last_seen": u.get("last_seen").isoformat() if isinstance(u.get("last_seen"), datetime) else None,
                "created_at": u["_id"].generation_time.isoformat(),
                "security_question": u.get("security_question", ""),
                "groups": groups,
                "messages_sent_count": sent_messages_count
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/users/<user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    if not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Invalid user ID"}), 400
    db = get_db_connection()
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        update_fields = {}

        if "firstname" in data:
            update_fields["firstname"] = data["firstname"].strip()
        if "lastname" in data:
            update_fields["lastname"] = data["lastname"].strip()
        if "directorate" in data:
            update_fields["directorate"] = data["directorate"].strip()
        if "role" in data:
            update_fields["role"] = data["role"]
            update_fields["is_admin"] = (data["role"] == "admin")
        if "status" in data:
            update_fields["status"] = data["status"]
        if "staffid" in data and data["staffid"].strip():
            new_staffid = data["staffid"].strip().upper()
            existing = db.users.find_one({"staffid": new_staffid, "_id": {"$ne": ObjectId(user_id)}})
            if existing:
                return jsonify({"success": False, "error": "Staff ID already in use by another user"}), 400
            update_fields["staffid"] = new_staffid

        if not update_fields:
            return jsonify({"success": False, "error": "No update fields provided"}), 400

        db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update_fields})
        return jsonify({"success": True, "message": "User updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/users/<user_id>/reset-password", methods=["POST"])
@admin_required
def reset_user_password(user_id):
    if not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Invalid user ID"}), 400
    db = get_db_connection()
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        new_password = data.get("password")
        if not new_password or len(new_password) < 4:
            return jsonify({"success": False, "error": "Password must be at least 4 characters long"}), 400

        hashed_password = generate_password_hash(new_password)
        res = db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password": hashed_password}})
        if res.matched_count == 0:
            return jsonify({"success": False, "error": "User not found"}), 404

        return jsonify({"success": True, "message": "Password reset successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/users/<user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    if not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Invalid user ID"}), 400
    if str(user_id) == str(session.get("user_id")):
        return jsonify({"success": False, "error": "Cannot delete your own administrator account"}), 400

    db = get_db_connection()
    try:
        target_obj = ObjectId(user_id)
        # 1. Remove from all groups members & admins
        db.groups.update_many(
            {},
            {
                "$pull": {
                    "members": {"user_id": target_obj},
                    "admins": target_obj
                }
            }
        )
        # 2. Clean private chats referencing this user
        db.private_chats.delete_many({
            "$or": [{"user1_id": target_obj}, {"user2_id": target_obj}]
        })
        # 3. Delete user document
        res = db.users.delete_one({"_id": target_obj})
        if res.deleted_count == 0:
            return jsonify({"success": False, "error": "User not found"}), 404

        return jsonify({"success": True, "message": "User deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               GROUPS MANAGEMENT API
# ==============================================================================

@admin_bp.route("/api/groups", methods=["GET"])
@admin_required
def get_groups():
    db = get_db_connection()
    try:
        search = (request.args.get("search") or "").strip()
        query = {}
        if search:
            query["name"] = {"$regex": re.escape(search), "$options": "i"}

        groups_cursor = db.groups.find(query).sort("_id", DESCENDING)
        groups_list = []

        for g in groups_cursor:
            gid = str(g["_id"])
            members = g.get("members", [])
            admins = g.get("admins", [])
            msg_count = db.messages.count_documents({"group_id": g["_id"]})

            # Created by name
            creator_name = "System"
            if g.get("created_by") and ObjectId.is_valid(str(g["created_by"])):
                u = db.users.find_one({"_id": ObjectId(str(g["created_by"]))}, {"firstname": 1, "lastname": 1})
                if u:
                    creator_name = f"{u.get('firstname', '')} {u.get('lastname', '')}".strip()

            created_ts = g.get("created_at")
            if not created_ts:
                created_ts = g["_id"].generation_time

            groups_list.append({
                "id": gid,
                "name": g.get("name", "Unnamed"),
                "description": g.get("description", ""),
                "image": f"/group_image/{gid}",
                "members_count": len(members),
                "admins_count": len(admins),
                "messages_count": msg_count,
                "created_by": creator_name,
                "created_at": created_ts.isoformat() if isinstance(created_ts, datetime) else str(created_ts)
            })

        return jsonify({"success": True, "groups": groups_list, "total": len(groups_list)})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups", methods=["POST"])
@admin_required
def create_group():
    db = get_db_connection()
    fs, _ = get_gridfs()
    try:
        data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
        name = (data.get("name") or "").strip()
        description = (data.get("description") or "").strip()

        if not name:
            return jsonify({"success": False, "error": "Group name is required"}), 400

        existing = db.groups.find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if existing:
            return jsonify({"success": False, "error": f"Group with name '{name}' already exists"}), 400

        creator_id = ObjectId(session["user_id"])
        image_id = None
        if "image" in request.files and request.files["image"].filename:
            img = request.files["image"]
            image_id = fs.put(img, filename=img.filename, content_type=img.content_type)

        group_doc = {
            "name": name,
            "description": description,
            "image": str(image_id) if image_id else None,
            "created_by": creator_id,
            "created_at": datetime.utcnow(),
            "members": [{
                "user_id": creator_id,
                "role": "admin",
                "joined_at": datetime.utcnow()
            }],
            "admins": [creator_id]
        }

        res = db.groups.insert_one(group_doc)
        new_gid = res.inserted_id

        # Update creator's groups list
        db.users.update_one({"_id": creator_id}, {"$addToSet": {"groups": new_gid}})

        return jsonify({
            "success": True,
            "message": "Group created successfully",
            "group_id": str(new_gid)
        }), 201

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>", methods=["GET"])
@admin_required
def get_group_details(group_id):
    if not ObjectId.is_valid(group_id):
        return jsonify({"success": False, "error": "Invalid group ID"}), 400
    db = get_db_connection()
    try:
        g = db.groups.find_one({"_id": ObjectId(group_id)})
        if not g:
            return jsonify({"success": False, "error": "Group not found"}), 404

        members_raw = g.get("members", [])
        admins_raw = [str(a) for a in g.get("admins", [])]

        # Resolve member user details
        member_user_ids = []
        for m in members_raw:
            if isinstance(m, dict) and "user_id" in m and ObjectId.is_valid(str(m["user_id"])):
                member_user_ids.append(ObjectId(str(m["user_id"])))
            elif ObjectId.is_valid(str(m)):
                member_user_ids.append(ObjectId(str(m)))

        users_map = {}
        if member_user_ids:
            for u in db.users.find({"_id": {"$in": member_user_ids}}, {"firstname": 1, "lastname": 1, "staffid": 1, "directorate": 1, "is_online": 1}):
                users_map[str(u["_id"])] = u

        members_list = []
        for m in members_raw:
            mid = str(m.get("user_id")) if isinstance(m, dict) else str(m)
            u_info = users_map.get(mid, {})
            is_adm = (mid in admins_raw) or (isinstance(m, dict) and m.get("role") == "admin")
            members_list.append({
                "user_id": mid,
                "staffid": u_info.get("staffid", ""),
                "fullname": f"{u_info.get('firstname', '')} {u_info.get('lastname', '')}".strip() or "User",
                "directorate": u_info.get("directorate", "N/A"),
                "is_admin": is_adm,
                "is_online": bool(u_info.get("is_online", False)),
                "joined_at": m.get("joined_at").isoformat() if isinstance(m, dict) and isinstance(m.get("joined_at"), datetime) else None
            })

        msg_count = db.messages.count_documents({"group_id": ObjectId(group_id)})

        return jsonify({
            "success": True,
            "group": {
                "id": str(g["_id"]),
                "name": g.get("name", "Unnamed"),
                "description": g.get("description", ""),
                "image": f"/group_image/{group_id}",
                "members": members_list,
                "members_count": len(members_list),
                "messages_count": msg_count,
                "created_at": g.get("created_at").isoformat() if isinstance(g.get("created_at"), datetime) else str(g["_id"].generation_time)
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>", methods=["PUT"])
@admin_required
def update_group(group_id):
    if not ObjectId.is_valid(group_id):
        return jsonify({"success": False, "error": "Invalid group ID"}), 400
    db = get_db_connection()
    fs, _ = get_gridfs()
    try:
        data = request.form.to_dict() if request.form else (request.get_json(silent=True) or {})
        update_fields = {}

        if "name" in data and data["name"].strip():
            update_fields["name"] = data["name"].strip()
        if "description" in data:
            update_fields["description"] = data["description"].strip()

        if "image" in request.files and request.files["image"].filename:
            img = request.files["image"]
            image_id = fs.put(img, filename=img.filename, content_type=img.content_type)
            update_fields["image"] = str(image_id)

        if not update_fields:
            return jsonify({"success": False, "error": "No update fields provided"}), 400

        db.groups.update_one({"_id": ObjectId(group_id)}, {"$set": update_fields})
        return jsonify({"success": True, "message": "Group updated successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>/members", methods=["POST"])
@admin_required
def add_group_member(group_id):
    if not ObjectId.is_valid(group_id):
        return jsonify({"success": False, "error": "Invalid group ID"}), 400
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    user_id = data.get("user_id")
    if not user_id or not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Valid user_id required"}), 400

    db = get_db_connection()
    try:
        u_obj = ObjectId(user_id)
        g_obj = ObjectId(group_id)

        # Add to group members if not already
        db.groups.update_one(
            {"_id": g_obj, "members.user_id": {"$ne": u_obj}},
            {"$addToSet": {"members": {"user_id": u_obj, "role": "member", "joined_at": datetime.utcnow()}}}
        )
        # Add to user groups
        db.users.update_one({"_id": u_obj}, {"$addToSet": {"groups": g_obj}})
        return jsonify({"success": True, "message": "Member added to group"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>/members/<user_id>", methods=["DELETE"])
@admin_required
def remove_group_member(group_id, user_id):
    if not ObjectId.is_valid(group_id) or not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Invalid group or user ID"}), 400
    db = get_db_connection()
    try:
        u_obj = ObjectId(user_id)
        g_obj = ObjectId(group_id)

        db.groups.update_one(
            {"_id": g_obj},
            {"$pull": {"members": {"user_id": u_obj}, "admins": u_obj}}
        )
        db.users.update_one({"_id": u_obj}, {"$pull": {"groups": g_obj}})
        return jsonify({"success": True, "message": "Member removed from group"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>/toggle-admin", methods=["POST"])
@admin_required
def toggle_group_admin(group_id):
    if not ObjectId.is_valid(group_id):
        return jsonify({"success": False, "error": "Invalid group ID"}), 400
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    user_id = data.get("user_id")
    if not user_id or not ObjectId.is_valid(user_id):
        return jsonify({"success": False, "error": "Valid user_id required"}), 400

    db = get_db_connection()
    try:
        u_obj = ObjectId(user_id)
        g_obj = ObjectId(group_id)
        g = db.groups.find_one({"_id": g_obj})
        if not g:
            return jsonify({"success": False, "error": "Group not found"}), 404

        admins = [str(a) for a in g.get("admins", [])]
        is_already_admin = str(u_obj) in admins

        if is_already_admin:
            db.groups.update_one({"_id": g_obj}, {"$pull": {"admins": u_obj}})
            db.groups.update_one({"_id": g_obj, "members.user_id": u_obj}, {"$set": {"members.$.role": "member"}})
            msg = "Demoted from group admin"
        else:
            db.groups.update_one({"_id": g_obj}, {"$addToSet": {"admins": u_obj}})
            db.groups.update_one({"_id": g_obj, "members.user_id": u_obj}, {"$set": {"members.$.role": "admin"}})
            msg = "Promoted to group admin"

        return jsonify({"success": True, "message": msg, "is_admin": not is_already_admin})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/groups/<group_id>", methods=["DELETE"])
@admin_required
def delete_group(group_id):
    if not ObjectId.is_valid(group_id):
        return jsonify({"success": False, "error": "Invalid group ID"}), 400
    db = get_db_connection()
    try:
        g_obj = ObjectId(group_id)
        # 1. Remove group from all users
        db.users.update_many({}, {"$pull": {"groups": g_obj}})
        # 2. Delete messages belonging to group
        db.messages.delete_many({"group_id": g_obj})
        # 3. Delete group document
        res = db.groups.delete_one({"_id": g_obj})
        if res.deleted_count == 0:
            return jsonify({"success": False, "error": "Group not found"}), 404

        return jsonify({"success": True, "message": "Group deleted successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               MESSAGE MODERATION API
# ==============================================================================

@admin_bp.route("/api/messages", methods=["GET"])
@admin_required
def get_messages():
    db = get_db_connection()
    try:
        search = (request.args.get("search") or "").strip()
        msg_type = request.args.get("type")
        chat_type = request.args.get("chat_type")
        page = max(1, request.args.get("page", 1, type=int))
        limit = min(100, max(10, request.args.get("limit", 25, type=int)))
        skip = (page - 1) * limit

        query = {}
        if search:
            query["message"] = {"$regex": re.escape(search), "$options": "i"}

        if msg_type and msg_type != "all":
            query["message_type"] = msg_type

        if chat_type and chat_type != "all":
            if chat_type == "group":
                query["group_id"] = {"$exists": True, "$ne": None}
            elif chat_type == "private":
                query["private_chat_id"] = {"$exists": True, "$ne": None}

        total_count = db.messages.count_documents(query)
        msgs_cursor = db.messages.find(query).sort("timestamp", DESCENDING).skip(skip).limit(limit)

        raw_msgs = list(msgs_cursor)

        # Batch resolve sender users
        user_ids = {m["user_id"] for m in raw_msgs if m.get("user_id") and ObjectId.is_valid(str(m["user_id"]))}
        users_map = {}
        if user_ids:
            for u in db.users.find({"_id": {"$in": list(user_ids)}}, {"firstname": 1, "lastname": 1, "staffid": 1}):
                users_map[str(u["_id"])] = u

        # Batch resolve group names
        group_ids = {m["group_id"] for m in raw_msgs if m.get("group_id") and ObjectId.is_valid(str(m["group_id"]))}
        groups_map = {}
        if group_ids:
            for g in db.groups.find({"_id": {"$in": list(group_ids)}}, {"name": 1}):
                groups_map[str(g["_id"])] = g.get("name", "Group")

        formatted_msgs = []
        for m in raw_msgs:
            uid_str = str(m.get("user_id", ""))
            u_doc = users_map.get(uid_str, {})
            sender_name = f"{u_doc.get('firstname', '')} {u_doc.get('lastname', '')}".strip() or u_doc.get("staffid", "Unknown")

            chat_label = "Private Chat"
            if m.get("group_id"):
                chat_label = f"Group: {groups_map.get(str(m['group_id']), 'Group')}"

            ts = m.get("timestamp")
            if not ts:
                ts = m["_id"].generation_time

            formatted_msgs.append({
                "id": str(m["_id"]),
                "sender_id": uid_str,
                "sender_name": sender_name,
                "sender_staffid": u_doc.get("staffid", ""),
                "chat_label": chat_label,
                "message": m.get("message") or ("[" + str(m.get("message_type", "attachment")) + "]"),
                "message_type": m.get("message_type", "text"),
                "file_id": str(m.get("file_id")) if m.get("file_id") else None,
                "file_name": m.get("file_name"),
                "status": m.get("status", "sent"),
                "is_deleted": bool(m.get("deleted_for_all", False)),
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts)
            })

        return jsonify({
            "success": True,
            "messages": formatted_msgs,
            "total": total_count,
            "page": page,
            "pages": max(1, (total_count + limit - 1) // limit)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/messages/<message_id>", methods=["DELETE"])
@admin_required
def delete_message(message_id):
    if not ObjectId.is_valid(message_id):
        return jsonify({"success": False, "error": "Invalid message ID"}), 400
    db = get_db_connection()
    try:
        # Mark as deleted for all (WhatsApp moderation style)
        res = db.messages.update_one(
            {"_id": ObjectId(message_id)},
            {"$set": {
                "deleted_for_all": True,
                "message": "This message was removed by an administrator.",
                "deleted_by_admin": True,
                "deleted_at": datetime.utcnow()
            }}
        )
        if res.matched_count == 0:
            return jsonify({"success": False, "error": "Message not found"}), 404

        return jsonify({"success": True, "message": "Message moderated and marked deleted for everyone"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               MEDIA & GRIDFS STORAGE API
# ==============================================================================

@admin_bp.route("/api/media", methods=["GET"])
@admin_required
def get_media_files():
    fs, db = get_gridfs()
    try:
        search = (request.args.get("search") or "").strip()
        category = request.args.get("category", "all")
        page = max(1, request.args.get("page", 1, type=int))
        limit = min(100, max(12, request.args.get("limit", 24, type=int)))
        skip = (page - 1) * limit

        query = {}
        if search:
            query["filename"] = {"$regex": re.escape(search), "$options": "i"}

        if category == "image":
            query["contentType"] = {"$regex": r"^image/", "$options": "i"}
        elif category == "video":
            query["contentType"] = {"$regex": r"^video/", "$options": "i"}
        elif category == "audio":
            query["$or"] = [
                {"contentType": {"$regex": r"^audio/", "$options": "i"}},
                {"filename": {"$regex": r"^voice_note_|\.(mp3|wav|ogg|m4a|aac)$", "$options": "i"}}
            ]
        elif category == "document":
            query["$and"] = [
                {"contentType": {"$not": {"$regex": r"^(image|video|audio)/"}}},
                {"filename": {"$not": {"$regex": r"^voice_note_"}}}
            ]

        total_files = db["fs.files"].count_documents(query)
        files_cursor = db["fs.files"].find(query).sort("uploadDate", DESCENDING).skip(skip).limit(limit)

        media_list = []
        for f in files_cursor:
            fid_str = str(f["_id"])
            ct = f.get("contentType") or mimetypes.guess_type(f.get("filename", ""))[0] or "application/octet-stream"
            fname = f.get("filename", "unnamed_file")

            # Determine kind
            if ct.startswith("image/"):
                kind = "image"
            elif ct.startswith("video/"):
                kind = "video"
            elif ct.startswith("audio/") or fname.startswith("voice_note_") or fname.lower().endswith((".mp3", ".wav", ".ogg", ".m4a", ".aac")):
                kind = "audio"
            else:
                kind = "document"

            size_bytes = f.get("length", 0)
            if size_bytes < 1024:
                size_str = f"{size_bytes} B"
            elif size_bytes < 1024 * 1024:
                size_str = f"{round(size_bytes / 1024, 1)} KB"
            else:
                size_str = f"{round(size_bytes / (1024 * 1024), 2)} MB"

            media_list.append({
                "id": fid_str,
                "filename": fname,
                "content_type": ct,
                "kind": kind,
                "size_bytes": size_bytes,
                "size_formatted": size_str,
                "upload_date": f.get("uploadDate").isoformat() if isinstance(f.get("uploadDate"), datetime) else None,
                "url": f"/file/{fid_str}"
            })

        return jsonify({
            "success": True,
            "media": media_list,
            "total": total_files,
            "page": page,
            "pages": max(1, (total_files + limit - 1) // limit)
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/media/<file_id>", methods=["DELETE"])
@admin_required
def delete_media_file(file_id):
    if not ObjectId.is_valid(file_id):
        return jsonify({"success": False, "error": "Invalid file ID"}), 400
    fs, db = get_gridfs()
    try:
        f_obj = ObjectId(file_id)
        fs.delete(f_obj)
        # Update messages that referenced this file
        db.messages.update_many(
            {"file_id": f_obj},
            {"$set": {"message": "[File was removed by administrator]", "file_id": None}}
        )
        return jsonify({"success": True, "message": "File deleted from GridFS successfully"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               BROADCAST ANNOUNCEMENT API
# ==============================================================================

@admin_bp.route("/api/broadcast", methods=["POST"])
@admin_required
def send_broadcast():
    db = get_db_connection()
    try:
        data = request.get_json(silent=True) or request.form.to_dict() or {}
        title = (data.get("title") or "").strip()
        body = (data.get("body") or "").strip()
        level = data.get("level", "info") # info, notice, warning, urgent
        target = data.get("target", "all") # all, directorate, group
        target_id = data.get("target_id")

        if not title or not body:
            return jsonify({"success": False, "error": "Announcement title and body are required"}), 400

        admin_user = db.users.find_one({"_id": ObjectId(session["user_id"])})
        admin_name = f"{admin_user.get('firstname', '')} {admin_user.get('lastname', '')}".strip() if admin_user else "Administrator"

        now = datetime.utcnow()
        announcement_doc = {
            "title": title,
            "body": body,
            "level": level,
            "target": target,
            "target_id": target_id,
            "created_by": ObjectId(session["user_id"]),
            "created_by_name": admin_name,
            "created_at": now
        }
        res = db["system_announcements"].insert_one(announcement_doc)

        # Distribute as system messages to target groups
        target_groups = []
        if target == "all":
            target_groups = list(db.groups.find({}, {"_id": 1}))
        elif target == "group" and target_id and ObjectId.is_valid(str(target_id)):
            target_groups = [{"_id": ObjectId(str(target_id))}]
        elif target == "directorate" and target_id:
            target_groups = list(db.groups.find({"name": str(target_id)}, {"_id": 1}))

        broadcast_msg_text = f"📢 [SYSTEM ANNOUNCEMENT: {title.upper()}]\n{body}\n— Sent by {admin_name}"

        # Insert message into target groups
        for g in target_groups:
            msg_doc = {
                "user_id": ObjectId(session["user_id"]),
                "group_id": g["_id"],
                "message": broadcast_msg_text,
                "message_type": "system",
                "display_text": broadcast_msg_text,
                "timestamp": now,
                "status": "sent",
                "read_by": [],
                "delivered_to": [],
                "is_announcement": True,
                "announcement_id": res.inserted_id
            }
            db.messages.insert_one(msg_doc)

        return jsonify({
            "success": True,
            "message": f"Broadcast announcement sent to {len(target_groups)} channel(s) successfully"
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/broadcast/history", methods=["GET"])
@admin_required
def get_broadcast_history():
    db = get_db_connection()
    try:
        announcements = list(db["system_announcements"].find({}).sort("created_at", DESCENDING).limit(30))
        history = []
        for a in announcements:
            history.append({
                "id": str(a["_id"]),
                "title": a.get("title", ""),
                "body": a.get("body", ""),
                "level": a.get("level", "info"),
                "target": a.get("target", "all"),
                "created_by_name": a.get("created_by_name", "Administrator"),
                "created_at": a.get("created_at").isoformat() if isinstance(a.get("created_at"), datetime) else str(a["_id"].generation_time)
            })
        return jsonify({"success": True, "history": history})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               DIRECTORATES API
# ==============================================================================

@admin_bp.route("/api/directorates", methods=["GET"])
@admin_required
def get_directorates():
    db = get_db_connection()
    try:
        # Distinct directorates from users and groups
        dirs_from_users = [d for d in db.users.distinct("directorate") if d]
        dirs_from_groups = [g["name"] for g in db.groups.find({}, {"name": 1})]
        combined = sorted(list(set(dirs_from_users + dirs_from_groups)))
        return jsonify({"success": True, "directorates": combined})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ==============================================================================
#                               SYSTEM HEALTH & SECURITY API
# ==============================================================================

@admin_bp.route("/api/system-health", methods=["GET"])
@admin_required
def get_system_health():
    db = get_db_connection()
    try:
        # Collection document counts
        collections_info = {
            "users": db.users.count_documents({}),
            "groups": db.groups.count_documents({}),
            "messages": db.messages.count_documents({}),
            "private_chats": db.private_chats.count_documents({}),
            "security_questions": db["security_questions"].count_documents({}),
            "gridfs_files": db["fs.files"].count_documents({}),
            "announcements": db["system_announcements"].count_documents({})
        }

        # Check VAPID status
        vapid_configured = bool(
            os.path.exists("vapid_private.pem") and os.path.exists("vapid_public.pem")
        )

        return jsonify({
            "success": True,
            "health": {
                "database_status": "Healthy / Connected",
                "database_name": app_config.MONGO_DB_NAME,
                "collections": collections_info,
                "vapid_push_configured": vapid_configured,
                "server_time": datetime.utcnow().isoformat() + "Z"
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
