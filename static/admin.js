/**
 * DSA MESSENGER - MODERN ADMIN CONSOLE SCRIPT
 * Complete feature control for users, groups, message moderation, media, broadcasts, and system health.
 */

document.addEventListener("DOMContentLoaded", () => {
    initAdminConsole();
});

let currentUsersPage = 1;
let currentMessagesPage = 1;
let currentMediaPage = 1;
let allDirectorates = [];

function initAdminConsole() {
    setupTabNavigation();
    setupMobileSidebar();
    setupLogoutButton();
    loadDashboardStats();
    loadDirectorates();

    // Auto-refresh stats every 45 seconds
    setInterval(() => {
        const activeTab = document.querySelector(".admin-nav-item.active")?.dataset.tab;
        if (activeTab === "dashboard") {
            loadDashboardStats(true);
        }
    }, 45000);
}

/* ==========================================================================
   ADMIN LOGOUT
   ========================================================================== */

function setupLogoutButton() {
    const btn = document.getElementById("adminLogoutBtn");
    if (btn) {
        btn.addEventListener("click", handleAdminLogout);
    }
}

function handleAdminLogout(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const btn = document.getElementById("adminLogoutBtn");
    if (btn) {
        btn.style.pointerEvents = "none";
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Logging out...`;
    }

    // Clear client-side session and cached state
    try {
        sessionStorage.clear();
        localStorage.removeItem("active_chat_id");
        localStorage.removeItem("active_chat_type");
    } catch (e) {
        console.warn("Storage cleanup error:", e);
    }

    // Call server-side /logout to destroy Flask session and redirect
    fetch("/logout", {
        method: "GET",
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" }
    })
    .finally(() => {
        window.location.replace("/login");
    });
}

/* ==========================================================================
   TOAST NOTIFICATION HELPER
   ========================================================================== */

function showToast(message, type = "success") {
    let container = document.getElementById("adminToastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "adminToastContainer";
        container.className = "admin-toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `admin-toast ${type}`;

    let iconClass = "ri-checkbox-circle-fill";
    if (type === "error") iconClass = "ri-error-warning-fill";
    if (type === "warning") iconClass = "ri-alert-fill";

    toast.innerHTML = `
        <i class="${iconClass} toast-icon"></i>
        <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        setTimeout(() => toast.remove(), 250);
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ==========================================================================
   TAB NAVIGATION
   ========================================================================== */

function setupTabNavigation() {
    const navItems = document.querySelectorAll(".admin-nav-item");
    const tabPanes = document.querySelectorAll(".admin-tab-pane");
    const headerTitle = document.getElementById("headerTitle");
    const headerSubtitle = document.getElementById("headerSubtitle");

    navItems.forEach(item => {
        item.addEventListener("click", (e) => {
            e.preventDefault();
            const tabId = item.dataset.tab;
            if (!tabId) return;

            navItems.forEach(n => n.classList.remove("active"));
            item.classList.add("active");

            tabPanes.forEach(pane => {
                pane.classList.remove("active");
                if (pane.id === `tab-${tabId}`) {
                    pane.classList.add("active");
                }
            });

            // Update Header labels
            switch (tabId) {
                case "dashboard":
                    headerTitle.textContent = "Dashboard Overview";
                    headerSubtitle.textContent = "Real-time metrics, system volume and activity feed";
                    loadDashboardStats();
                    break;
                case "users":
                    headerTitle.textContent = "User Management";
                    headerSubtitle.textContent = "Manage staff accounts, roles, access statuses and credentials";
                    loadUsers();
                    break;
                case "groups":
                    headerTitle.textContent = "Groups & Directorates";
                    headerSubtitle.textContent = "Manage team channels, directorate groups, admins and memberships";
                    loadGroups();
                    break;
                case "messages":
                    headerTitle.textContent = "Message Moderation";
                    headerSubtitle.textContent = "Audit chat activity, search contents, and enforce moderation policies";
                    loadMessages();
                    break;
                case "media":
                    headerTitle.textContent = "Media & Storage Explorer";
                    headerSubtitle.textContent = "Inspect photos, voice notes, videos and files stored in GridFS";
                    loadMedia();
                    break;
                case "broadcast":
                    headerTitle.textContent = "Broadcast Announcements";
                    headerSubtitle.textContent = "Dispatch critical alerts and bulletins system-wide or to channels";
                    loadBroadcastHistory();
                    break;
                case "system":
                    headerTitle.textContent = "System Health & Security";
                    headerSubtitle.textContent = "Monitor database health, push credentials and connection status";
                    loadSystemHealth();
                    break;
            }

            // Close mobile sidebar if open
            document.querySelector(".admin-sidebar")?.classList.remove("open");
        });
    });
}

function switchTab(tabId) {
    const item = document.querySelector(`.admin-nav-item[data-tab="${tabId}"]`);
    if (item) item.click();
}

function setupMobileSidebar() {
    const toggleBtn = document.getElementById("toggleSidebarBtn");
    const sidebar = document.querySelector(".admin-sidebar");
    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener("click", () => {
            sidebar.classList.toggle("open");
        });
    }
}

/* ==========================================================================
   DIRECTORATES FETCHING
   ========================================================================== */

async function loadDirectorates() {
    try {
        const res = await fetch("/admin/api/directorates");
        const data = await res.json();
        if (data.success && Array.isArray(data.directorates)) {
            allDirectorates = data.directorates;
            populateDirectoratesDropdowns();
        }
    } catch (err) {
        console.error("Failed loading directorates:", err);
    }
}

function populateDirectoratesDropdowns() {
    // 1. User filter dropdown
    const filterSelect = document.getElementById("userDirFilter");
    if (filterSelect) {
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">All Directorates</option>';
        allDirectorates.forEach(d => {
            filterSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
        filterSelect.value = currentVal || "all";
    }

    // 2. User Create / Edit directorate select
    const formDirSelect = document.getElementById("userFormDirectorate");
    if (formDirSelect) {
        formDirSelect.innerHTML = '<option value="">Select Directorate</option>';
        allDirectorates.forEach(d => {
            formDirSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
    }

    const editDirSelect = document.getElementById("editUserDirectorate");
    if (editDirSelect) {
        editDirSelect.innerHTML = '<option value="">Select Directorate</option>';
        allDirectorates.forEach(d => {
            editDirSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
    }

    // 3. Broadcast target directorate select
    const broadcastDirSelect = document.getElementById("broadcastDirectorateSelect");
    if (broadcastDirSelect) {
        broadcastDirSelect.innerHTML = '<option value="">Select Target Directorate</option>';
        allDirectorates.forEach(d => {
            broadcastDirSelect.innerHTML += `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`;
        });
    }
}

/* ==========================================================================
   1. DASHBOARD OVERVIEW
   ========================================================================== */

async function loadDashboardStats(isBackground = false) {
    try {
        const res = await fetch("/admin/api/stats");
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const s = data.stats;

        // KPI values
        document.getElementById("statTotalUsers").textContent = s.total_users.toLocaleString();
        document.getElementById("statOnlineUsers").textContent = `${s.online_users} online now`;
        document.getElementById("headerOnlineCount").textContent = `${s.online_users} Online`;
        document.getElementById("badgeOnlineCount").textContent = s.online_users;

        document.getElementById("statTotalGroups").textContent = s.total_groups.toLocaleString();
        document.getElementById("statTotalChats").textContent = `${s.total_private_chats} 1-on-1 private chats`;

        document.getElementById("statTotalMessages").textContent = s.total_messages.toLocaleString();
        document.getElementById("statTodayMessages").textContent = `+${s.today_messages} sent today`;

        document.getElementById("statMediaStorage").textContent = `${s.media_storage_mb} MB`;
        document.getElementById("statMediaFiles").textContent = `${s.media_files_count} files in GridFS`;

        // Message type breakdown bars
        const total = s.total_messages || 1;
        const types = s.type_breakdown || {};
        const textCount = types["text"] || 0;
        const imgCount = types["image"] || 0;
        const vidCount = types["video"] || 0;
        const audioCount = (types["audio"] || 0) + (types["voice"] || 0);
        const fileCount = (types["file"] || 0) + (types["document"] || 0);

        renderBreakdownRow("barText", "countText", textCount, total, "Text Messages", "#008069");
        renderBreakdownRow("barImage", "countImage", imgCount, total, "Photos & Images", "#3b82f6");
        renderBreakdownRow("barVoice", "countVoice", audioCount, total, "Voice Notes & Audio", "#8b5cf6");
        renderBreakdownRow("barVideo", "countVideo", vidCount, total, "Videos", "#f59e0b");
        renderBreakdownRow("barFile", "countFile", fileCount, total, "Documents & Files", "#64748b");

        // Directorates tag cloud
        const dirContainer = document.getElementById("directoratesTagCloud");
        if (dirContainer && Array.isArray(s.directorates)) {
            dirContainer.innerHTML = s.directorates.map(d => `
                <div class="dir-tag">
                    ${escapeHtml(d.name)}
                    <span>${d.count}</span>
                </div>
            `).join("");
        }

        // Recent Activity Feed
        const actContainer = document.getElementById("recentActivityList");
        if (actContainer && Array.isArray(s.recent_events)) {
            if (s.recent_events.length === 0) {
                actContainer.innerHTML = "<p class='text-muted' style='font-size:13px;'>No recent events logged yet.</p>";
            } else {
                actContainer.innerHTML = s.recent_events.map(ev => {
                    const isUser = ev.type === "user_registered";
                    const icon = isUser ? "ri-user-add-line" : "ri-team-line";
                    const iconClass = isUser ? "user" : "group";
                    const timeAgo = formatTimeAgo(ev.timestamp);
                    return `
                        <li class="activity-item">
                            <div class="activity-icon ${iconClass}">
                                <i class="${icon}"></i>
                            </div>
                            <div class="activity-details">
                                <div class="activity-title">${escapeHtml(ev.title)}</div>
                                <div class="activity-sub">${escapeHtml(ev.subtitle)}</div>
                                <div class="activity-time">${timeAgo}</div>
                            </div>
                        </li>
                    `;
                }).join("");
            }
        }

        if (!isBackground) {
            // Updated successfully
        }
    } catch (err) {
        console.error("Dashboard stats error:", err);
        if (!isBackground) showToast("Failed to load dashboard metrics", "error");
    }
}

function renderBreakdownRow(barId, countId, count, total, label, color) {
    const barEl = document.getElementById(barId);
    const countEl = document.getElementById(countId);
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    if (barEl) {
        barEl.style.width = `${pct}%`;
        barEl.style.backgroundColor = color;
    }
    if (countEl) {
        countEl.textContent = `${count.toLocaleString()} (${pct}%)`;
    }
}

/* ==========================================================================
   2. USER MANAGEMENT
   ========================================================================== */

async function loadUsers(page = 1) {
    currentUsersPage = page;
    const search = document.getElementById("userSearchInput")?.value.trim() || "";
    const directorate = document.getElementById("userDirFilter")?.value || "all";
    const role = document.getElementById("userRoleFilter")?.value || "all";
    const status = document.getElementById("userStatusFilter")?.value || "all";

    const tbody = document.getElementById("usersTableBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px;"><i class="ri-loader-4-line ri-spin" style="font-size:24px; color:var(--primary);"></i><p style="font-size:13px; color:var(--text-muted); margin-top:8px;">Loading staff directory...</p></td></tr>`;
    }

    try {
        const query = new URLSearchParams({
            search,
            directorate,
            role,
            status,
            page,
            limit: 15
        });

        const res = await fetch(`/admin/api/users?${query}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        renderUsersTable(data.users);
        renderPagination("usersPagination", data.page, data.pages, data.total, (p) => loadUsers(p));
    } catch (err) {
        console.error("Load users error:", err);
        showToast("Error loading users", "error");
        if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px; color:var(--danger);">Failed to load users: ${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 32px; color:var(--text-muted); font-size:13.5px;"><i class="ri-user-search-line" style="font-size:32px; display:block; margin-bottom:8px;"></i>No staff members match the selected criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(u => {
        const roleBadge = u.role === "admin"
            ? `<span class="badge badge-admin"><i class="ri-shield-star-fill"></i> Admin</span>`
            : `<span class="badge badge-user"><i class="ri-user-line"></i> User</span>`;

        const statusBadge = u.status === "active"
            ? `<span class="badge badge-active"><i class="ri-checkbox-circle-line"></i> Active</span>`
            : `<span class="badge badge-suspended"><i class="ri-close-circle-line"></i> ${escapeHtml(u.status)}</span>`;

        const onlineDot = u.is_online ? `<span class="user-cell-online" title="Online now"></span>` : "";

        return `
            <tr>
                <td>
                    <div class="user-cell">
                        <div style="position:relative;">
                            <img class="user-cell-avatar" src="/profile_picture/${u.id}" alt="" onerror="this.src='/static/images/default-profile.png'">
                            ${onlineDot}
                        </div>
                        <div class="user-cell-info">
                            <strong>${escapeHtml(u.fullname)}</strong>
                            <span>${escapeHtml(u.staffid)}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-dir">${escapeHtml(u.directorate)}</span>
                </td>
                <td>${roleBadge}</td>
                <td>${statusBadge}</td>
                <td>
                    <span style="font-size:12px; color:var(--text-secondary);">${u.is_online ? '<strong style="color:var(--success);">Active Now</strong>' : (formatTimeAgo(u.last_seen) || "Offline")}</span>
                </td>
                <td>
                    <span style="font-size:12px; color:var(--text-muted);">${formatDate(u.created_at)}</span>
                </td>
                <td>
                    <div class="table-actions">
                        <button class="action-btn" title="View Details" onclick="viewUserDetails('${u.id}')">
                            <i class="ri-eye-line"></i>
                        </button>
                        <button class="action-btn" title="Edit Staff & Role" onclick="openEditUserModal('${u.id}')">
                            <i class="ri-edit-line"></i>
                        </button>
                        <button class="action-btn" title="Reset Password" onclick="openResetPasswordModal('${u.id}', '${escapeHtml(u.fullname)}')">
                            <i class="ri-key-line"></i>
                        </button>
                        <button class="action-btn btn-delete" title="Delete User" onclick="confirmDeleteUser('${u.id}', '${escapeHtml(u.fullname)}')">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

// User Actions
function openCreateUserModal() {
    document.getElementById("createUserForm")?.reset();
    populateDirectoratesDropdowns();
    openModal("createUserModal");
}

async function handleCreateUserSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Creating...`;

        const res = await fetch("/admin/api/users", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = `Create User`;

        if (!data.success) throw new Error(data.error);

        showToast("User account created successfully!", "success");
        closeModal("createUserModal");
        loadUsers(1);
        loadDashboardStats(true);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function viewUserDetails(userId) {
    try {
        const res = await fetch(`/admin/api/users/${userId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const u = data.user;
        document.getElementById("viewUserAvatar").src = `/profile_picture/${u.id}`;
        document.getElementById("viewUserFullname").textContent = u.fullname;
        document.getElementById("viewUserStaffId").textContent = u.staffid;
        document.getElementById("viewUserDirectorate").textContent = u.directorate;
        document.getElementById("viewUserRole").textContent = u.role.toUpperCase();
        document.getElementById("viewUserStatus").textContent = u.status.toUpperCase();
        document.getElementById("viewUserOnline").textContent = u.is_online ? "Yes, currently active" : "Offline";
        document.getElementById("viewUserLastSeen").textContent = u.last_seen ? formatTimeAgo(u.last_seen) : "N/A";
        document.getElementById("viewUserCreatedAt").textContent = formatDate(u.created_at);
        document.getElementById("viewUserMsgCount").textContent = `${u.messages_sent_count.toLocaleString()} messages sent`;

        const groupsContainer = document.getElementById("viewUserGroupsList");
        if (groupsContainer) {
            if (u.groups && u.groups.length > 0) {
                groupsContainer.innerHTML = u.groups.map(g => `
                    <span class="dir-tag"><i class="ri-team-line"></i> ${escapeHtml(g.name)}</span>
                `).join("");
            } else {
                groupsContainer.innerHTML = "<span class='text-muted' style='font-size:12px;'>Not assigned to any group.</span>";
            }
        }

        openModal("viewUserModal");
    } catch (err) {
        showToast("Error retrieving user details: " + err.message, "error");
    }
}

async function openEditUserModal(userId) {
    try {
        const res = await fetch(`/admin/api/users/${userId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const u = data.user;
        document.getElementById("editUserId").value = u.id;
        document.getElementById("editUserStaffId").value = u.staffid;
        document.getElementById("editUserFirstname").value = u.firstname;
        document.getElementById("editUserLastname").value = u.lastname;
        document.getElementById("editUserRole").value = u.role;
        document.getElementById("editUserStatus").value = u.status;

        populateDirectoratesDropdowns();
        document.getElementById("editUserDirectorate").value = u.directorate;

        openModal("editUserModal");
    } catch (err) {
        showToast("Error opening user edit: " + err.message, "error");
    }
}

async function handleEditUserSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById("editUserId").value;
    const body = {
        staffid: document.getElementById("editUserStaffId").value.trim(),
        firstname: document.getElementById("editUserFirstname").value.trim(),
        lastname: document.getElementById("editUserLastname").value.trim(),
        directorate: document.getElementById("editUserDirectorate").value,
        role: document.getElementById("editUserRole").value,
        status: document.getElementById("editUserStatus").value
    };

    try {
        const res = await fetch(`/admin/api/users/${userId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast("Staff profile updated successfully", "success");
        closeModal("editUserModal");
        loadUsers(currentUsersPage);
    } catch (err) {
        showToast(err.message, "error");
    }
}

function openResetPasswordModal(userId, fullname) {
    document.getElementById("resetPasswordUserId").value = userId;
    document.getElementById("resetPasswordUserName").textContent = fullname;
    document.getElementById("resetPasswordInput").value = "";
    openModal("resetPasswordModal");
}

async function handleResetPasswordSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById("resetPasswordUserId").value;
    const newPassword = document.getElementById("resetPasswordInput").value;

    if (!newPassword || newPassword.length < 4) {
        showToast("Password must be at least 4 characters", "error");
        return;
    }

    try {
        const res = await fetch(`/admin/api/users/${userId}/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: newPassword })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast("User password has been reset successfully", "success");
        closeModal("resetPasswordModal");
    } catch (err) {
        showToast(err.message, "error");
    }
}

function confirmDeleteUser(userId, fullname) {
    openConfirmModal(
        "Delete Staff Account",
        `Are you sure you want to permanently delete <strong>${escapeHtml(fullname)}</strong>? All their group memberships and conversations will be removed.`,
        async () => {
            try {
                const res = await fetch(`/admin/api/users/${userId}`, { method: "DELETE" });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                showToast("User deleted successfully", "success");
                loadUsers(currentUsersPage);
                loadDashboardStats(true);
            } catch (err) {
                showToast(err.message, "error");
            }
        }
    );
}

/* ==========================================================================
   3. GROUPS & DIRECTORATES
   ========================================================================== */

async function loadGroups() {
    const search = document.getElementById("groupSearchInput")?.value.trim() || "";
    const container = document.getElementById("groupsGridContainer");
    if (container) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px;"><i class="ri-loader-4-line ri-spin" style="font-size:28px; color:var(--primary);"></i><p style="font-size:13px; color:var(--text-muted); margin-top:8px;">Loading groups and directorates...</p></div>`;
    }

    try {
        const res = await fetch(`/admin/api/groups?search=${encodeURIComponent(search)}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        document.getElementById("groupsCountBadge").textContent = data.total;
        renderGroupsGrid(data.groups);
    } catch (err) {
        showToast("Failed to load groups: " + err.message, "error");
        if (container) container.innerHTML = `<div style="grid-column:1/-1; color:var(--danger); text-align:center; padding:20px;">Error loading groups</div>`;
    }
}

function renderGroupsGrid(groups) {
    const container = document.getElementById("groupsGridContainer");
    if (!container) return;

    if (!groups || groups.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 48px; color:var(--text-muted);"><i class="ri-team-line" style="font-size:36px; display:block; margin-bottom:10px;"></i>No groups found matching your search.</div>`;
        return;
    }

    container.innerHTML = groups.map(g => `
        <div class="group-admin-card">
            <div class="group-card-header">
                <img class="group-card-avatar" src="${g.image}" alt="" onerror="this.src='/static/images/dsa-logo.png'">
                <div class="group-card-title-wrap">
                    <h4>${escapeHtml(g.name)}</h4>
                    <span>Created by ${escapeHtml(g.created_by)}</span>
                </div>
            </div>
            <div class="group-card-desc">
                ${escapeHtml(g.description || "No group description provided.")}
            </div>
            <div class="group-card-meta">
                <div class="group-card-meta-item">
                    <i class="ri-user-3-line"></i>
                    <strong>${g.members_count}</strong> members
                </div>
                <div class="group-card-meta-item">
                    <i class="ri-shield-star-line"></i>
                    <strong>${g.admins_count}</strong> admins
                </div>
                <div class="group-card-meta-item">
                    <i class="ri-message-3-line"></i>
                    <strong>${g.messages_count}</strong> msgs
                </div>
            </div>
            <div class="group-card-actions">
                <button class="btn-admin btn-admin-primary btn-admin-sm" onclick="openManageMembersModal('${g.id}', '${escapeHtml(g.name)}')">
                    <i class="ri-group-line"></i> Manage Members
                </button>
                <button class="btn-admin btn-admin-secondary btn-admin-sm" title="Edit Details" onclick="openEditGroupModal('${g.id}')">
                    <i class="ri-edit-line"></i>
                </button>
                <button class="btn-admin btn-admin-danger btn-admin-sm btn-icon-only" title="Delete Group" onclick="confirmDeleteGroup('${g.id}', '${escapeHtml(g.name)}')">
                    <i class="ri-delete-bin-line"></i>
                </button>
            </div>
        </div>
    `).join("");
}

function openCreateGroupModal() {
    document.getElementById("createGroupForm")?.reset();
    openModal("createGroupModal");
}

async function handleCreateGroupSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    try {
        const btn = form.querySelector('button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Creating...`;

        const res = await fetch("/admin/api/groups", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = `Create Group`;

        if (!data.success) throw new Error(data.error);

        showToast("Group created successfully!", "success");
        closeModal("createGroupModal");
        loadGroups();
        loadDashboardStats(true);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function openEditGroupModal(groupId) {
    try {
        const res = await fetch(`/admin/api/groups/${groupId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const g = data.group;
        document.getElementById("editGroupId").value = g.id;
        document.getElementById("editGroupName").value = g.name;
        document.getElementById("editGroupDesc").value = g.description;

        openModal("editGroupModal");
    } catch (err) {
        showToast("Failed to fetch group details: " + err.message, "error");
    }
}

async function handleEditGroupSubmit(e) {
    e.preventDefault();
    const groupId = document.getElementById("editGroupId").value;
    const form = e.target;
    const formData = new FormData(form);

    try {
        const res = await fetch(`/admin/api/groups/${groupId}`, {
            method: "PUT",
            body: formData
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast("Group updated successfully", "success");
        closeModal("editGroupModal");
        loadGroups();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function openManageMembersModal(groupId, groupName) {
    document.getElementById("manageMembersGroupId").value = groupId;
    document.getElementById("manageMembersGroupName").textContent = groupName;
    openModal("manageMembersModal");
    loadGroupMembersList(groupId);
}

async function loadGroupMembersList(groupId) {
    const listEl = document.getElementById("groupMembersTableBody");
    if (listEl) {
        listEl.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 24px;"><i class="ri-loader-4-line ri-spin"></i> Loading members...</td></tr>`;
    }

    try {
        const res = await fetch(`/admin/api/groups/${groupId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const members = data.group.members || [];
        if (members.length === 0) {
            listEl.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 20px; color:var(--text-muted);">No members currently in this group.</td></tr>`;
            return;
        }

        listEl.innerHTML = members.map(m => `
            <tr>
                <td>
                    <strong>${escapeHtml(m.fullname)}</strong>
                    <div style="font-size:11.5px; color:var(--text-muted);">${escapeHtml(m.staffid)} &bull; ${escapeHtml(m.directorate)}</div>
                </td>
                <td>
                    ${m.is_admin 
                        ? `<span class="badge badge-admin"><i class="ri-shield-star-fill"></i> Admin</span>`
                        : `<span class="badge badge-user">Member</span>`}
                </td>
                <td>
                    <span style="font-size:12px; color:var(--text-muted);">${m.joined_at ? formatDate(m.joined_at) : 'Enrolled'}</span>
                </td>
                <td style="text-align:right;">
                    <div class="table-actions" style="justify-content:flex-end;">
                        <button class="action-btn" title="${m.is_admin ? 'Demote from Admin' : 'Promote to Admin'}" onclick="toggleGroupAdminStatus('${groupId}', '${m.user_id}')">
                            <i class="${m.is_admin ? 'ri-shield-user-line' : 'ri-shield-star-line'}"></i>
                        </button>
                        <button class="action-btn btn-delete" title="Remove Member" onclick="removeMemberFromGroup('${groupId}', '${m.user_id}', '${escapeHtml(m.fullname)}')">
                            <i class="ri-user-unfollow-line"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        showToast("Error loading group members: " + err.message, "error");
    }
}

async function toggleGroupAdminStatus(groupId, userId) {
    try {
        const res = await fetch(`/admin/api/groups/${groupId}/toggle-admin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(data.message, "success");
        loadGroupMembersList(groupId);
        loadGroups();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function removeMemberFromGroup(groupId, userId, fullname) {
    if (!confirm(`Remove ${fullname} from this group?`)) return;

    try {
        const res = await fetch(`/admin/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast("Member removed from group", "success");
        loadGroupMembersList(groupId);
        loadGroups();
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function handleAddGroupMemberSubmit(e) {
    e.preventDefault();
    const groupId = document.getElementById("manageMembersGroupId").value;
    const staffIdInput = document.getElementById("addMemberStaffId").value.trim();

    if (!staffIdInput) return;

    try {
        // Resolve user by staff ID or name
        const userRes = await fetch(`/admin/api/users?search=${encodeURIComponent(staffIdInput)}&limit=1`);
        const userData = await userRes.json();
        if (!userData.success || !userData.users || userData.users.length === 0) {
            showToast("No user found with Staff ID/Name: " + staffIdInput, "error");
            return;
        }

        const targetUser = userData.users[0];
        const res = await fetch(`/admin/api/groups/${groupId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: targetUser.id })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        showToast(`Added ${targetUser.fullname} to group`, "success");
        document.getElementById("addMemberStaffId").value = "";
        loadGroupMembersList(groupId);
        loadGroups();
    } catch (err) {
        showToast(err.message, "error");
    }
}

function confirmDeleteGroup(groupId, groupName) {
    openConfirmModal(
        "Delete Group Channel",
        `Are you sure you want to permanently delete group <strong>${escapeHtml(groupName)}</strong>? All messages inside this group will be deleted.`,
        async () => {
            try {
                const res = await fetch(`/admin/api/groups/${groupId}`, { method: "DELETE" });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                showToast("Group deleted successfully", "success");
                loadGroups();
                loadDashboardStats(true);
            } catch (err) {
                showToast(err.message, "error");
            }
        }
    );
}

/* ==========================================================================
   4. MESSAGE MODERATION
   ========================================================================== */

async function loadMessages(page = 1) {
    currentMessagesPage = page;
    const search = document.getElementById("msgSearchInput")?.value.trim() || "";
    const type = document.getElementById("msgTypeFilter")?.value || "all";
    const chatType = document.getElementById("msgChatTypeFilter")?.value || "all";

    const tbody = document.getElementById("messagesTableBody");
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 28px;"><i class="ri-loader-4-line ri-spin"></i> Loading messages...</td></tr>`;
    }

    try {
        const query = new URLSearchParams({ search, type, chat_type: chatType, page, limit: 20 });
        const res = await fetch(`/admin/api/messages?${query}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        renderMessagesTable(data.messages);
        renderPagination("messagesPagination", data.page, data.pages, data.total, (p) => loadMessages(p));
    } catch (err) {
        showToast("Error loading messages: " + err.message, "error");
    }
}

function renderMessagesTable(messages) {
    const tbody = document.getElementById("messagesTableBody");
    if (!tbody) return;

    if (!messages || messages.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 36px; color:var(--text-muted);"><i class="ri-chat-delete-line" style="font-size:32px; display:block; margin-bottom:8px;"></i>No messages match search query.</td></tr>`;
        return;
    }

    tbody.innerHTML = messages.map(m => {
        let typeBadge = `<span class="badge" style="background:#e2e8f0; color:#475569;">${m.message_type}</span>`;
        if (m.message_type === "image") typeBadge = `<span class="badge" style="background:#dbeafe; color:#1e40af;"><i class="ri-image-line"></i> Image</span>`;
        if (m.message_type === "audio") typeBadge = `<span class="badge" style="background:#ede9fe; color:#5b21b6;"><i class="ri-mic-line"></i> Voice</span>`;
        if (m.message_type === "video") typeBadge = `<span class="badge" style="background:#fef3c7; color:#92400e;"><i class="ri-video-line"></i> Video</span>`;
        if (m.message_type === "file") typeBadge = `<span class="badge" style="background:#f1f5f9; color:#334155;"><i class="ri-file-line"></i> File</span>`;

        const isDeleted = m.is_deleted;
        const msgDisplay = isDeleted 
            ? `<em style="color:var(--danger);">${escapeHtml(m.message)}</em>`
            : escapeHtml(m.message);

        return `
            <tr style="${isDeleted ? 'opacity: 0.65;' : ''}">
                <td>
                    <strong>${escapeHtml(m.sender_name)}</strong>
                    <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(m.sender_staffid)}</div>
                </td>
                <td>
                    <span style="font-size:12.5px; font-weight:500; color:var(--text-secondary);">${escapeHtml(m.chat_label)}</span>
                </td>
                <td>${typeBadge}</td>
                <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${msgDisplay}
                    ${m.file_name ? `<div style="font-size:11px; color:var(--primary);"><i class="ri-attachment-line"></i> ${escapeHtml(m.file_name)}</div>` : ''}
                </td>
                <td>
                    <span style="font-size:12px; color:var(--text-muted);">${formatDate(m.timestamp)}</span>
                </td>
                <td style="text-align:right;">
                    ${!isDeleted ? `
                        <button class="btn-admin btn-admin-danger btn-admin-sm" title="Moderate Message (Delete for All)" onclick="confirmModerateMessage('${m.id}')">
                            <i class="ri-delete-bin-line"></i> Moderate
                        </button>
                    ` : `<span style="font-size:11px; color:var(--danger); font-weight:600;">Removed</span>`}
                </td>
            </tr>
        `;
    }).join("");
}

function confirmModerateMessage(messageId) {
    openConfirmModal(
        "Moderate & Delete Message",
        "Are you sure you want to delete this message across all devices? It will be replaced with an administrator removal notice.",
        async () => {
            try {
                const res = await fetch(`/admin/api/messages/${messageId}`, { method: "DELETE" });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                showToast("Message moderated successfully", "success");
                loadMessages(currentMessagesPage);
                loadDashboardStats(true);
            } catch (err) {
                showToast(err.message, "error");
            }
        }
    );
}

/* ==========================================================================
   5. MEDIA & STORAGE EXPLORER
   ========================================================================== */

async function loadMedia(page = 1) {
    currentMediaPage = page;
    const search = document.getElementById("mediaSearchInput")?.value.trim() || "";
    const category = document.getElementById("mediaCategoryFilter")?.value || "all";

    const container = document.getElementById("mediaGridContainer");
    if (container) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px;"><i class="ri-loader-4-line ri-spin" style="font-size:28px; color:var(--primary);"></i><p style="font-size:13px; color:var(--text-muted); margin-top:8px;">Indexing GridFS storage...</p></div>`;
    }

    try {
        const query = new URLSearchParams({ search, category, page, limit: 20 });
        const res = await fetch(`/admin/api/media?${query}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        renderMediaGrid(data.media);
        renderPagination("mediaPagination", data.page, data.pages, data.total, (p) => loadMedia(p));
    } catch (err) {
        showToast("Error loading media: " + err.message, "error");
    }
}

function renderMediaGrid(files) {
    const container = document.getElementById("mediaGridContainer");
    if (!container) return;

    if (!files || files.length === 0) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 48px; color:var(--text-muted);"><i class="ri-folder-open-line" style="font-size:36px; display:block; margin-bottom:10px;"></i>No media files found matching filter.</div>`;
        return;
    }

    container.innerHTML = files.map(f => {
        let previewHtml = `<div class="media-icon-fallback"><i class="ri-file-3-line"></i></div>`;
        if (f.kind === "image") {
            previewHtml = `<img src="${f.url}" alt="${escapeHtml(f.filename)}" loading="lazy">`;
        } else if (f.kind === "audio") {
            previewHtml = `<div class="media-icon-fallback" style="color:var(--purple);"><i class="ri-mic-line"></i></div>`;
        } else if (f.kind === "video") {
            previewHtml = `<div class="media-icon-fallback" style="color:var(--warning);"><i class="ri-movie-line"></i></div>`;
        } else if (f.filename.endsWith(".pdf")) {
            previewHtml = `<div class="media-icon-fallback" style="color:var(--danger);"><i class="ri-file-pdf-line"></i></div>`;
        }

        return `
            <div class="media-card">
                <div class="media-preview-box" onclick="previewMedia('${f.id}', '${f.kind}', '${escapeHtml(f.filename)}')">
                    ${previewHtml}
                </div>
                <div class="media-card-body">
                    <div>
                        <div class="media-filename" title="${escapeHtml(f.filename)}">${escapeHtml(f.filename)}</div>
                        <div class="media-meta">
                            <span>${f.size_formatted}</span>
                            <span>${f.upload_date ? formatDate(f.upload_date) : 'Stored'}</span>
                        </div>
                    </div>
                    <div class="media-actions">
                        <a href="${f.url}" target="_blank" download class="btn-admin btn-admin-secondary btn-admin-sm" title="Download">
                            <i class="ri-download-line"></i>
                        </a>
                        <button class="btn-admin btn-admin-danger btn-admin-sm btn-icon-only" title="Delete from GridFS" onclick="confirmDeleteMedia('${f.id}', '${escapeHtml(f.filename)}')">
                            <i class="ri-delete-bin-line"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function previewMedia(fileId, kind, filename) {
    const previewContainer = document.getElementById("mediaViewerContainer");
    const previewTitle = document.getElementById("mediaViewerTitle");
    if (!previewContainer) return;

    previewTitle.textContent = filename;
    const url = `/file/${fileId}`;

    if (kind === "image") {
        previewContainer.innerHTML = `<img src="${url}" style="max-width:100%; max-height:70vh; border-radius:8px; display:block; margin:0 auto;">`;
    } else if (kind === "audio") {
        previewContainer.innerHTML = `
            <div style="padding: 24px; text-align:center;">
                <i class="ri-mic-line" style="font-size:48px; color:var(--purple); display:block; margin-bottom:12px;"></i>
                <audio controls autoplay style="width:100%;">
                    <source src="${url}">
                    Your browser does not support audio playback.
                </audio>
            </div>
        `;
    } else if (kind === "video") {
        previewContainer.innerHTML = `
            <video controls autoplay style="max-width:100%; max-height:70vh; border-radius:8px; display:block; margin:0 auto;">
                <source src="${url}">
            </video>
        `;
    } else {
        previewContainer.innerHTML = `
            <div style="padding: 32px; text-align:center;">
                <i class="ri-file-text-line" style="font-size:54px; color:var(--primary); display:block; margin-bottom:12px;"></i>
                <p style="font-size:14px; margin-bottom:16px;">${escapeHtml(filename)}</p>
                <a href="${url}" target="_blank" download class="btn-admin btn-admin-primary">
                    <i class="ri-download-line"></i> Download Document
                </a>
            </div>
        `;
    }

    openModal("mediaViewerModal");
}

function confirmDeleteMedia(fileId, filename) {
    openConfirmModal(
        "Delete GridFS File",
        `Are you sure you want to permanently delete <strong>${escapeHtml(filename)}</strong> from GridFS storage? Messages referencing this file will be updated.`,
        async () => {
            try {
                const res = await fetch(`/admin/api/media/${fileId}`, { method: "DELETE" });
                const data = await res.json();
                if (!data.success) throw new Error(data.error);

                showToast("File deleted from GridFS", "success");
                loadMedia(currentMediaPage);
                loadDashboardStats(true);
            } catch (err) {
                showToast(err.message, "error");
            }
        }
    );
}

/* ==========================================================================
   6. BROADCAST ANNOUNCEMENTS
   ========================================================================== */

function handleBroadcastAudienceChange() {
    const targetType = document.getElementById("broadcastTarget")?.value;
    const dirWrap = document.getElementById("broadcastDirWrap");
    const groupWrap = document.getElementById("broadcastGroupWrap");

    if (dirWrap) dirWrap.style.display = targetType === "directorate" ? "block" : "none";
    if (groupWrap) groupWrap.style.display = targetType === "group" ? "block" : "none";
    updateBroadcastLivePreview();
}

function setBroadcastLevel(level) {
    document.querySelectorAll(".urgency-opt").forEach(opt => {
        opt.className = "urgency-opt";
        if (opt.dataset.level === level) {
            opt.classList.add(`active-${level}`);
        }
    });
    document.getElementById("broadcastLevel").value = level;
    updateBroadcastLivePreview();
}

function updateBroadcastLivePreview() {
    const title = document.getElementById("broadcastTitle")?.value.trim() || "Important Security Update";
    const body = document.getElementById("broadcastBody")?.value.trim() || "This is a live preview of how the announcement will look to recipients across DSA Messenger channels.";
    const level = document.getElementById("broadcastLevel")?.value || "info";

    const bubble = document.getElementById("previewBubble");
    const titleEl = document.getElementById("previewTitle");
    const bodyEl = document.getElementById("previewBody");

    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.textContent = body;
    if (bubble) {
        bubble.className = `announcement-bubble level-${level}`;
    }
}

async function handleBroadcastSubmit(e) {
    e.preventDefault();
    const title = document.getElementById("broadcastTitle").value.trim();
    const body = document.getElementById("broadcastBody").value.trim();
    const level = document.getElementById("broadcastLevel").value;
    const target = document.getElementById("broadcastTarget").value;

    let target_id = null;
    if (target === "directorate") {
        target_id = document.getElementById("broadcastDirectorateSelect").value;
        if (!target_id) {
            showToast("Please choose a target directorate", "error");
            return;
        }
    } else if (target === "group") {
        target_id = document.getElementById("broadcastGroupSelect").value;
        if (!target_id) {
            showToast("Please choose a target group", "error");
            return;
        }
    }

    try {
        const btn = document.getElementById("sendBroadcastBtn");
        btn.disabled = true;
        btn.innerHTML = `<i class="ri-loader-4-line ri-spin"></i> Broadcasting...`;

        const res = await fetch("/admin/api/broadcast", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, body, level, target, target_id })
        });
        const data = await res.json();
        btn.disabled = false;
        btn.innerHTML = `<i class="ri-send-plane-fill"></i> Send Broadcast Now`;

        if (!data.success) throw new Error(data.error);

        showToast(data.message, "success");
        document.getElementById("broadcastForm").reset();
        setBroadcastLevel("info");
        handleBroadcastAudienceChange();
        loadBroadcastHistory();
        loadDashboardStats(true);
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function loadBroadcastHistory() {
    const listEl = document.getElementById("broadcastHistoryList");
    if (!listEl) return;

    try {
        const res = await fetch("/admin/api/broadcast/history");
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const history = data.history || [];
        if (history.length === 0) {
            listEl.innerHTML = "<p class='text-muted' style='font-size:13px;'>No broadcast bulletins dispatched yet.</p>";
            return;
        }

        listEl.innerHTML = history.map(h => `
            <li class="activity-item">
                <div class="activity-icon" style="background:var(--primary-light); color:var(--primary);">
                    <i class="ri-broadcast-line"></i>
                </div>
                <div class="activity-details">
                    <div class="activity-title">${escapeHtml(h.title)}</div>
                    <div class="activity-sub">${escapeHtml(h.body.substring(0, 90))}${h.body.length > 90 ? '...' : ''}</div>
                    <div class="activity-time">Sent to: <strong>${escapeHtml(h.target.toUpperCase())}</strong> &bull; ${formatTimeAgo(h.created_at)}</div>
                </div>
            </li>
        `).join("");
    } catch (err) {
        console.error("Error loading broadcast history:", err);
    }
}

/* ==========================================================================
   7. SYSTEM HEALTH & SECURITY
   ========================================================================== */

async function loadSystemHealth() {
    try {
        const res = await fetch("/admin/api/system-health");
        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        const h = data.health;
        document.getElementById("sysDbStatus").textContent = h.database_status;
        document.getElementById("sysDbName").textContent = h.database_name;
        document.getElementById("sysServerTime").textContent = h.server_time;

        const cols = h.collections;
        document.getElementById("colUsers").textContent = (cols.users || 0).toLocaleString();
        document.getElementById("colGroups").textContent = (cols.groups || 0).toLocaleString();
        document.getElementById("colMessages").textContent = (cols.messages || 0).toLocaleString();
        document.getElementById("colPrivateChats").textContent = (cols.private_chats || 0).toLocaleString();
        document.getElementById("colFiles").textContent = (cols.gridfs_files || 0).toLocaleString();
        document.getElementById("colAnnouncements").textContent = (cols.announcements || 0).toLocaleString();

        const vapidBadge = document.getElementById("sysVapidBadge");
        if (vapidBadge) {
            if (h.vapid_push_configured) {
                vapidBadge.className = "badge badge-active";
                vapidBadge.innerHTML = `<i class="ri-checkbox-circle-fill"></i> VAPID Keys Active (Background Web Push Enabled)`;
            } else {
                vapidBadge.className = "badge badge-suspended";
                vapidBadge.innerHTML = `<i class="ri-alert-fill"></i> VAPID Keys Not Configured`;
            }
        }
    } catch (err) {
        showToast("Error checking system health: " + err.message, "error");
    }
}

/* ==========================================================================
   MODAL CONTROLLER & CONFIRMATION
   ========================================================================== */

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add("active");
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}

let onConfirmAction = null;

function openConfirmModal(title, message, callback) {
    document.getElementById("confirmModalTitle").textContent = title;
    document.getElementById("confirmModalBody").innerHTML = message;
    onConfirmAction = callback;
    openModal("confirmModal");
}

function executeConfirmAction() {
    if (typeof onConfirmAction === "function") {
        onConfirmAction();
    }
    closeModal("confirmModal");
}

/* ==========================================================================
   PAGINATION HELPER
   ========================================================================== */

function renderPagination(containerId, currentPage, totalPages, totalCount, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (totalCount === 0 || totalPages <= 1) {
        container.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${totalCount} items total</span>`;
        return;
    }

    let buttonsHtml = `
        <button class="action-btn" ${currentPage === 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="(${onPageChange})(${currentPage - 1})">
            <i class="ri-arrow-left-s-line"></i>
        </button>
        <span style="display:flex; align-items:center; padding:0 8px; font-weight:600; font-size:12.5px;">${currentPage} / ${totalPages}</span>
        <button class="action-btn" ${currentPage >= totalPages ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} onclick="(${onPageChange})(${currentPage + 1})">
            <i class="ri-arrow-right-s-line"></i>
        </button>
    `;

    container.innerHTML = `
        <span>Showing <strong>${totalCount}</strong> results</span>
        <div class="pagination-controls">${buttonsHtml}</div>
    `;
}

/* ==========================================================================
   FORMATTERS
   ========================================================================== */

function formatDate(isoStr) {
    if (!isoStr) return "";
    try {
        const d = new Date(isoStr);
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch (e) {
        return isoStr;
    }
}

function formatTimeAgo(isoStr) {
    if (!isoStr) return "";
    try {
        const d = new Date(isoStr);
        const now = new Date();
        const diffSec = Math.floor((now - d) / 1000);

        if (diffSec < 60) return "just now";
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
        return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch (e) {
        return "";
    }
}
