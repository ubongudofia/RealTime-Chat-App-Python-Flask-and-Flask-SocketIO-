// Initialize message cache
window.messageCache = {};



// ================================ SERVICE WORKER NOTIFICATIIIIIIIIIIIIIIIIIIIIIIIIII STARTS HERE =================================   
// Service Worker Registration

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(key => {
          if (key !== 'dsa-messenger-cache-v4') {
            caches.delete(key);
          }
        });
      });
    }
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then(reg => {
        reg.update();
        console.log('Service worker registered:', reg);
      })
      .catch(err => console.error('Service worker registration failed:', err));
  });
}


if ("Notification" in window && navigator.serviceWorker) {
  Notification.requestPermission().then(permission => {
    if (permission === "granted") {
      console.log("Notification permission granted.");
    }
  });
}


// ================================== SERVICE WORKER NNNNNNNNNNNNNNNNOTIFICATION ENDS HERE =================================                            


// ================================== CHAT SIDEBAR STRATS HERE (ASIDE) ======================================
// Setting up the chat sidebar toggle functionality

document.querySelector('.chat-sidebar-profile-toggle').addEventListener('click', function (e) {
    e.preventDefault()
    this.parentElement.classList.toggle('active')
})

document.addEventListener('click', function (e) {
    if (!e.target.matches('.chat-sidebar-profile, .chat-sidebar-profile *')) {
        document.querySelector('.chat-sidebar-profile').classList.remove('active')
    }
})


// Handle active class switching for sidebar menu items
document.querySelectorAll('.chat-sidebar-menu li').forEach(item => {
    item.addEventListener('click', function () {
        // Remove 'active' from all items
        document.querySelectorAll('.chat-sidebar-menu li').forEach(el => el.classList.remove('active'));

        // Add 'active' to the clicked item
        this.classList.add('active');
    });
});

// ================================ CHAT SIDEBAR ENDS HERE (ASIDE) ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ===================== CHAT INPUT/SEND CONVERSATION FORM STARTS HERE ====================================

document.querySelectorAll('.conversation-form-input').forEach(function (item) {
    item.addEventListener('input', function () {
        this.rows = this.value.split('\n').length
    })
})

document.querySelectorAll('[data-conversation]').forEach(function (item) {
    item.addEventListener('click', function (e) {
        e.preventDefault()
        document.querySelectorAll('.conversation').forEach(function (i) {
            i.classList.remove('active')
        })
        document.querySelector(this.dataset.conversation).classList.add('active')
    })
})

// =================================== CHAT INPUT/SEND CONVERSATION FORM ENDS HERE =========================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ================================== CHAT AREA TOGGLE STARTS HERE =========================================

document.querySelectorAll('.conversation-back').forEach(function (item) {
    item.addEventListener('click', function (e) {
        e.preventDefault();
        const conv = this.closest('.conversation');
        if (conv) {
            conv.classList.remove('active');
            conv.classList.add('hidden');
        }
        const welcome = document.querySelector('.conversation-default');
        if (welcome) {
            welcome.classList.add('active');
            welcome.classList.remove('hidden');
        }
        if (typeof closeInChatSearch === 'function') closeInChatSearch();
        const emojiPopover = document.getElementById('emojiPickerPopover');
        if (emojiPopover) emojiPopover.classList.add('hidden');

        window.activeChatId = null;
        window.activeChatType = null;
        sessionStorage.removeItem("active_chat_id");
        sessionStorage.removeItem("active_chat_type");
    });
});


// =================================== CHAT AREA TOTGGLE ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ====================== FLASK SOCKETIO CONNECTION SET UP STARTS HERE  ====================================

// Normalize Jinja template placeholders in case this script is loaded statically
function cleanTemplateVar(val) {
    if (!val || typeof val !== "string" || val.includes("{{") || val === "None" || val === "null") {
        return null;
    }
    return val.trim();
}

var sessionUserId = cleanTemplateVar("{{ user_id }}") || sessionStorage.getItem("user_id");
var groupId = cleanTemplateVar("{{ group_id }}");
var privateChatId = cleanTemplateVar("{{ private_chat_id }}");
window.activeChatId = groupId || privateChatId || sessionStorage.getItem("active_chat_id") || null;
window.activeChatType = groupId ? "group" : privateChatId ? "private" : (sessionStorage.getItem("active_chat_type") || null);

function setActiveChatState(chatId, chatType, userId = null) {
    if (!chatId || !chatType) return;
    const cleanId = String(chatId).trim();
    const cleanType = String(chatType).trim();

    window.activeChatId = cleanId;
    window.activeChatType = cleanType;
    sessionStorage.setItem("active_chat_id", cleanId);
    sessionStorage.setItem("active_chat_type", cleanType);

    if (userId) {
        sessionStorage.setItem("active_chat_user_id", String(userId).trim());
    }
}

const socket = io.connect();

// On connection, join the appropriate rooms
socket.on("connect", function () {
    console.log("Connected to the server!");

    const currentUserId = sessionStorage.getItem("user_id") || sessionUserId;
    if (currentUserId) {
        // ✅ Always join personal room
        socket.emit("join_user_room", { user_id: currentUserId });
    }

    const currentChatId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    const currentChatType = window.activeChatType || sessionStorage.getItem("active_chat_type");

    if (currentChatId && currentChatType === "group") {
        socket.emit("join_group", { group_id: currentChatId });
    } else if (currentChatId && currentChatType === "private") {
        socket.emit("join_private_chat", {
            chat_id: currentChatId,
            user_id: currentUserId
        });
    }
});

// ================================ FLASK SOCKETIO CONNECTION SET UP ENDS HERE  ================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ================================= FUNCTION FOR USERS TO JOIN CHAT ROOM ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// This function is called when the user clicks on a chat item in the sidebar

function joinChatRoom(chatType, chatId) {
    setActiveChatState(chatId, chatType);

    // 🔹 Make sure the user joins the correct room
    if (chatType === "group") {
        socket.emit("join_group", { group_id: chatId });
        console.log(`📡 Joining group: ${chatId}`);
    } else if (chatType === "private") {
        socket.emit("join_private_chat", { chat_id: chatId });
        console.log(`📡 Joining private chat: ${chatId}`);
    }
}

// ===================================== FUNCTION FOR USERS TO JOIN CHAT ROOM ENDS HERE =========================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX


// ===============================================================================================================
//                                         WEB PUSH (VAPID) CLIENT SUBSCRIPTION
// ===============================================================================================================

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function initWebPushNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        return;
    }

    try {
        const res = await fetch("/push/vapid_public_key");
        const data = await res.json();
        if (!data.success || !data.enabled || !data.public_key) {
            return;
        }

        const vapidPublicKey = data.public_key;
        const registration = await navigator.serviceWorker.ready;

        const subscribeAndSync = async () => {
            try {
                let subscription = await registration.pushManager.getSubscription();
                if (!subscription) {
                    const convertedKey = urlBase64ToUint8Array(vapidPublicKey);
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: convertedKey
                    });
                }
                if (subscription) {
                    await fetch("/push/subscribe", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ subscription: subscription.toJSON() })
                    });
                    console.log("✅ Background Web Push notifications registered successfully.");
                }
            } catch (err) {
                console.warn("⚠️ PushManager subscribe error:", err);
            }
        };

        if (Notification.permission === "granted") {
            await subscribeAndSync();
        } else if (Notification.permission === "default") {
            // Request permission on first user interaction so modern browsers don't block prompt
            const promptOnInteraction = async () => {
                const perm = await Notification.requestPermission();
                if (perm === "granted") {
                    await subscribeAndSync();
                }
            };
            document.addEventListener("click", promptOnInteraction, { once: true });
        }
    } catch (err) {
        console.warn("⚠️ Web Push initialization failed:", err);
    }
}

// ===================================== USER SESSION STORAGE STARTS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

window.onload = async function () {
    const sessionData = await fetchSessionData();

    if (sessionData) {
        if (sessionData.user_id) {
            socket.emit("join_user_room", { user_id: sessionData.user_id });
        }
        let chatId = sessionStorage.getItem("active_chat_id");
        let chatType = sessionStorage.getItem("active_chat_type");

        if (chatId && chatType) {
            setActiveChatState(chatId, chatType);
            switchChat(chatId, chatType);
        }

        // Initialize background Web Push notifications
        initWebPushNotifications();
    }
};

// ============================================= FUNCTION TO CHECK USER SESSION DATA ============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

function checkSessionPeriodically() {
    fetch("/check_session")
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in) {
                // User is not logged in anymore — send to login page
                window.location.href = "/login";
            }
        })
        .catch(err => console.error("Session check failed", err));
}

// Check every 10 seconds
setInterval(checkSessionPeriodically, 10000);

// Also check immediately on page load
checkSessionPeriodically();

// ======================================= FUNCTION TO FETCH USER SESSION DATA ==================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

// Ensure session data is loaded before setting sessionStorage values
async function fetchSessionData() {
    try {
        let response = await fetch('/get_session_data', { credentials: 'include' });
        let data = await response.json();

        if (!data.success || !data.user_id) {
            console.warn("⚠️ Invalid session data! Redirecting to login...");
            window.location.href = "/login";
            return null;
        }

        sessionStorage.setItem("user_id", data.user_id);
        sessionStorage.setItem("firstname", data.firstname || "");
        sessionStorage.setItem("lastname", data.lastname || "");
        sessionStorage.setItem("staffid", data.staffid || "");

        // Store only if they exist
        if (data.group_id) sessionStorage.setItem("group_id", data.group_id);
        if (data.private_chat_id) sessionStorage.setItem("private_chat_id", data.private_chat_id);

        return data;
    } catch (error) {
        console.error("❌ ERROR: Fetching session data failed:", error);
        return null;
    }
}

// ================================ USER SESSION STORAGE ENDS HERE =============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ======================================== LOGOUT FUNCTION STARTS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

document.getElementById("logoutBtn").addEventListener("click", (e) => {
    e.preventDefault();
    fetch("/logout")
        .then(() => {
            sessionStorage.clear(); // Remove all cached user data
            window.location.href = "/login";
        })
        .catch(err => console.error("Logout failed", err));
});

// ======================================== LOGOUT FUNCTION ENDS HERE ==========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ======================================== SWITCH FUNCTION STARTS HERE ========================================
// Switch to a chat (private/group)
// This function is called when the user clicks on a chat item in the sidebar

async function switchChat(chat_id, chat_type, user_id = null) {
    if (!chat_id || !chat_type) {
        console.error("❌ Invalid chat switch request!");
        return;
    }

    console.log(`✅ Switching to ${chat_type} chat (ID: ${chat_id})`);

    const currentUserId = sessionStorage.getItem("user_id");
    if (!currentUserId) {
        console.error("⚠️ User ID missing from sessionStorage!");
        return;
    }

    // Store globally and in sessionStorage
    setActiveChatState(chat_id, chat_type, user_id);

    // Leave previous chats if different
    if (window.previousGroupId && window.previousGroupId !== chat_id) {
        socket.emit("leave_group", { group_id: window.previousGroupId });
    }
    if (window.previousPrivateId && window.previousPrivateId !== chat_id) {
        socket.emit("leave_private_chat", { chat_id: window.previousPrivateId });
    }

    // Join new chat
    if (chat_type === "group") {
        window.previousGroupId = chat_id;
        socket.emit("join_group", { group_id: chat_id });
    } else if (chat_type === "private") {
        window.previousPrivateId = chat_id;
        socket.emit("join_private_chat", { chat_id: chat_id, user_id: user_id || currentUserId });
    }

    // Ensure conversation panel is visible
    const welcomeScreen = document.querySelector(".conversation-default");
    const conversation = document.getElementById("conversation-1");
    if (welcomeScreen) {
        welcomeScreen.classList.remove("active");
        welcomeScreen.classList.add("hidden");
    }
    if (conversation) {
        conversation.classList.remove("hidden");
        conversation.classList.add("active");
    }

    // Clear current chat area
    const chatContainer = document.getElementById("conversation-main");
    if (chatContainer) chatContainer.innerHTML = "";

    // Load chat messages
    try {
        await loadChat(chat_id, chat_type, user_id);
    } catch (err) {
        console.error("⚠️ Failed to load chat content:", err);
        if (chatContainer) chatContainer.innerHTML = "<p class='empty-chat'>No messages yet</p>";
    }
}

// ===================================== SWITCH FUNCTION ENDS HERE =============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ==================================== HANDLE CHAT CLICK FUNCTION STARTS HERE =================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

function handleChatClick(event) {
    const chatItemList = event.target.closest("li.chat-item-list");
    if (!chatItemList) return;

    // Ignore clicks on the options menu button/dropdown
    if (event.target.closest(".chat-options")) return;

    // Prevent default link navigation if the anchor is clicked
    if (event.target.closest("a.chat-item")) {
        event.preventDefault();
    }

    const chatId = chatItemList.dataset.chatId?.trim();
    const chatType = chatItemList.dataset.chatType?.trim();
    const userId = chatItemList.dataset.userId?.trim();

    if (!chatId || !chatType) {
        console.error("Missing chat ID or type!");
        return;
    }

    // 🔑 1. Toggle conversation screen
    const welcomeScreen = document.querySelector(".conversation-default");
    const conversation = document.getElementById("conversation-1");

    if (welcomeScreen) {
        welcomeScreen.classList.remove("active");
        welcomeScreen.classList.add("hidden");
    }
    if (conversation) {
        conversation.classList.remove("hidden");
        conversation.classList.add("active");
    }

    // 🔑 2. Remove active class from all chats, mark clicked one
    document.querySelectorAll("li.chat-item-list").forEach(item => {
        item.classList.remove("active-chat", "active");
    });
    chatItemList.classList.add("active");

    // 🔑 3. Update chat header
    updateChatHeader(
        chatItemList.querySelector(".content-message-name")?.textContent.trim(),
        chatItemList.querySelector(".content-message-image")?.src
    );

    // 🔑 4. Clear unread badge across all lists and update total unread count
    clearUnreadForChat(chatId);

    // 🔑 5. Mark messages as read
    socket.emit("mark_messages_as_read", {
        chat_id: chatId,
        chat_type: chatType,
        user_id: sessionStorage.getItem("user_id")
    });

    // 🔑 6. Store active chat in sessionStorage and window
    setActiveChatState(chatId, chatType, userId);

    if (chatType === "private" && userId) {
        sessionStorage.setItem("pending_recipient_id", userId);
        sessionStorage.setItem(
            "pending_recipient_name",
            chatItemList.querySelector(".content-message-name")?.textContent.trim()
        );
        sessionStorage.setItem(
            "pending_recipient_image",
            chatItemList.querySelector(".content-message-image")?.src
        );
    } else if (chatType === "group") {
        sessionStorage.removeItem("active_chat_user_id");
        sessionStorage.removeItem("pending_recipient_id");
        sessionStorage.removeItem("pending_recipient_name");
        sessionStorage.removeItem("pending_recipient_image");

        sessionStorage.setItem("active_group_id", chatId);
        sessionStorage.setItem(
            "active_group_name",
            chatItemList.querySelector(".content-message-name")?.textContent.trim()
        );

        getGroupMembers(chatId);
    }

    // 🔑 7. Load chat details & media
    const currentUserId = sessionStorage.getItem("user_id");
    loadOverviewDetails(chatId, chatType, currentUserId);
    loadMedia(chatId, chatType);
    loadFiles(chatId, chatType);

    // 🔑 8. Switch to chat (join socket room + load messages)
    switchChat(chatId, chatType, userId);

    // 🔑 9. Sidebar toggle
    const sidebar = document.getElementById("hideMember");
    if (sidebar) {
        sidebar.style.display = (chatType === "group") ? "block" : "none";
    }

    const showPrivateInfo = document.getElementById("showPrivateInfo");
    const showGroupInfo = document.getElementById("showGroupInfo");
    const showPrivatebutton = document.getElementById("showPrivatebutton");
    const showGroupbutton = document.getElementById("showGroupbutton");

    if (showPrivateInfo && showPrivatebutton){
        showPrivateInfo.style.display = (chatType === "private") ? "block" : "none";
        showPrivatebutton.style.display = (chatType === "private") ? "block" : "none";
    }
    if (showGroupInfo && showGroupbutton){
        showGroupInfo.style.display = (chatType === "group") ? "block" : "none";
        showGroupbutton.style.display = (chatType === "group") ? "block" : "none";
    }
}

// ✅ Delegated listener — still works after re-render
document.getElementById("main-chat-list").addEventListener("click", handleChatClick);


// =========================================== HANDLE CHAT CLICK FUNCTION ENDS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== ALL SOCKET HANDLERS STARTS HERE =============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ========================================= SOCKET FOR MARK MESSAGES FUNCTIONALITY ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxxxx
// ✅ Socket listener for read confirmation
socket.on("messages_marked_as_read", function (data) {
    const count = data.updated_count ?? data.count ?? 0;
    console.log(`✅ ${count} messages marked as read for ${data.chat_id}`);

    // If current user marked them as read, clear the unread badge
    const currentUserId = sessionStorage.getItem("user_id");
    const isMe = !data.read_by || String(data.read_by) === String(currentUserId);

    if (isMe) {
        clearUnreadForChat(data.chat_id);
    } else {
        // Other user marked our sent messages as read
        const activeChatId = cleanTemplateVar(window.activeChatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
        if (activeChatId && String(activeChatId) === String(data.chat_id)) {
            // Immediately flip all outgoing ticks in #conversation-main to double blue read ticks
            const outgoingTickContainers = document.querySelectorAll("#conversation-main .message-wrapper.outgoing .message-status-tick");
            outgoingTickContainers.forEach(container => {
                container.innerHTML = '<span class="tick read" title="Read"><i class="ri-check-double-line"></i></span>';
            });
            const standaloneTicks = document.querySelectorAll("#conversation-main .message-wrapper.outgoing .tick:not(.read)");
            standaloneTicks.forEach(tickEl => {
                tickEl.outerHTML = '<span class="tick read" title="Read"><i class="ri-check-double-line"></i></span>';
            });

            // Update in-memory message cache
            if (window.messageCache) {
                Object.values(window.messageCache).forEach(msg => {
                    if (msg && String(msg.user_id) === String(currentUserId)) {
                        msg.status = "read";
                        if (data.read_by) {
                            msg.read_by = Array.from(new Set([...(msg.read_by || []), String(data.read_by)]));
                        }
                    }
                });
            }
        }
    }
});

// Track processed incoming message IDs so duplicate room emissions never double-count unread badges
window.processedIncomingMessageIds = window.processedIncomingMessageIds || new Set();

// Clear unread badge for a chat across all sidebar lists and refresh total unread indicator
function clearUnreadForChat(chatId) {
    if (!chatId) return;
    document.querySelectorAll(`li.chat-item-list[data-chat-id="${chatId}"]`).forEach(chatItem => {
        const unreadBadge = chatItem.querySelector(".content-message-unread") || chatItem.querySelector(".unread-badge");
        if (unreadBadge) {
            unreadBadge.textContent = "";
            unreadBadge.style.display = "none";
        }
        chatItem.dataset.unreadCount = "0";
        chatItem.classList.remove("has-unread");
    });
    updateTotalUnreadBadge();
}

// Update total unread count badge on the sidebar Chats icon, Unread filter pill, and page title
function updateTotalUnreadBadge() {
    const chatListEl = document.getElementById("main-chat-list");
    if (!chatListEl) return;

    let totalUnread = 0;
    let unreadChatCount = 0;
    chatListEl.querySelectorAll("li.chat-item-list").forEach(item => {
        const count = parseInt(item.getAttribute("data-unread-count") || "0", 10) || 0;
        if (count > 0) {
            totalUnread += count;
            unreadChatCount += 1;
            item.classList.add("has-unread");
        } else {
            item.classList.remove("has-unread");
        }
    });

    // Update badge on the left sidebar Chats icon
    const chatsIconLink = document.querySelector('.chat-sidebar-menu a[data-title="Chats"]');
    if (chatsIconLink) {
        let sidebarBadge = chatsIconLink.querySelector(".sidebar-unread-badge");
        if (totalUnread > 0) {
            if (!sidebarBadge) {
                sidebarBadge = document.createElement("span");
                sidebarBadge.className = "sidebar-unread-badge";
                chatsIconLink.appendChild(sidebarBadge);
            }
            sidebarBadge.textContent = totalUnread > 99 ? "99+" : String(totalUnread);
            sidebarBadge.style.display = "inline-flex";
        } else if (sidebarBadge) {
            sidebarBadge.textContent = "";
            sidebarBadge.style.display = "none";
        }
    }

    // Update badge on the "Unread" filter pill under the search bar
    const filterUnreadBadge = document.getElementById("filterUnreadCount");
    if (filterUnreadBadge) {
        if (unreadChatCount > 0) {
            filterUnreadBadge.textContent = unreadChatCount > 99 ? "99+" : String(unreadChatCount);
            filterUnreadBadge.classList.remove("hidden");
        } else {
            filterUnreadBadge.textContent = "0";
            filterUnreadBadge.classList.add("hidden");
        }
    }

    // Re-apply active chat filter if currently filtering by unread
    if (typeof applyChatFilter === "function" && window.currentChatFilter && window.currentChatFilter !== "all") {
        applyChatFilter();
    }

    // Update browser tab title
    document.title = totalUnread > 0 ? `(${totalUnread}) DSA Messenger` : "Chat";
}

// Ensure a chat item exists in #main-chat-list when a message arrives for a brand-new private or group chat
async function ensureChatItemInSidebar(data, chatId, chatType, userId) {
    const chatListEl = document.getElementById("main-chat-list");
    if (!chatListEl || !chatId) return null;

    let existing = chatListEl.querySelector(`li.chat-item-list[data-chat-id="${chatId}"]`);
    if (!existing && chatType === "private" && userId) {
        existing = chatListEl.querySelector(`li.chat-item-list[data-user-id="${userId}"][data-chat-type="private"]`);
        if (existing) {
            existing.dataset.chatId = String(chatId);
        }
    }
    if (existing) return existing;

    // Fetch chat metadata from server so we can create the sidebar entry immediately
    const currentUserId = sessionStorage.getItem("user_id") || "";
    let chatName = data.group_name || data.sender || "New Chat";
    let chatImage = data.group_image || (chatType === "group" ? "/static/images/dsa-logo.png" : "/static/images/default-profile.png");
    let resolvedOtherUserId = userId || "";

    try {
        const res = await fetch(`/chat-info/${chatType}/${chatId}?user_id=${encodeURIComponent(currentUserId)}`);
        if (res.ok) {
            const info = await res.json();
            if (info.name) chatName = info.name;
            if (info.image) chatImage = info.image;
            if (info.other_user_id) resolvedOtherUserId = info.other_user_id;
        }
    } catch (err) {
        console.warn("⚠️ Could not fetch chat info for new sidebar item:", err);
    }

    // Double-check after async fetch in case another handler inserted it
    existing = chatListEl.querySelector(`li.chat-item-list[data-chat-id="${chatId}"]`);
    if (existing) return existing;

    // Remove "No chats available" placeholder if present
    const emptyPlaceholder = chatListEl.querySelector(".no-chats-message");
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const preview = formatMessagePreview(data.display_text || data.message, data.message_type, data.file_name);
    const ts = data.timestamp || new Date().toISOString();
    const isFav = Boolean(window.favouriteChatIds && window.favouriteChatIds.has(String(chatId)));

    const li = document.createElement("li");
    li.classList.add("chat-item-list");
    if (isFav) li.classList.add("is-favourite");
    li.dataset.chatId = String(chatId);
    li.dataset.chatType = String(chatType);
    if (chatType === "private" && resolvedOtherUserId) {
        li.dataset.userId = String(resolvedOtherUserId);
    }
    li.dataset.chatName = chatName;
    li.dataset.chatImage = chatImage;
    li.dataset.unreadCount = "0";
    li.dataset.isFavourite = isFav ? "true" : "false";
    li.dataset.lastMessage = data.display_text || data.message || "";
    li.dataset.timestamp = ts;

    li.innerHTML = `
        <a href="/chat/${chatType}/${chatId}" class="chat-item" aria-label="Chat with ${escapeHtml(chatName)}">
            <div class="chat-content-list">
                <img class="content-message-image" 
                     src="${chatImage}" 
                     alt="${escapeHtml(chatName)}" 
                     onerror="this.src='/static/images/default-profile.png'">
                <div class="chat-details content-message-info">
                    <span class="content-message-name">${escapeHtml(chatName)}</span>
                    <div class="tooltip-wrapper">
                        <span class="content-message-text">${escapeHtml(preview)}</span>
                    </div>
                    <div class="content-message-meta">
                        <span class="content-message-time">
                            ${renderChatFormatTimestamp(ts)}
                        </span>
                        <span class="content-message-meta-right">
                            <button type="button" class="chat-fav-btn ${isFav ? 'active' : ''}" 
                                    title="${isFav ? 'Remove from Favourites' : 'Add to Favourites'}"
                                    onclick="toggleFavouriteChat(event, '${chatId}')">
                                <i class="${isFav ? 'ri-heart-3-fill' : 'ri-heart-3-line'}"></i>
                            </button>
                        </span>
                    </div>
                </div>
                <hr>
            </div>
        </a>
    `;

    chatListEl.prepend(li);
    if (typeof applyChatFilter === "function") {
        applyChatFilter();
    }
    return li;
}

// Subtle Web Audio API chime for incoming message notifications
function playNotificationSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        if (!window._dsaAudioCtx) {
            window._dsaAudioCtx = new AudioCtx();
        }
        const ctx = window._dsaAudioCtx;
        if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
        }
        const now = ctx.currentTime;

        // First tone
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, now); // D5
        osc1.frequency.setValueAtTime(880, now + 0.09); // A5
        gain1.gain.setValueAtTime(0.0001, now);
        gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.29);
    } catch (e) {
        // Ignore audio errors if user hasn't interacted with page yet
    }
}

// Open a specific chat programmatically (used when clicking a notification toast or OS notification)
function openChatFromNotification(chatId, chatType, userId = null) {
    if (typeof showChatList === "function") {
        showChatList();
    }
    const chatItem = document.querySelector(`#main-chat-list li.chat-item-list[data-chat-id="${chatId}"]`)
        || document.querySelector(`li.chat-item-list[data-chat-id="${chatId}"]`);
    if (chatItem) {
        const anchor = chatItem.querySelector("a.chat-item") || chatItem;
        anchor.click();
    } else {
        clearUnreadForChat(chatId);
        switchChat(chatId, chatType, userId);
    }
}

// Show sleek WhatsApp-style in-app toast notification at top-right
function showInAppMessageNotification(title, body, image, chatId, chatType, userId) {
    let container = document.getElementById("msg-notification-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "msg-notification-container";
        document.body.appendChild(container);
    }

    // Limit to 3 stacked toasts
    while (container.children.length >= 3) {
        container.firstElementChild.remove();
    }

    const toast = document.createElement("div");
    toast.className = "msg-notification-toast";
    toast.innerHTML = `
        <img class="msg-notification-avatar" src="${image || '/static/images/default-profile.png'}" 
             alt="${escapeHtml(title)}" onerror="this.src='/static/images/default-profile.png'">
        <div class="msg-notification-body">
            <div class="msg-notification-header">
                <span class="msg-notification-title">${escapeHtml(title)}</span>
                <span class="msg-notification-label">New message</span>
            </div>
            <div class="msg-notification-text">${escapeHtml(body)}</div>
        </div>
        <button type="button" class="msg-notification-close" aria-label="Close">&times;</button>
    `;

    toast.addEventListener("click", (e) => {
        if (e.target.closest(".msg-notification-close")) {
            toast.remove();
            return;
        }
        openChatFromNotification(chatId, chatType, userId);
        toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hide");
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// Trigger browser/OS notification when tab is hidden or minimized
function showBrowserNotification(title, body, image, chatId, chatType, userId) {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
        try {
            const notif = new Notification(title, {
                body: body,
                icon: image || "/static/icons/icon-192x192.png",
                tag: `chat-${chatId}`,
                renotify: true
            });
            notif.onclick = function () {
                window.focus();
                openChatFromNotification(chatId, chatType, userId);
                notif.close();
            };
        } catch (err) {
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body: body,
                        icon: image || "/static/icons/icon-192x192.png",
                        tag: `chat-${chatId}`
                    });
                }).catch(() => {});
            }
        }
    }
}

function triggerNewMessageNotification(data, chatId, chatType, userId, previewText, isChatCurrentlyOpen) {
    playNotificationSound();

    const chatItem = document.querySelector(`#main-chat-list li.chat-item-list[data-chat-id="${chatId}"]`)
        || document.querySelector(`li.chat-item-list[data-chat-id="${chatId}"]`);
    const chatName = chatItem?.querySelector(".content-message-name")?.textContent?.trim()
        || data.group_name
        || data.sender
        || "New Message";
    const chatImage = chatItem?.querySelector(".content-message-image")?.src
        || data.group_image
        || "/static/images/default-profile.png";

    const notifTitle = chatType === "group" && data.sender && data.sender !== chatName
        ? `${data.sender} in ${chatName}`
        : chatName;
    const notifBody = previewText || "Sent a message";

    // Show in-app toast banner whenever the message belongs to a non-active chat
    if (!isChatCurrentlyOpen) {
        showInAppMessageNotification(notifTitle, notifBody, chatImage, chatId, chatType, userId);
    }

    // Show OS/browser notification if browser tab is in the background
    if (document.visibilityState !== "visible") {
        showBrowserNotification(notifTitle, notifBody, chatImage, chatId, chatType, userId);
    }
}

// ========================================= SOCKET FOR SEND/RECEIVE MESSAGES FUNCTIONALITY =====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxxxx

// Message Received Handler - Improved Version
socket.on("receive_message", async (data) => {
    console.log("📩 New message received:", data);
    if (!data) return;

    const currentUserId = sessionStorage.getItem("user_id") || sessionUserId;
    const isGroup = !!data.group_id;
    const chatId = String(isGroup ? data.group_id : data.private_chat_id);
    const chatType = isGroup ? "group" : "private";

    // Deduplicate incoming socket events by message ID (since backend emits to both chat room and user_<id> room)
    if (data.id) {
        const msgKey = String(data.id);
        if (window.processedIncomingMessageIds.has(msgKey)) {
            return;
        }
        window.processedIncomingMessageIds.add(msgKey);
        if (window.processedIncomingMessageIds.size > 500) {
            const oldest = window.processedIncomingMessageIds.values().next().value;
            window.processedIncomingMessageIds.delete(oldest);
        }
    }

    // Get user ID for private chats
    let userId = null;
    if (chatType === "private") {
        userId = String(data.sender_id || data.user_id || "") === String(currentUserId)
            ? data.receiver_id
            : (data.sender_id || (String(data.user_id) !== String(currentUserId) ? data.user_id : null));
    }

    // Ensure status fields exist
    data.status = data.status || "sent";
    data.delivered_to = data.delivered_to || [];
    data.read_by = data.read_by || [];
    data.starred = data.starred_by?.includes(currentUserId) || false;

    // Cache the message
    if (!window.messageCache) window.messageCache = {};
    if (data.id) window.messageCache[data.id] = data;

    // Ensure chat exists in #main-chat-list (handles brand-new private chats or new groups in real time)
    await ensureChatItemInSidebar(data, chatId, chatType, userId);

    const activeChatId = String(window.activeChatId || sessionStorage.getItem("active_chat_id") || "");
    const activeChatType = String(window.activeChatType || sessionStorage.getItem("active_chat_type") || "");
    const isChatCurrentlyOpen = (activeChatId === chatId && activeChatType === chatType);

    const isSystemMessage = data.message_type === "system" || !!data.system;
    const senderOrTriggerId = data.user_id || data.triggered_by || null;
    const isFromOtherUser = senderOrTriggerId ? String(senderOrTriggerId) !== String(currentUserId) : !isSystemMessage;

    const rawPreviewSource = isSystemMessage ? (data.display_text || data.message) : data.message;
    const previewText = formatMessagePreview(rawPreviewSource, data.message_type, data.file_name);

    // Confirm delivery whenever a real message from another user arrives
    if (isFromOtherUser && !isSystemMessage && data.id) {
        socket.emit("confirm_delivery", {
            message_id: data.id,
            user_id: currentUserId,
            chat_id: chatId,
            chat_type: chatType
        });
    }

    // Handle message display if active chat is open
    if (isChatCurrentlyOpen) {
        await displayMessage(data, chatType);

        if (isFromOtherUser && !isSystemMessage) {
            if (document.visibilityState === "visible") {
                socket.emit("mark_messages_as_read", {
                    chat_id: chatId,
                    chat_type: chatType,
                    user_id: currentUserId
                });
            } else {
                // Tab is minimized/backgrounded even though this chat is open
                updateUnreadCount(data);
                triggerNewMessageNotification(data, chatId, chatType, userId, previewText, true);
            }
        }
    } else if (isFromOtherUser && !isSystemMessage) {
        updateUnreadCount(data);
        triggerNewMessageNotification(data, chatId, chatType, userId, previewText, false);
    }

    // ✅ Pass timestamp into moveChatToTop
    moveChatToTop(chatId, chatType, userId, data.timestamp);

    // ✅ Pass timestamp + userId into updateChatPreview
    updateChatPreview(chatId, chatType, previewText, data.timestamp, userId);
});



window.currentChatFilter = window.currentChatFilter || "all";
window.favouriteChatIds = window.favouriteChatIds || new Set(
    JSON.parse(localStorage.getItem("dsa_favourite_chats") || "[]")
);

function saveFavouriteChatIdsToStorage() {
    try {
        localStorage.setItem(
            "dsa_favourite_chats",
            JSON.stringify(Array.from(window.favouriteChatIds || []))
        );
    } catch (e) {
        console.warn("Could not persist favourite chats to localStorage:", e);
    }
}

function renderChatList(chats) {
    const chatListEl = document.getElementById("main-chat-list");
    chatListEl.innerHTML = "";

    if (!chats || chats.length === 0) {
        chatListEl.innerHTML = `
            <li class="no-chats-message">
                <p>No chats available</p>
            </li>
        `;
        updateTotalUnreadBadge();
        return;
    }

    // Sort chats by timestamp descending before rendering
    chats.sort((a, b) => {
        const tsA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tsB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tsB - tsA;
    });

    const activeChatId = String(
        cleanTemplateVar(window.activeChatId) ||
        cleanTemplateVar(sessionStorage.getItem("active_chat_id")) ||
        ""
    );

    chats.forEach(chat => {
        const chatIdStr = String(chat.id);
        if (chat.is_favourite) {
            window.favouriteChatIds.add(chatIdStr);
        } else if (chat.is_favourite === false) {
            window.favouriteChatIds.delete(chatIdStr);
        }
        const isFav = Boolean(chat.is_favourite || window.favouriteChatIds.has(chatIdStr));

        const preview = formatMessagePreview(chat.last_message, chat.message_type, chat.file_name);
        const isCurrentActive = activeChatId && chatIdStr === activeChatId;
        const unreadCount = isCurrentActive ? 0 : (parseInt(chat.unread_count || 0, 10) || 0);
        const li = document.createElement("li");
        li.classList.add("chat-item-list");
        if (isCurrentActive) {
            li.classList.add("active");
            updateChatHeader(chat.name, chat.image);
        }
        if (unreadCount > 0) li.classList.add("has-unread");
        if (isFav) li.classList.add("is-favourite");

        li.dataset.chatId = chat.id;
        li.dataset.chatType = chat.type;
        if (chat.type === "private") {
            li.dataset.userId = chat.other_user_id || "";
            li.dataset.isOnline = chat.is_online ? "true" : "false";
            li.dataset.lastSeen = chat.last_seen || "";
            if (chat.other_user_id) {
                window.userPresenceCache = window.userPresenceCache || {};
                window.userPresenceCache[String(chat.other_user_id)] = {
                    is_online: Boolean(chat.is_online),
                    last_seen: chat.last_seen || null
                };
            }
        }
        li.dataset.unreadCount = unreadCount;
        li.dataset.isFavourite = isFav ? "true" : "false";
        li.dataset.lastMessage = chat.last_message || "";
        li.dataset.lastPreviewText = preview || "";
        li.dataset.timestamp = chat.timestamp || new Date().toISOString();

        const showOnlineDot = chat.type === "private" && Boolean(chat.is_online);

        li.innerHTML = `
            <a href="/chat/${chat.type}/${chat.id}" class="chat-item" aria-label="Chat with ${chat.name}">
                <div class="chat-content-list">
                    <div class="chat-avatar-wrap">
                        <img class="content-message-image" 
                             src="${chat.image || '/static/images/default-profile.png'}" 
                             alt="${chat.name}" 
                             onerror="this.src='/static/images/default-profile.png'">
                        <span class="sidebar-online-dot" style="${showOnlineDot ? '' : 'display:none;'}"></span>
                    </div>
                    <div class="chat-details content-message-info">
                        <span class="content-message-name">${chat.name}</span>
                        <div class="tooltip-wrapper">
                            <span class="content-message-text">${preview}</span>
                            ${chat.last_message && chat.last_message.length > 10 
                                ? `<div class="custom-tooltip">${chat.last_message}</div>` 
                                : ""}
                        </div>
                        <div class="content-message-meta">
                            ${unreadCount > 0 
                                ? `<span class="content-message-unread">${unreadCount}</span>` 
                                : ""}
                            <span class="content-message-time">
                                ${renderChatFormatTimestamp(chat.timestamp)}
                            </span>
                            <span class="content-message-meta-right">
                                <button type="button" class="chat-fav-btn ${isFav ? 'active' : ''}" 
                                        title="${isFav ? 'Remove from Favourites' : 'Add to Favourites'}"
                                        onclick="toggleFavouriteChat(event, '${chat.id}')">
                                    <i class="${isFav ? 'ri-heart-3-fill' : 'ri-heart-3-line'}"></i>
                                </button>
                            </span>
                        </div>
                    </div>
                    <hr>
                </div>
            </a>
        `;

        chatListEl.appendChild(li);
    });

    saveFavouriteChatIdsToStorage();

    // After adding all elements, make sure the DOM is sorted
    const sortedElements = sortChatListElements(Array.from(chatListEl.querySelectorAll("li.chat-item-list")));
    sortedElements.forEach(el => chatListEl.appendChild(el));
    updateTotalUnreadBadge();
    applyChatFilter();
}

function setChatFilter(filterType) {
    const normalized = (filterType || "all").toLowerCase();
    window.currentChatFilter = normalized;

    // Ensure the main chat list is visible when clicking any filter pill
    if (typeof showChatList === "function") {
        showChatList();
    }

    // Highlight active filter button
    document.querySelectorAll("#chatFilterBar .chat-filter-btn").forEach(btn => {
        if (btn.dataset.filter === normalized) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    applyChatFilter();
}

function applyChatFilter() {
    const chatListEl = document.getElementById("main-chat-list");
    if (!chatListEl) return;

    const filter = (window.currentChatFilter || "all").toLowerCase();
    const items = Array.from(chatListEl.querySelectorAll("li.chat-item-list"));

    // Remove any existing filter empty-state placeholder
    const existingEmpty = chatListEl.querySelector("li.chat-filter-empty-item");
    if (existingEmpty) existingEmpty.remove();

    if (items.length === 0) return;

    let visibleCount = 0;

    items.forEach(item => {
        const unreadCount = parseInt(item.dataset.unreadCount || "0", 10) || 0;
        const isUnread = unreadCount > 0 || item.classList.contains("has-unread");
        const isFav = item.dataset.isFavourite === "true" || item.classList.contains("is-favourite");
        const chatType = (item.dataset.chatType || "private").toLowerCase();

        let matches = true;
        if (filter === "unread") {
            matches = isUnread;
        } else if (filter === "favourites") {
            matches = isFav;
        } else if (filter === "groups") {
            matches = (chatType === "group");
        }

        if (matches) {
            item.style.display = "";
            visibleCount += 1;
        } else {
            item.style.display = "none";
        }
    });

    if (visibleCount === 0 && filter !== "all") {
        const emptyLi = document.createElement("li");
        emptyLi.className = "chat-filter-empty-item";

        let iconClass = "ri-chat-3-line";
        let titleText = "No chats found";
        let subText = "";

        if (filter === "unread") {
            iconClass = "ri-mail-check-line";
            titleText = "No unread chats";
            subText = "You're all caught up!";
        } else if (filter === "favourites") {
            iconClass = "ri-heart-3-line";
            titleText = "No favourite chats yet";
            subText = "Hover over any chat and click the heart icon to add it to Favourites.";
        } else if (filter === "groups") {
            iconClass = "ri-group-line";
            titleText = "No group chats";
            subText = "You haven't joined or created any groups yet.";
        }

        emptyLi.innerHTML = `
            <div class="chat-filter-empty">
                <i class="${iconClass}"></i>
                <p>${titleText}</p>
                ${subText ? `<span>${subText}</span>` : ""}
                <button type="button" class="chat-filter-reset-link" onclick="setChatFilter('all')">
                    View all chats
                </button>
            </div>
        `;
        chatListEl.appendChild(emptyLi);
    }
}

async function toggleFavouriteChat(event, chatId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    if (!chatId) return;

    const chatIdStr = String(chatId);
    const isCurrentlyFav = window.favouriteChatIds.has(chatIdStr);
    const nextFavState = !isCurrentlyFav;

    // Optimistic UI update
    if (nextFavState) {
        window.favouriteChatIds.add(chatIdStr);
    } else {
        window.favouriteChatIds.delete(chatIdStr);
    }
    saveFavouriteChatIdsToStorage();

    document.querySelectorAll(`li.chat-item-list[data-chat-id="${chatIdStr}"]`).forEach(li => {
        li.dataset.isFavourite = nextFavState ? "true" : "false";
        li.classList.toggle("is-favourite", nextFavState);
        const btn = li.querySelector(".chat-fav-btn");
        if (btn) {
            btn.classList.toggle("active", nextFavState);
            btn.title = nextFavState ? "Remove from Favourites" : "Add to Favourites";
            btn.innerHTML = `<i class="${nextFavState ? 'ri-heart-3-fill' : 'ri-heart-3-line'}"></i>`;
        }
    });

    applyChatFilter();

    try {
        const res = await fetch("/toggle_favourite_chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatIdStr,
                user_id: sessionStorage.getItem("user_id"),
                is_favourite: nextFavState
            })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            if (typeof showFlashMessage === "function") {
                showFlashMessage(
                    data.is_favourite ? "Added to Favourites" : "Removed from Favourites",
                    "success"
                );
            }
        }
    } catch (err) {
        console.error("Failed to sync favourite chat status:", err);
    }
}



function sortChatListElements(chatElements) {
    return chatElements.sort((a, b) => {
        const tsA = a.dataset.timestamp ? new Date(a.dataset.timestamp).getTime() : 0;
        const tsB = b.dataset.timestamp ? new Date(b.dataset.timestamp).getTime() : 0;
        return tsB - tsA; // Newest first
    });
}



// ========================================= SOCKET FOR SEND/RECEIVE MESSAGES FUNCTIONALITY ENDS HERE ========================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxxxx


// Helper function to format message preview
function formatMessagePreview(message, messageType, fileName = null) {
    const MAX_PREVIEW_LENGTH = 26;

    // Handle non-text messages (treat "system" as text so system messages show their text)
    if (messageType && messageType !== "text" && messageType !== "system") {
        const previewTexts = {
            image: "🖼️ Image",
            video: "🎬 Video",
            audio: "🎧 Audio",
            pdf: "📄 PDF",
            doc: "📝 Document",
            docx: "📝 Document",
            xls: "📊 Spreadsheet",
            xlsx: "📊 Spreadsheet",
            zip: "🗜️ Archive",
            rar: "🗜️ Archive",
            "7z": "🗜️ Archive",
            file: "📎 File"
        };

        // Determine type from filename if provided
        if (fileName) {
            const ext = fileName.split('.').pop().toLowerCase();
            const base = previewTexts[ext] || previewTexts.file;
            return `${base} (${fileName})`;
        }

        // Fallback to messageType
        return previewTexts[messageType] || previewTexts.file;
    }

    // Handle text and system messages
    if (!message) return ""; // Return empty string if message is null

    return message.length > MAX_PREVIEW_LENGTH
        ? message.slice(0, MAX_PREVIEW_LENGTH) + '…'
        : message;
}



// Visibility change and focus handlers for read receipts
function notifyActiveChatReadReceipts() {
    const activeChatId = cleanTemplateVar(window.activeChatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
    const activeChatType = cleanTemplateVar(window.activeChatType) || cleanTemplateVar(sessionStorage.getItem("active_chat_type")) || "private";
    const currentUserId = sessionStorage.getItem("user_id");

    if (activeChatId && currentUserId && (document.visibilityState === "visible" || document.hasFocus())) {
        clearUnreadForChat(activeChatId);
        socket.emit("mark_messages_as_read", {
            chat_id: activeChatId,
            chat_type: activeChatType,
            user_id: currentUserId
        });
    }
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        notifyActiveChatReadReceipts();
    }
});

window.addEventListener("focus", () => {
    notifyActiveChatReadReceipts();
});

// ========================================= SOCKET FOR STARRED MESSAGES FUNCTIONALITY ===================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxx

// Handle star updates (separate handler, not nested)
socket.on("message_starred", (data) => {
    console.log("⭐ Star update received:", data);

    const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (!messageElement) return;

    const sessionUserId = sessionStorage.getItem("user_id");
    const isOurStar = data.user_id === sessionUserId;

    if (isOurStar || messageElement.closest("#conversation-main")) {
        const isStarred = isOurStar ? data.starred : messageElement.classList.contains("starred");

        messageElement.classList.toggle("starred", isStarred);
        const starIcon = messageElement.querySelector(".starred-icon");
        if (starIcon) {
            starIcon.classList.toggle("ri-star-fill", isStarred);
            starIcon.classList.toggle("ri-star-line", !isStarred);
        }
    }

    // Update chat preview if this chat is in the sidebar
    if (data.group_id || data.private_chat_id) {
        const chatId = data.group_id || data.private_chat_id;
        const chatType = data.group_id ? "group" : "private";
        // updateChatStarIndicator(chatId, data.message_id, data.starred);
    }
});




// ========================================= SOCKET FOR MESSAGE DELETE FUNCTIONALITY ===================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

socket.on('message_deleted', (data) => {
    const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (!messageElement) return;

    const contentBox = messageElement.querySelector('.conversation-item-box');
    const timestampEl = messageElement.querySelector('.timestamp');


    if (data.action === 'deleted_for_everyone') {
        const isSender = messageElement.classList.contains('outgoing');
        const deletedText = isSender ? "You deleted this message." : "This message was deleted.";

        // ✅ Update chat window UI
        if (contentBox) {
            contentBox.innerHTML = `
            <div class="deleted-message">${deletedText}</div>
        `;
            if (timestampEl) {
                const tick = timestampEl.querySelector(".tick");
                if (tick) tick.remove();
                contentBox.appendChild(timestampEl);
            }
        }

        // ✅ Hide extra UI elements in chat area
        const profilePic = messageElement.querySelector('.conversation-item-image');
        if (profilePic) profilePic.style.display = "none";

        const dropdown = messageElement.querySelector('.conversation-item-dropdown');
        if (dropdown) dropdown.style.display = "none";

        const starIcon = messageElement.querySelector('.starred-icon');
        if (starIcon) starIcon.style.display = "none";

        messageElement.classList.add("deleted");

        // ✅ Update chat preview if needed
        const chatId = window.activeChatId;
        const chatType = window.activeChatType;

        const allMessages = [...document.querySelectorAll(".conversation-main .message")];
        const lastMessage = allMessages[allMessages.length - 1];

        if (!lastMessage || lastMessage.dataset.messageId === data.message_id) {
            // 🚀 If deleted msg was last → refresh from backend
            refreshChatPreview(chatId, chatType);
        }
        // UPDATE CHATLIST WITH "YOU DELETED THIS MESSAGE"
        // const allMessages = [...document.querySelectorAll(".conversation-main .message")];
        // const lastMessage = allMessages[allMessages.length - 1];

        // if (!lastMessage || lastMessage.dataset.messageId === data.message_id) {
        //     // 🚀 Deleted message was the last one → show deleted text in chat list
        //     updateChatPreview(chatId, chatType, deletedText, data.timestamp || null);
        // } else {
        //     // 🚀 Deleted message not last → do nothing (keep preview same)
        // }

    } else if (data.action === 'deleted_for_me' && data.user_id === sessionStorage.getItem("user_id")) {
        const messageId = data.message_id;
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const chatId = window.activeChatId;
        const chatType = window.activeChatType;

        // 1. Remove the deleted message from the DOM
        messageElement.remove();

        // 2. Check if this was the last visible message
        const allMessages = [...document.querySelectorAll(".conversation-main .message")];
        const lastMessage = allMessages[allMessages.length - 1];

        if (!lastMessage || lastMessage.dataset.messageId === messageId) {
            // ✅ Deleted message was last → ask backend for new last message
            refreshChatPreview(chatId, chatType);
        }
    }

});

// ======================================== FUNCTION TO UPDATE MESSAGES STATUS FUNTIONALITY ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// Helper: Generate WhatsApp-standard tick HTML
function getTickHtml(status) {
    if (status === "read") {
        return '<span class="tick read" title="Read"><i class="ri-check-double-line"></i></span>';
    } else if (status === "delivered") {
        return '<span class="tick delivered" title="Delivered"><i class="ri-check-double-line"></i></span>';
    } else {
        return '<span class="tick sent" title="Sent"><i class="ri-check-line"></i></span>';
    }
}
window.getTickHtml = getTickHtml;

// Global helper to update a message bubble's tick icon in DOM
function updateMessageTick(messageId, status) {
    if (!messageId) return;
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl || messageEl.classList.contains("deleted")) return;

    // Only outgoing bubbles have ticks
    const isOutgoing = messageEl.classList.contains("outgoing") || 
                       messageEl.querySelector(".conversation-item.outgoing") ||
                       messageEl.querySelector(".outgoing-bubble");
    if (!isOutgoing) return;

    const newTickHtml = getTickHtml(status);

    // 1. Try finding existing dedicated container
    const container = messageEl.querySelector(".message-status-tick");
    if (container) {
        container.innerHTML = newTickHtml;
        return;
    }

    // 2. Try replacing existing .tick element in place
    const existingTick = messageEl.querySelector(".tick");
    if (existingTick) {
        existingTick.outerHTML = newTickHtml;
        return;
    }

    // 3. Fallback: insert before star icon or append to timestamp
    const timestampEl = messageEl.querySelector(".conversation-item-time") || messageEl.querySelector(".timestamp");
    if (timestampEl) {
        const starIcon = timestampEl.querySelector(".starred-icon");
        if (starIcon) {
            starIcon.insertAdjacentHTML("beforebegin", `<span class="message-status-tick">${newTickHtml}</span>`);
        } else {
            timestampEl.insertAdjacentHTML("beforeend", `<span class="message-status-tick">${newTickHtml}</span>`);
        }
    }
}
window.updateMessageTick = updateMessageTick;

// Message Status Handler - Improved Version (WhatsApp Standard)
socket.on("message_status_update", (data) => {
    console.log("📬 Status update received:", data);
    const { message_id, status, recipient_id } = data;
    if (!message_id || !status) return;

    // 1. Update in active chat view immediately
    updateMessageTick(message_id, status);

    // 2. Update local message cache if exists
    if (window.messageCache && window.messageCache[message_id]) {
        window.messageCache[message_id].status = status;
        if (status === "delivered" && recipient_id) {
            window.messageCache[message_id].delivered_to = [
                ...new Set([...(window.messageCache[message_id].delivered_to || []), recipient_id])
            ];
        } else if (status === "read" && recipient_id) {
            window.messageCache[message_id].read_by = [
                ...new Set([...(window.messageCache[message_id].read_by || []), recipient_id])
            ];
        }
    }
});

// ==========================================================================================================================
//                                         CHAT LIST UPDATE SOCKET FUNCTION
// ==========================================================================================================================

socket.on("chat_list_update", function (updatedChat) {
    const chatList = document.getElementById("main-chat-list");

    // Try to find existing chat item by chat_id
    let existingItem = chatList.querySelector(`[data-chat-id="${updatedChat.chat_id}"]`);

    if (existingItem) {
        // Update last message
        const messageTextElem = existingItem.querySelector(".content-message-text");
        if (messageTextElem) {
            messageTextElem.textContent = updatedChat.last_message.length > 10
                ? updatedChat.last_message.substring(0, 10) + "..."
                : updatedChat.last_message;
        }

        // Update tooltip
        const tooltipElem = existingItem.querySelector(".custom-tooltip");
        if (tooltipElem) {
            tooltipElem.textContent = updatedChat.last_message;
        }

        // Update timestamp
        const timeElem = existingItem.querySelector(".content-message-time");
        if (timeElem) {
            timeElem.textContent = updatedChat.timestamp || "-";
        }

        // Move chat to top
        chatList.prepend(existingItem);

    } else {
        // Create new chat row if it doesn't exist yet
        const newItem = document.createElement("li");
        newItem.classList.add("chat-item-list");
        newItem.setAttribute("data-chat-id", updatedChat.chat_id);
        newItem.setAttribute("data-chat-type", updatedChat.chat_type);
        if (updatedChat.chat_type === 'private') {
            newItem.setAttribute("data-user-id", updatedChat.other_user_id);
        }
        newItem.setAttribute("data-unread-count", updatedChat.unread_count || 0);
        newItem.setAttribute("data-last-message", updatedChat.last_message);
        newItem.setAttribute("data-timestamp", updatedChat.timestamp || "");

        // Fill in HTML (matches your server-rendered format)
        newItem.innerHTML = `
            <a href="/open_chat/${updatedChat.chat_type}/${updatedChat.chat_id}" 
                class="chat-item" aria-label="Chat with ${updatedChat.name}">
                <div class="chat-content-list">
                    <img class="content-message-image" src="${updatedChat.image}" alt="${updatedChat.name}"
                        onerror="this.src='/static/images/default-profile.png'">
                    <div class="chat-details content-message-info">
                        <span class="content-message-name">${updatedChat.name}</span>
                        <div class="tooltip-wrapper">
                            <span class="content-message-text">
                                ${updatedChat.last_message.length > 10
                ? updatedChat.last_message.substring(0, 10) + "..."
                : updatedChat.last_message}
                            </span>
                            ${updatedChat.last_message.length > 10
                ? `<div class="custom-tooltip">${updatedChat.last_message}</div>`
                : ""}
                        </div>
                        <div class="content-message-meta">
                            ${updatedChat.unread_count > 0
                ? `<span class="content-message-unread">${updatedChat.unread_count}</span>`
                : ""}
                            <span class="content-message-time">${updatedChat.timestamp || "-"}</span>
                        </div>
                    </div>
                </div>
            </a>
            <div class="chat-options">
                <button type="button" class="menu-btn" onclick="toggleMenu(this)">
                    <i class="ri-more-2-line"></i>
                </button>
                <ul class="chat-dropdown-menu">
                    <li><a href="#" class="chat-dropdown-item" onclick="deleteChat('${updatedChat.chat_id}', this)">
                        <i class="ri-delete-bin-line"></i> Delete
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="archiveChat('${updatedChat.chat_id}', this)">
                        <i class="ri-inbox-archive-line"></i> Archive
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="muteChat('${updatedChat.chat_id}', this)">
                        <i class="ri-volume-mute-line"></i> Mute chat
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="markChat('${updatedChat.chat_id}', this)">
                        <i class="ri-check-double-line"></i> Mark as read
                    </a></li>
                </ul>
            </div>
        `;

        // Insert new chat at the top
        chatList.prepend(newItem);
    }
});

// ======================================== ALL SOCKET FUNCTIONALITIES ENDS HERE =======================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ========================================= HELPER FUNCTIONS STARTS HERE ==============================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ========================================== UPDATE CHAT HEADER AND IMAGE FUNCTION STARTS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxxxxxxxxxxxxxxxx

function updateChatHeader(chatName, chatImage) {
    let chatHeader = document.getElementById("chatHeader");
    let chatImg = document.getElementById("chatHeaderImg");

    if (chatHeader && chatName) {
        chatHeader.textContent = chatName;
    }

    if (chatImg) {
        let resolvedImg = chatImage || "/static/images/default-profile.png";
        if (resolvedImg.includes("/static/default_group.png")) {
            resolvedImg = "/static/images/dsa-logo.png";
        } else if (resolvedImg.includes("/static/default_user.png")) {
            resolvedImg = "/static/images/default-profile.png";
        }
        chatImg.onerror = function () {
            this.onerror = null;
            this.src = "/static/images/default-profile.png";
        };
        chatImg.src = resolvedImg;
        chatImg.style.display = "block";
    } else {
        console.error("❌ Chat header image element not found!");
    }

    // Debugging: Ensure no duplicate images
    const header = document.querySelector(".chat-header");
    if (header) {
        const images = header.querySelectorAll("img");
        if (images.length > 1) {
            console.warn("⚠️ Multiple images detected in header! Removing extras...");
            images.forEach((img, index) => {
                if (index > 0) img.remove(); // Keep only the first image
            });
        }
    }
}

// ========================================== UPDATE CHAT HEADER AND IMAGE FUNCTION ENDS HERE ================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ===========================================  TIMESTAMP FORMAT FUNCTION ====================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


function formatTimestamp(timestamp) {
    if (!timestamp) return "Just now";

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        console.error("❌ Invalid timestamp:", timestamp);
        return "Just now";
    }

    // Always show time only (HH:MM AM/PM)
    return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true
    }).replace(" ", "");
}



function renderChatFormatTimestamp(timestamp) {
    if (!timestamp) return "Just now";

    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
        console.error("❌ Invalid timestamp:", timestamp);
        return "Just now";
    }

    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);

    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
        // Show time like 2:45 PM
        return date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).replace(" ", "");
    } else if (isYesterday) {
        return "Yesterday";
    } else {
        // Show full date like 19-Sept-2025
        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }
}


// =========================================== TIMESTAMP FORMAT FUNCTION ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// =========================================== LOAD CHAT FUNCTION STARTS HERE ==============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxxxxxxxx
async function loadChat(chatId, chatType) {
    chatId = cleanTemplateVar(chatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
    chatType = cleanTemplateVar(chatType) || cleanTemplateVar(sessionStorage.getItem("active_chat_type"));

    if (!chatId || !chatType) {
        console.error("loadChat: Missing chat ID or type!", { chatId, chatType });
        return;
    }

    // Keep global and sessionStorage state in sync regardless of how loadChat was invoked
    setActiveChatState(chatId, chatType);

    // Highlight matching item in sidebar if already rendered
    let matchedSidebarItem = null;
    document.querySelectorAll("li.chat-item-list").forEach(item => {
        if (String(item.dataset.chatId) === String(chatId)) {
            item.classList.add("active");
            matchedSidebarItem = item;
        } else {
            item.classList.remove("active-chat", "active");
        }
    });

    // Ensure the conversation panel is visible and default splash is hidden
    const defaultConv = document.querySelector(".conversation-default");
    const activeConv = document.querySelector("#conversation-1");
    if (defaultConv) {
        defaultConv.classList.remove("active");
        defaultConv.classList.add("hidden");
    }
    if (activeConv) {
        activeConv.classList.remove("hidden");
        activeConv.classList.add("active");
    }

    console.log("📥 Loading chat:", chatId, chatType);

    // Join appropriate socket room
    if (chatType === "group") {
        socket.emit("join_group", { group_id: chatId });
        console.log(`📡 Joining group: ${chatId}`);
    } else if (chatType === "private") {
        socket.emit("join_private_chat", { chat_id: chatId });
        console.log(`📡 Joining private chat: ${chatId}`);
    }

    // Get current user ID
    const currentUserId = sessionStorage.getItem("user_id");

    if (typeof closeInChatSearch === "function") closeInChatSearch();
    if (typeof cancelEditMessage === "function") cancelEditMessage();

    // Populate top chat header immediately from sidebar item if available
    if (matchedSidebarItem) {
        const sidebarName = matchedSidebarItem.querySelector(".content-message-name")?.textContent.trim();
        const sidebarImg = matchedSidebarItem.querySelector(".content-message-image")?.src;
        if (sidebarName) {
            updateChatHeader(sidebarName, sidebarImg);
        }
        if (chatType === "private" && typeof updateChatHeaderStatusFromPresence === "function") {
            updateChatHeaderStatusFromPresence(
                matchedSidebarItem.dataset.isOnline === "true",
                matchedSidebarItem.dataset.lastSeen || null
            );
        }
    }

    fetch(`/chat-info/${chatType}/${chatId}?user_id=${encodeURIComponent(currentUserId || "")}`)
        .then(res => (res.ok ? res.json() : null))
        .then(info => {
            if (!info) return;
            const currentActiveId = window.activeChatId || sessionStorage.getItem("active_chat_id");
            if (currentActiveId && String(currentActiveId) !== String(chatId)) return;
            updateChatHeader(info.name, info.image);
            if (chatType === "private") {
                if (info.other_user_id) {
                    setActiveChatState(chatId, chatType, info.other_user_id);
                    window.userPresenceCache = window.userPresenceCache || {};
                    window.userPresenceCache[String(info.other_user_id)] = {
                        is_online: Boolean(info.is_online),
                        last_seen: info.last_seen || null
                    };
                }
                if (typeof updateChatHeaderStatusFromPresence === "function") {
                    updateChatHeaderStatusFromPresence(Boolean(info.is_online), info.last_seen || null);
                }
            } else if (chatType === "group" && typeof updateGroupHeaderStatus === "function") {
                updateGroupHeaderStatus(info.members_count || 0, info.online_count || 0);
            }
        })
        .catch(err => console.warn("⚠️ Failed to fetch chat header info on load:", err));

    if (chatType === "group" && typeof getGroupMembers === "function") {
        sessionStorage.setItem("active_group_id", chatId);
        getGroupMembers(chatId);
    }

    // Synchronize Group/Contact Info drawer state
    if (typeof syncChatHeaderDrawer === "function") {
        syncChatHeaderDrawer(chatId, chatType, currentUserId);
    }

    const chatbox = document.getElementById("conversation-main");
    if (!chatbox) {
        console.error("Chatbox element not found!");
        return;
    }

    // Initialize/reset pagination state for this active chat
    window.chatPagination = window.chatPagination || {};
    window.chatPagination[chatId] = {
        oldestId: null,
        oldestTimestamp: null,
        hasMore: true,
        isLoading: false
    };

    chatbox.innerHTML = "<p>Loading messages...</p>";

    fetch(`/get_messages?chat_id=${chatId}&chat_type=${chatType}&user_id=${currentUserId}&limit=50`)
        .then(response => response.json())
        .then(data => {
            // Guard against race condition if user switched to another chat while fetching
            const currentActiveId = window.activeChatId || sessionStorage.getItem("active_chat_id");
            if (currentActiveId && String(currentActiveId) !== String(chatId)) {
                return;
            }

            chatbox.innerHTML = "";

            if (!Array.isArray(data.messages)) {
                console.error("Invalid messages format:", data.messages);
                chatbox.innerHTML = "<p>Error loading messages.</p>";
                return;
            }

            // Save pagination metadata
            window.chatPagination[chatId].oldestId = data.oldest_id || (data.messages.length ? (data.messages[0].id || data.messages[0]._id) : null);
            window.chatPagination[chatId].oldestTimestamp = data.oldest_timestamp;
            window.chatPagination[chatId].hasMore = Boolean(data.has_more);

            if (data.messages.length === 0) {
                chatbox.innerHTML = "<p>No messages yet.</p>";
                return;
            }

            let lastDate = null;

            data.messages.forEach(message => {
                // normalize fields for displayMessage
                message.id = message.id || message._id;
                message.timestamp = message.timestamp || new Date().toISOString();
                message.starred_by = message.starred_by || [];

                // Check if current user has starred this message
                const sessionUserId = sessionStorage.getItem("user_id");
                message.starred = message.starred_by && message.starred_by.includes(sessionUserId);

                let messageDate = new Date(message.timestamp).toDateString(); // e.g., "Wed Mar 20 2025"

                if (lastDate !== messageDate) {
                    insertDateSeparator(messageDate); // 🔹 Insert date separator
                    lastDate = messageDate;
                }

                displayMessage(message, chatType);
            });

            chatbox.scrollTop = chatbox.scrollHeight;

            // Attach infinite scroll listener to load older messages when scrolling to top
            attachChatInfiniteScroll(chatbox);
        })
        .catch(error => {
            console.error("Error loading chat messages:", error);
            chatbox.innerHTML = "<p>Error loading messages.</p>";
        });

}


// ===========================================================================================================================
//                                         INFINITE SCROLL UP / PAGINATION
// ===========================================================================================================================

function attachChatInfiniteScroll(chatbox) {
    if (!chatbox || chatbox._paginationListenerAttached) return;
    chatbox._paginationListenerAttached = true;
    chatbox.addEventListener("scroll", handleChatInfiniteScroll);
}

async function handleChatInfiniteScroll() {
    const chatbox = document.getElementById("conversation-main");
    if (!chatbox) return;

    // Trigger only when user scrolls near the top (<= 80px)
    if (chatbox.scrollTop > 80) return;

    const activeChatId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    const activeChatType = window.activeChatType || sessionStorage.getItem("active_chat_type") || "private";
    const currentUserId = sessionStorage.getItem("user_id");

    if (!activeChatId || !window.chatPagination) return;
    const pag = window.chatPagination[activeChatId];
    if (!pag || !pag.hasMore || pag.isLoading || !pag.oldestId) return;

    pag.isLoading = true;

    // Show top loading indicator
    let loadingIndicator = document.getElementById("chat-loading-older-messages");
    if (!loadingIndicator) {
        loadingIndicator = document.createElement("div");
        loadingIndicator.id = "chat-loading-older-messages";
        loadingIndicator.className = "chat-loading-older";
        loadingIndicator.style.cssText = "text-align: center; padding: 8px; font-size: 13px; color: #888;";
        loadingIndicator.innerHTML = '<i class="ri-loader-4-line spin" style="display:inline-block; animation: spin 1s linear infinite;"></i> Loading older messages...';
        chatbox.insertBefore(loadingIndicator, chatbox.firstChild);
    }

    const previousScrollHeight = chatbox.scrollHeight;
    const previousScrollTop = chatbox.scrollTop;

    try {
        const response = await fetch(
            `/get_messages?chat_id=${activeChatId}&chat_type=${activeChatType}&user_id=${currentUserId}&before=${encodeURIComponent(pag.oldestId)}&limit=50`
        );
        const data = await response.json();

        // Check if user changed chat while fetching
        const currentActiveNow = window.activeChatId || sessionStorage.getItem("active_chat_id");
        if (String(currentActiveNow) !== String(activeChatId)) {
            pag.isLoading = false;
            return;
        }

        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.remove();
        }

        if (!data || !Array.isArray(data.messages) || data.messages.length === 0) {
            pag.hasMore = false;
            pag.isLoading = false;
            return;
        }

        pag.oldestId = data.oldest_id || (data.messages.length ? (data.messages[0].id || data.messages[0]._id) : null);
        pag.oldestTimestamp = data.oldest_timestamp;
        pag.hasMore = Boolean(data.has_more);

        // Render older messages into a DocumentFragment
        const fragment = document.createDocumentFragment();
        let lastDate = null;

        const firstExistingSeparator = chatbox.querySelector(".chat-date-separator");
        const firstExistingDateText = firstExistingSeparator ? firstExistingSeparator.textContent.trim() : null;

        for (const message of data.messages) {
            message.id = message.id || message._id;
            message.timestamp = message.timestamp || new Date().toISOString();
            message.starred_by = message.starred_by || [];
            message.starred = message.starred_by && message.starred_by.includes(currentUserId);

            const messageDate = new Date(message.timestamp).toDateString();
            if (lastDate !== messageDate) {
                insertDateSeparator(messageDate, fragment);
                lastDate = messageDate;
            }

            await displayMessage(message, activeChatType, {
                targetContainer: fragment,
                skipScroll: true,
                skipDateSeparator: true
            });
        }

        // Avoid duplicate separator if last date of older batch equals the first date already in view
        if (lastDate && firstExistingSeparator && formatDate(lastDate) === firstExistingDateText) {
            firstExistingSeparator.remove();
        }

        // Prepend all rendered elements
        chatbox.insertBefore(fragment, chatbox.firstChild);

        // Keep viewport stationary relative to the previously visible content
        const newScrollHeight = chatbox.scrollHeight;
        chatbox.scrollTop = (newScrollHeight - previousScrollHeight) + previousScrollTop;

    } catch (err) {
        console.error("Error loading older messages:", err);
        if (loadingIndicator && loadingIndicator.parentNode) {
            loadingIndicator.remove();
        }
    } finally {
        pag.isLoading = false;
    }
}


// ===========================================================================================================================
//                                         DATE FORMATING FUNCTION
// =========================================================================================================================== 

function formatDate(dateString) {
    let date = new Date(dateString);
    let options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString(undefined, options); // Example: "Wednesday, March 20, 2025"
}

function insertDateSeparator(dateString, targetContainer = null) {
    let messagesContainer = targetContainer || document.getElementById("conversation-main");
    if (!messagesContainer) return;

    let dateSeparator = document.createElement("div");
    dateSeparator.className = "chat-date-separator";
    dateSeparator.textContent = formatDate(dateString);

    messagesContainer.appendChild(dateSeparator);
    return dateSeparator;
}


// ================================================== LOAD CHAT FUNCTION ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ================================================== REFRESH CHAT PREVIEWS HERE ===========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


async function refreshChatPreview(chatId, chatType) {
    const userId = sessionStorage.getItem("user_id");
    try {
        const res = await fetch(`/get_last_message?chat_id=${chatId}&chat_type=${chatType}&user_id=${userId}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to fetch last message");

        const rawMessage = data.message || "No messages";
        const messageType = data.message_type || "text";  // 👈 expect backend to return this
        const timestamp = data.timestamp || null;

        // ✅ Use your helper
        const previewText = formatMessagePreview(rawMessage, messageType);

        updateChatPreview(chatId, chatType, previewText, timestamp);
    } catch (err) {
        console.error("Error refreshing chat preview:", err);
    }
}


// ====================================== LOAD CHAT FUNCTION ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ======================================= DISPLAY MESSAGE FUNCTION STARTS HERE ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxXxxxxx

async function displayMessage(data, chatType, options = {}) {
    let messagesContainer = options.targetContainer || document.getElementById("conversation-main");

    if (!messagesContainer) {
        console.error("❌ Chatbox not found!");
        return;
    }

    if (!data) return;
    data.id = data.id || data._id || data.temp_id;
    data.timestamp = data.timestamp || new Date().toISOString();

    // Remove any placeholder paragraphs ("No messages yet.", "Loading messages...", etc.)
    Array.from(messagesContainer.children).forEach(child => {
        if (child.tagName === "P") {
            child.remove();
        }
    });

    // ================== SYSTEM MESSAGES (special handling) ===================
    if (data.message_type === "system") {
        if (data.id && document.getElementById(`message-${data.id}`)) {
            return;
        }
        const systemWrapper = document.createElement("div");
        systemWrapper.classList.add("system-message"); // style this in CSS
        if (data.id) systemWrapper.id = `message-${data.id}`;
        systemWrapper.textContent = data.message; // e.g. "You created this group"
        if (options.prepend) {
            messagesContainer.insertBefore(systemWrapper, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(systemWrapper);
        }
        if (!options.skipScroll) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        return systemWrapper; // ✅ stop here, don't render like a normal message
    }

    // Initialize message cache if not exists
    if (!window.messageCache) window.messageCache = {};

    // Check if an optimistic message or already-rendered message exists in DOM
    const existingTempEl = data.temp_id ? document.getElementById(`message-${data.temp_id}`) : null;
    const existingIdEl = data.id ? document.getElementById(`message-${data.id}`) : null;

    if (existingIdEl && !existingTempEl) {
        // Message with this real ID is already in the DOM; just ensure cache and tick are up to date
        window.messageCache[data.id] = { ...(window.messageCache[data.id] || {}), ...data };
        let isRead = (data.status === "read");
        if (!isRead && Array.isArray(data.read_by) && data.read_by.length > 0) {
            const currentUid = sessionStorage.getItem("user_id");
            isRead = data.read_by.some(uid => uid && String(uid) !== String(currentUid));
        }
        const effectiveStatus = isRead ? "read" : (data.status || "sent");
        updateMessageTick(data.id, effectiveStatus);
        return;
    }

    // Get current user ID
    const sessionUserId = sessionStorage.getItem("user_id");
    const isOutgoing = String(data.user_id) === String(sessionUserId);

    // Check cache for existing status data
    const cachedMessage = window.messageCache[data.id] || (data.temp_id ? window.messageCache[data.temp_id] : null);
    if (cachedMessage) {
        // Merge cached status data with incoming message
        data.status = cachedMessage.status || data.status;
        data.delivered_to = cachedMessage.delivered_to || data.delivered_to || [];
        data.read_by = cachedMessage.read_by || data.read_by || [];
    }

    // Update cache
    window.messageCache[data.id] = data;
    if (data.temp_id && data.id !== data.temp_id) {
        delete window.messageCache[data.temp_id];
    }

    // Ensure a date separator exists for this message's date
    if (!existingTempEl && !options.skipDateSeparator) {
        const msgDateStr = new Date(data.timestamp).toDateString();
        const expectedFormattedDate = formatDate(msgDateStr);
        const separators = messagesContainer.querySelectorAll(".chat-date-separator");
        const lastSeparator = separators.length > 0 ? separators[separators.length - 1] : null;
        if (!lastSeparator || lastSeparator.textContent !== expectedFormattedDate) {
            insertDateSeparator(msgDateStr, messagesContainer);
        }
    }

    // Create message wrapper
    const messageWrapper = document.createElement("div");
    messageWrapper.classList.add("message-wrapper", isOutgoing ? "outgoing" : "incoming");
    messageWrapper.id = `message-${data.id}`;
    messageWrapper.dataset.messageId = data.id;

    // ✅ avatar fallback
    let avatarUrl = data.user_id ? `/profile_picture/${data.user_id}` : "/static/default-avatar.png";


    // ================== Handle deleted messages ===================

    // Handle deleted messages
    if (data.is_deleted) {
        const deletedText = isOutgoing ? "You deleted this message." : "This message was deleted.";
        messageWrapper.classList.add("deleted");

        messageWrapper.innerHTML = `
            <div class="conversation-item ${isOutgoing ? 'outgoing' : 'incoming'} deleted">
                ${!isOutgoing ? `
                    <div class="conversation-item-side">
                        <img class="conversation-item-image" src="/profile_picture/${data.user_id}" alt="">
                    </div>
                ` : ''}

                <div class="conversation-item-content">
                    <div class="conversation-item-wrapper">
                        <div class="conversation-item-box ${isOutgoing ? 'outgoing-bubble' : 'incoming-bubble'}">
                            <div class="conversation-item-text deleted-message">
                                ${deletedText}
                            </div>
                            <div class="timestamp conversation-item-time">
                                ${formatTimestamp(data.timestamp)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (existingTempEl) {
            messagesContainer.replaceChild(messageWrapper, existingTempEl);
        } else if (options.prepend) {
            messagesContainer.insertBefore(messageWrapper, messagesContainer.firstChild);
        } else {
            messagesContainer.appendChild(messageWrapper);
        }
        if (!options.skipScroll) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        return messageWrapper;
    }

    // ================== Normal messages ===================


    const senderName = (chatType === "group" && data.sender) ? `<strong>${escapeHtml(data.sender)}:</strong> ` : "";
    const isTextMsg = !data.message_type || data.message_type === "text";
    let messageText = isTextMsg
        ? (typeof linkifyMessageText === "function" ? linkifyMessageText(data.message || "") : escapeHtml(data.message || ""))
        : "";
    messageWrapper.dataset.rawMessage = isTextMsg ? (data.message || "") : "";
    let filePreview = "";

    // ✅ Handle GridFS-based media
    if (!data.is_deleted && data.file_id) {
        const fileUrl = `/file/${data.file_id}`;
        const fileName = data.file_name || "file"; // fallback
        filePreview = generateFilePreview(fileUrl, data.message_type, fileName);
    }

    // ====================== REPLY FUNCTIONALITY STARTS HERE ==============================================
    let replyHtml = '';
    if (data.reply_to) {
        const reply = data.reply_to;
        const replySender = reply.sender || (reply.user_id === sessionUserId ? "You" : "Someone");
        const replyType = reply.message_type || 'text';

        // Prefer GridFS file_id URL, otherwise use legacy message path
        function buildReplyFileUrl(r) {
            if (r.file_id) return `/file/${r.file_id}`;
            if (r.message && typeof r.message === 'string') {
                if (r.message.startsWith('http')) return r.message;
                if (r.message.startsWith('/')) return window.location.origin + r.message;
                return window.location.origin + '/' + r.message;
            }
            return null;
        }

        const replyFileUrl = buildReplyFileUrl(reply);
        const replyFileName = reply.file_name || (reply.message ? reply.message.split('/').pop().split('?')[0] : null);

        let previewContent = '';

        if (replyType === "text") {
            const replyText = reply.message || "";
            let textPreview = replyText.length > 60 ? replyText.slice(0, 60) + "..." : replyText;
            previewContent = `
            <div class="reply-text-preview">
                <i class="ri-chat-1-line reply-icon"></i>
                <em>${escapeHtml(textPreview)}</em>
            </div>
        `;
        } else if (replyFileUrl) {
            // Compact, non-clickable media/file preview
            if (replyType === "image") {
                previewContent = `
                <div class="reply-media-preview-compact" data-reply-id="${reply.message_id}">
                    <img src="${replyFileUrl}" alt="${replyFileName || 'image'}" class="reply-thumb">
                    <span class="reply-filename">${replyFileName || "Image"}</span>
                </div>
            `;
            } else {
                previewContent = `
                <div class="reply-media-preview-compact" data-reply-id="${reply.message_id}">
                    <i class="ri-file-2-line reply-file-icon"></i>
                    <span class="reply-filename">${replyFileName || "File"}</span>
                </div>
            `;
            }
        } else {
            // No usable file or text (deleted / missing)
            const fallbackText = reply.is_deleted ? "[Original message deleted]" : (reply.message || "[Unsupported reply]");
            previewContent = `
            <div class="reply-text-preview">
                <i class="ri-chat-1-line reply-icon"></i>
                <em>${escapeHtml(fallbackText)}</em>
            </div>
        `;
        }

        replyHtml = `
        <div class="replied-message" data-reply-id="${reply.message_id}">
            <div class="reply-header">
                <i class="ri-reply-line reply-arrow"></i>
                <strong>${escapeHtml(replySender)}</strong>
            </div>
            ${previewContent}
        </div>
    `;
    }
    // ====================== REPLY FUNCTIONALITY ENDS HERE ==============================================

    // ====================== MESSAGE FORWARD FUNCTIONALITY STARTS HERE =====================================

    // Generate forwarded label if needed
    let forwardedHtml = '';
    if (data.forwarded === true && data.user_id !== sessionUserId) {
        forwardedHtml = `
            <div class="forwarded-label">
                <i class="ri-share-forward-line"></i>
                <span>Forwarded</span>
            </div>
        `;
    }

    // ====================== MESSAGE FORWARD FUNCTIONALITY ENDS HERE ======================================

    // ====================== TICK ICON FUNCTIONALITY STARTS HERE ==========================================

    // Generate WhatsApp status tick based on current status (outgoing messages only)
    let tickIcon = "";
    if (isOutgoing) {
        let isRead = (data.status === "read");
        if (!isRead && Array.isArray(data.read_by) && data.read_by.length > 0) {
            isRead = data.read_by.some(uid => uid && String(uid) !== String(sessionUserId));
        }

        let effectiveStatus = isRead ? "read" : (data.status || "sent");
        tickIcon = `<span class="message-status-tick">${getTickHtml(effectiveStatus)}</span>`;
    }

    // ====================== TICK ICON FUNCTIONALITY ENDS HERE ============================================

    // ====================== STAR ICON FUNCTIONALITY STARTS HERE ==========================================

    // Generate star icon
    const isStarred = data.starred_by?.includes(sessionUserId) || false;
    const starIcon = `
        <i class="${isStarred ? 'ri-star-fill' : 'ri-star-line'} starred-icon" 
           onclick="toggleStarMessage('${data.id}')"></i>
    `;

    // ====================== STAR ICON FUNCTIONALITY ENDS HERE =============================================

    const canEditMessage = isOutgoing && isTextMsg && !data.file_id && !String(data.id || "").startsWith("temp_");
    const editedBadgeHtml = `<span class="edited-message-tag">${data.edited ? "(edited)" : ""}</span>`;

    // ====================== MESSAGE DROPDOWN FUNCTIONALITY STARTS HERE ====================================     
    // Build message HTML
    messageWrapper.innerHTML = `
        <div class="conversation-item ${isOutgoing ? 'outgoing' : 'incoming'} ${isStarred ? 'starred' : ''}">
            ${isOutgoing ? `
                <div class="conversation-item-dropdown">
                    <button type="button" class="conversation-item-dropdown-toggle">
                        <i class="ri-more-2-line"></i>
                    </button>
                    <ul class="conversation-item-dropdown-list">
                        <li><a href="#" class="dropdown-item reply-message" data-message-id="${data.id}"><i class="ri-reply-line"></i> Reply</a></li>
                        ${canEditMessage ? `<li><a href="#" class="dropdown-item edit-message" data-message-id="${data.id}"><i class="ri-edit-2-line"></i> Edit</a></li>` : ''}
                        <li><a href="#" class="dropdown-item copy-message" data-message-id="${data.id}"><i class="ri-file-copy-line"></i> Copy</a></li>
                        <li><a href="#" class="dropdown-item star-message" data-message-id="${data.id}"><i class="ri-star-line"></i> Star</a></li>
                        <li><a href="#" class="dropdown-item delete-message" data-message-id="${data.id}" data-is-sender="true"><i class="ri-delete-bin-line"></i> Delete</a></li>
                        <li><a href="#" class="dropdown-item forward-message" data-message-id="${data.id}"><i class="ri-share-forward-line"></i> Forward</a></li>
                    </ul>
                </div>
            ` : ''}
            
            ${!isOutgoing ? `
                <div class="conversation-item-side">
                    <img class="conversation-item-image" src="/profile_picture/${data.user_id}" alt="">
                </div>
            ` : ''}
            
            <div class="conversation-item-content">
                <div class="conversation-item-wrapper">
                    <div class="conversation-item-box ${isOutgoing ? 'outgoing-bubble' : 'incoming-bubble'}">
                        <div class="conversation-item-text">
                            ${forwardedHtml}
                            ${replyHtml}
                            <p class="message-text">${senderName ? senderName + '<br>' : ''}<span class="message-body-content">${messageText}</span></p>
                            ${filePreview}
                            <div class="timestamp conversation-item-time">
                                ${editedBadgeHtml}
                                ${formatTimestamp(data.timestamp)}
                                ${tickIcon}
                                ${starIcon}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            ${isOutgoing ? `
                <div class="conversation-item-side">
                    <img class="conversation-item-image" src="/profile_picture/${sessionUserId}" alt="">
                </div>
            ` : ''}
            
            ${!isOutgoing ? `
                <div class="conversation-item-dropdown">
                    <button type="button" class="conversation-item-dropdown-toggle">
                        <i class="ri-more-2-line"></i>
                    </button>
                    <ul class="conversation-item-dropdown-list">
                        <li><a href="#" class="dropdown-item reply-message" data-message-id="${data.id}"><i class="ri-reply-line"></i> Reply</a></li>
                        <li><a href="#" class="dropdown-item copy-message" data-message-id="${data.id}"><i class="ri-file-copy-line"></i> Copy</a></li>
                        <li><a href="#" class="dropdown-item star-message" data-message-id="${data.id}"><i class="ri-star-line"></i> Star</a></li>
                        <li><a href="#" class="dropdown-item delete-message" data-message-id="${data.id}" data-is-sender="false"><i class="ri-delete-bin-line"></i> Delete for Me</a></li>
                        <li><a href="#" class="dropdown-item forward-message" data-message-id="${data.id}"><i class="ri-share-forward-line"></i> Forward</a></li>
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    // Add to DOM (or replace optimistic element) and scroll to bottom
    if (existingTempEl) {
        messagesContainer.replaceChild(messageWrapper, existingTempEl);
    } else if (options.prepend) {
        messagesContainer.insertBefore(messageWrapper, messagesContainer.firstChild);
    } else {
        messagesContainer.appendChild(messageWrapper);
    }
    if (!options.skipScroll) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    return messageWrapper;
}




// ==============================
// Helper: Escape HTML for safe text rendering
// ==============================
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ================================== CHAT AREA DROP DOWN TOGGLE STARTS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

document.querySelectorAll('.conversation-item-dropdown-toggle').forEach(function (item) {
    item.addEventListener('click', function (e) {
        e.preventDefault()
        if (this.parentElement.classList.contains('active')) {
            this.parentElement.classList.remove('active')
        } else {
            document.querySelectorAll('.conversation-item-dropdown').forEach(function (i) {
                i.classList.remove('active')
            })
            this.parentElement.classList.add('active')
        }
    })
})


document.addEventListener('click', function (e) {
    if (!e.target.matches('.conversation-item-dropdown, .conversation-item-dropdown *')) {
        document.querySelectorAll('.conversation-item-dropdown').forEach(function (i) {
            i.classList.remove('active')
        })
    }
})


// ================================== CHAT AREA DROP DOWN TOGGLE ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ================================== REPLY MESSAGE FUNCTIONALITY STARTS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


function scrollToMessage(messageId) {
    const target = document.getElementById(`message-${messageId}`);
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });

        // Optional visual cue
        target.classList.add("highlight");
        setTimeout(() => target.classList.remove("highlight"), 1500);
    } else {
        console.warn(`Message #${messageId} not found in DOM`);
    }
}

document.addEventListener("click", function (e) {
    const replyBlock = e.target.closest('.replied-message');
    if (replyBlock) {
        const replyId = replyBlock.getAttribute("data-reply-id");
        if (replyId) {
            scrollToMessage(replyId);
        }
    }
});


// ================================== REPLY MESSAGE FUNCTIONALITY ENDS HERE ================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ==================================================== SEARCH USER FUNCTION STARTS HERE ====================================

function searchUser() {
    let query = document.getElementById("searchInput").value.trim();
    if (query.length < 2) {
        document.getElementById("searchResults").innerHTML = "";
        return;
    }

    fetch(`/search_users?query=${query}`)
        .then(response => response.json())
        .then(data => {
            let searchResults = document.getElementById("searchResults");
            searchResults.innerHTML = "";

            if (data.length === 0) {
                searchResults.innerHTML = "<p>No users found</p>";
                return;
            }

            data.forEach(user => {
                let userItem = document.createElement("div");
                userItem.classList.add("search-item");

                // Use profile picture URL from backend
                let userImage = user.image_url || "/static/images/default-profile.png";

                userItem.innerHTML = `
                    <div class="search-user">
                        <img src="${userImage}" alt="User Avatar" class="user-avatar">
                        <div class="user-details">
                            <p>${user.firstname} ${user.lastname} (${user.staffid})</p>
                        </div>
                    </div>
                `;

                //Handle click event to start private chat
                userItem.onclick = async () => {
                    // Pass user.id, fullName, and imageUrl to startPrivateChat
                    await startPrivateChat(user.id, `${user.firstname} ${user.lastname}`, user.image_url);
                    searchResults.innerHTML = "";  // Clear search results
                    document.getElementById("searchInput").value = "";  // Clear input field
                };

                searchResults.appendChild(userItem);
            });
        })
        .catch(error => console.error("Error searching users:", error));
}

// ================================== SEARCH USER FUNCTION ENDS HERE ========================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx




// ================================== PRIVATE CHAT FUNCTIONALITY START HERE =================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ==========================================================================================================================
//                                         START A PRIVATE CHAT FROM SEARCH RESULT
// ==========================================================================================================================
async function startPrivateChat(user_id, fullName, imageUrl) {
    if (!user_id) {
        console.error("❌ Cannot start chat: missing user ID");
        return null;
    }

    // Clear search UI
    const searchResultsEl = document.getElementById("searchResults");
    const searchInputEl = document.getElementById("searchInput");
    if (searchResultsEl) searchResultsEl.innerHTML = "";
    if (searchInputEl) searchInputEl.value = "";

    const chatList = document.querySelector("#chat-list > ul.content-messages-list");
    if (!chatList) {
        console.error("Chat list element not found!");
        return null;
    }

    // 1️⃣ See if this chat already exists in sidebar
    let existingChat = findExistingChatByEither(chatList, user_id);
    if (existingChat && existingChat.dataset.chatId) {
        console.log("🔄 Chat already exists → activating");
        await activateChat(existingChat, fullName, imageUrl, user_id);
        return { chatElement: existingChat, chatId: existingChat.dataset.chatId };
    }

    // 2️⃣ Create chat via backend
    try {
        const response = await fetch("/start_private_chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id })
        });
        const data = await response.json();

        if (!data.success) {
            console.error("Error starting chat:", data.error);
            return null;
        }

        const chatId = data.chat_id;

        // 3️⃣ Check again in case it got added by another process
        existingChat = findExistingChatByEither(chatList, user_id, chatId);
        if (existingChat) {
            console.log("⚠️ Chat appeared after backend call → using it");
            existingChat.dataset.chatId = String(chatId);
            existingChat.dataset.userId = String(user_id);
            await activateChat(existingChat, fullName, imageUrl, user_id);
            return { chatElement: existingChat, chatId };
        }

        // 4️⃣ Get last message for preview
        let lastMessage = null, lastMessageTime = null;
        try {
            const lastMsgResp = await fetch(`/get_last_message?chat_id=${chatId}&chat_type=private&user_id=${sessionStorage.getItem("user_id")}`);
            const lastMsgData = await lastMsgResp.json();
            if (lastMsgData.message) {
                lastMessage = lastMsgData.message;
                lastMessageTime = lastMsgData.timestamp;
            }
        } catch (err) {
            console.warn("⚠️ Failed to fetch last message:", err);
        }

        // 5️⃣ Create new chat in sidebar
        const chatItem = createChatItem(user_id, fullName, imageUrl, chatId, lastMessage, lastMessageTime);
        chatItem.dataset.userId = String(user_id);
        chatItem.dataset.chatId = String(chatId);
        chatList.prepend(chatItem);

        // 6️⃣ Activate and load full history
        await new Promise(resolve => requestAnimationFrame(resolve));
        await activateChat(chatItem, fullName, imageUrl, user_id);

        return { chatElement: chatItem, chatId };

    } catch (err) {
        console.error("❌ Failed to start private chat:", err);
        return null;
    }
}

// ==========================================================================================================================
//                                         FIND EXISTING CHAT BY USER_ID FUNCTION
// ==========================================================================================================================

function findExistingChatByEither(chatList, user_id, chat_id) {
    const chatItems = chatList.querySelectorAll(".chat-item-list");
    const uid = user_id ? String(user_id) : null;
    const cid = chat_id ? String(chat_id) : null;

    for (let item of chatItems) {
        if (uid && item.dataset.userId === uid) return item;
        if (cid && item.dataset.chatId === cid) return item;
    }
    return null;
}


// ==========================================================================================================================
//                         LOAD CHAT HISTORY FROM BACKEND AND DISPLAY USING DISPLAYMESSAGE FUNCTION
// ==========================================================================================================================

async function loadChatHistory(chatId, chatType, user_id) {
    if (!chatId || !chatType) return;
    await loadChat(chatId, chatType);
}

// ==========================================================================================================================
//                                             ACTIVATE PRIVATE CHAT BY ADDING ACTIVE CLASS
// ==========================================================================================================================
async function activateChat(chatElement, fullName, imageUrl, fallbackUserId = null) {
    if (!chatElement) {
        console.error("❌ activateChat called with no chatElement");
        return;
    }

    // Remove active classes from all sidebar chats
    document.querySelectorAll(".chat-item-list").forEach(item => item.classList.remove("active-chat", "active"));

    // Mark this chat as active
    chatElement.classList.add("active");

    // Ensure conversation pane is shown
    const defaultConv = document.querySelector(".conversation-default");
    const activeConv = document.querySelector("#conversation-1");
    if (defaultConv) defaultConv.classList.remove("active");
    if (activeConv) activeConv.classList.add("active");

    // Update chat header and ensure chat area is visible
    updateChatHeader(fullName, imageUrl);
    showChatList();
    const conversationMain = document.getElementById("conversation-main");
    if (conversationMain) conversationMain.classList.remove("hidden");

    // Detect chat type
    const chatType = chatElement.dataset.chatType || "private";
    const chatId = chatElement.dataset.chatId || null;
    let userId = chatElement.dataset.userId || fallbackUserId || null;

    if (!chatId) console.warn("⚠️ activateChat: chatId missing from element dataset");
    if (chatType === "private" && !userId) {
        console.warn("⚠️ activateChat: userId missing for private chat");
        const pendingId = sessionStorage.getItem("pending_recipient_id");
        if (pendingId) userId = pendingId;
    }

    // Synchronize state
    setActiveChatState(chatId, chatType, userId);
    sessionStorage.setItem("active_chat_partner_name", fullName || "");
    sessionStorage.setItem("active_chat_partner_image", imageUrl || "");

    // Initialize chat content using the true chatId (not userId)
    try {
        if (chatType === "private" && chatId) {
            await switchChat(chatId, "private", userId);
        } else if (chatType === "group" && chatId) {
            await switchChat(chatId, "group");
        } else if (conversationMain) {
            conversationMain.innerHTML = "<p class='empty-chat'>No messages yet</p>";
        }
    } catch (error) {
        console.error("Error switching chat:", error);
        if (chatId) loadChat(chatId, chatType);
    }
}

// ==========================================================================================================================
//                                           CREATE NEW CHAT FOR NEW PRIVATE CHAT
// ==========================================================================================================================

// Updated createChatItem to show last message if available
function createChatItem(user_id, fullName, imageUrl, chat_id, lastMessage = null, lastMessageTime = null) {
    const isFav = Boolean(window.favouriteChatIds && window.favouriteChatIds.has(String(chat_id)));
    const chatItem = document.createElement("li");
    chatItem.className = "chat-item-list";
    if (isFav) chatItem.classList.add("is-favourite");
    chatItem.dataset.userId = user_id;
    chatItem.dataset.chatId = chat_id;
    chatItem.dataset.chatType = "private";
    chatItem.dataset.chatName = fullName || "";
    chatItem.dataset.chatImage = imageUrl || "/static/images/default-profile.png";
    chatItem.dataset.unreadCount = "0";
    chatItem.dataset.isFavourite = isFav ? "true" : "false";
    chatItem.dataset.lastMessage = lastMessage || "";
    chatItem.dataset.lastMessageTime = lastMessageTime || "";

    // Format time if available
    let displayTime = "-";
    if (lastMessageTime) {
        displayTime = renderChatFormatTimestamp(lastMessageTime);
    }

    chatItem.innerHTML = `
        <a href="javascript:void(0)" class="chat-item">
            <div class="chat-content-list">
                <img class="content-message-image" src="${imageUrl || '/static/images/default-profile.png'}" alt="Chat Image"
                    onerror="this.src='/static/images/default-profile.png';">
                <div class="chat-details content-message-info">
                    <span class="content-message-name">${fullName}</span>
                    <div class="tooltip-wrapper">
                        <span class="content-message-text">${lastMessage || "No messages yet"}</span>
                        <div class="custom-tooltip">${lastMessage || "No messages yet"}</div>
                    </div>
                    <div class="content-message-meta">
                        <span class="content-message-time">${displayTime}</span>
                        <span class="content-message-meta-right">
                            <button type="button" class="chat-fav-btn ${isFav ? 'active' : ''}" 
                                    title="${isFav ? 'Remove from Favourites' : 'Add to Favourites'}"
                                    onclick="toggleFavouriteChat(event, '${chat_id}')">
                                <i class="${isFav ? 'ri-heart-3-fill' : 'ri-heart-3-line'}"></i>
                            </button>
                        </span>
                    </div>
                </div>
            </div>
        </a>
        <hr>
        <div class="chat-options">
            <button type="button" class="menu-btn" onclick="toggleMenu(this)">
                <i class="ri-more-2-line"></i>
            </button>
            <ul class="chat-dropdown-menu">
                <li><a href="#" class="chat-dropdown-item" onclick="deleteChat('${chat_id}', this)">
                    <i class="ri-delete-bin-line"></i> Delete
                </a></li>
                <hr>
                <li><a href="#" class="chat-dropdown-item" onclick="archiveChat('${chat_id}', this)">
                    <i class="ri-inbox-archive-line"></i> Archive
                </a></li>
                <hr>
                <li><a href="#" class="chat-dropdown-item" onclick="muteChat('${chat_id}', this)">
                    <i class="ri-volume-mute-line"></i> Mute chat
                </a></li>
                <hr>
                <li><a href="#" class="chat-dropdown-item" onclick="markChat('${chat_id}', this)">
                    <i class="ri-check-double-line"></i> Mark as read
                </a></li>
            </ul>
        </div>
    `;

    chatItem.addEventListener("click", handleChatClick);
    return chatItem;
}


// ================================== PRIVATE CHAT FUNCTIONALITY ENDS HERE ==================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ================================== SEND MESSAGE FUNCTIONALITY STARTS HERE =================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

document.addEventListener("DOMContentLoaded", function () {
    // DOM elements
    const sendButton = document.getElementById("sendButton");
    const messageInput = document.getElementById("messageInput");
    const fileInput = document.getElementById("fileInput");

    // Remove existing event listeners to avoid duplicates
    sendButton.removeEventListener("click", sendMessage);
    messageInput.removeEventListener("keypress", handleEnterKey);

    // Attach event listeners
    sendButton.addEventListener("click", sendMessage);
    messageInput.addEventListener("keypress", handleEnterKey);

    async function sendMessage() {
        const file = fileInput.files[0];
        const message = messageInput.value.trim();

        if (typeof notifyLocalStopTyping === "function") {
            notifyLocalStopTyping();
        }

        if (window.editingMessageId) {
            if (!message) {
                showFlashMessage("Edited message cannot be empty", "error");
                return;
            }
            await submitEditMessage(window.editingMessageId, message);
            return;
        }

        let chatType = cleanTemplateVar(window.activeChatType) || cleanTemplateVar(sessionStorage.getItem("active_chat_type"));
        let activeChatId = cleanTemplateVar(window.activeChatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
        const senderName = `${sessionStorage.getItem("firstname") || ""} ${sessionStorage.getItem("lastname") || ""}`.trim();
        const replyToMessageId = document.getElementById("reply_to_message_id")?.value || null;

        // Debugging output
        debugChatState();
        console.log("▶️ sendMessage called", { message, file, chatType, activeChatId, user_id: sessionStorage.getItem("user_id") });

        if (!message && !file) {
            console.error("❌ Please enter a message or select a file.");
            return;
        }

        if (!chatType || !activeChatId) {
            console.error("❌ No active chat selected");
            return;
        }

        if (chatType === "private" && window.currentChatBlockState && String(window.currentChatBlockState.chatId) === String(activeChatId)) {
            if (window.currentChatBlockState.isBlockedByMe) {
                showFlashMessage("You blocked this contact. Unblock them to send a message.", "error");
                return;
            }
            if (window.currentChatBlockState.isBlockedByOther) {
                showFlashMessage("You cannot send messages to this contact.", "error");
                return;
            }
        }

        // Ensure window & sessionStorage are synced
        setActiveChatState(activeChatId, chatType);

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Prepare message payload
        const messageData = {
            temp_id: tempId,
            user_id: sessionStorage.getItem("user_id"),
            [chatType === "private" ? "private_chat_id" : "group_id"]: activeChatId,
            message: message || null,
            message_type: "text",  // default
            timestamp: new Date().toISOString(),
            sender: senderName,
            reply_to_message_id: replyToMessageId,
            file_id: null
        };
        console.log("📩 Message Data:", messageData);

        // Handle file upload first
        if (file) {
            try {
                const formData = new FormData();
                formData.append("file", file);

                const response = await fetch("/upload", {
                    method: "POST",
                    body: formData
                });
                const result = await response.json();

                if (!result.success) {
                    return console.error("❌ File upload failed:", result.error);
                }

                // Attach file reference
                messageData.file_id = result.file_id;
                messageData.file_name = result.file_name;
                messageData.message_type = result.file_type; // e.g. "image", "video", "document"
                messageData.message = null; // content lives in GridFS now
            } catch (error) {
                return console.error("❌ File upload error:", error);
            }
        }

        // Clear input immediately
        messageInput.value = "";
        fileInput.value = "";

        // Clear preview UI
        const filePreview = document.getElementById("filePreview");
        if (filePreview) filePreview.remove();
        const replyPreview = document.getElementById("replyPreview");
        if (replyPreview) {
            replyPreview.style.display = "none";
            document.getElementById("replyContent").textContent = '';
            document.getElementById("reply_to_message_id").value = "";
        }

        // Build optimistic reply preview if replying to a cached message
        let optimisticReply = null;
        if (replyToMessageId && window.messageCache && window.messageCache[replyToMessageId]) {
            const cachedOrig = window.messageCache[replyToMessageId];
            optimisticReply = {
                message_id: replyToMessageId,
                sender: cachedOrig.sender || "User",
                message: cachedOrig.message,
                message_type: cachedOrig.message_type || "text",
                file_id: cachedOrig.file_id || null,
                file_name: cachedOrig.file_name || null,
                is_deleted: cachedOrig.is_deleted || false
            };
        }

        // Render optimistically right away so the sender always sees their message immediately
        await displayMessage({
            ...messageData,
            id: tempId,
            status: "sent",
            reply_to: optimisticReply
        }, chatType);

        // Build preview for chat list
        const currentChatType = chatType;
        const currentChatId = activeChatId;
        const currentUserId = sessionStorage.getItem("active_chat_user_id");
        const previewText = formatMessagePreview(
            messageData.file_id ? `[${messageData.message_type} uploaded]` : messageData.message,
            messageData.message_type, messageData.file_name
        );

        moveChatToTop(currentChatId, currentChatType, currentUserId);
        updateChatPreview(currentChatId, currentChatType, previewText, messageData.timestamp, false);

        // Send via socket with safe acknowledgment handling
        socket.emit("send_message", messageData, async (ack) => {
            console.log("📡 Message acknowledgment received:", ack);

            if (ack && ack.success) {
                if (ack.message) {
                    const activeIdNow = window.activeChatId || sessionStorage.getItem("active_chat_id");
                    if (String(activeIdNow) === String(currentChatId) || String(activeIdNow) === String(ack.message.private_chat_id || ack.message.group_id)) {
                        await displayMessage(ack.message, currentChatType);
                    }
                }
                moveChatToTop(currentChatId, currentChatType, currentUserId);
                updateChatPreview(currentChatId, currentChatType, previewText, new Date().toISOString(), false);
            } else if (ack && !ack.success) {
                const tempEl = document.querySelector(`.message-wrapper[data-message-id="${tempId}"], .conversation-item[data-message-id="${tempId}"]`);
                if (tempEl) tempEl.remove();
                showFlashMessage(ack.error || "Failed to send message", "error");
                if (ack.blocked && currentChatType === "private") {
                    updateChatBlockUI(!!ack.blocked_by_me, !!ack.blocked_by_other, currentChatId);
                }
            }
        });
    }

    function handleEnterKey(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    }
});

function debugChatState() {
    console.log("Current Chat State:", {
        active_chat_type: sessionStorage.getItem("active_chat_type"),
        active_chat_id: sessionStorage.getItem("active_chat_id"),
        active_chat_user_id: sessionStorage.getItem("active_chat_user_id"),
        user_id: sessionStorage.getItem("user_id")
    });

    const activeChat = document.querySelector(".chat-item-list.active");
    if (activeChat) {
        console.log("Active Chat Element:", {
            dataset: activeChat.dataset
        });
    }
}

// ========================================= SEND MESSAGES FUNCTION ENDS HERE ===========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx



// ================================== FILE AND MEDIA ATTACHMENT FUNCTIONALITY START HERE ====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ==========================================================================================================================
//                                 ATTACHED FILE FUNCTION WHEN CLICKING ATTACHED FILE ICON
// ==========================================================================================================================

document.getElementById("attachFileIcon").addEventListener("click", function () {
    document.getElementById("fileInput").click();
});

// ==========================================================================================================================
//                                           FILE PREVIEW FUNCTION BEFORE SENDING
// ==========================================================================================================================

// Show preview when a file is selected
const fileInput = document.getElementById("fileInput");
fileInput.addEventListener("change", function () {
    let file = fileInput.files[0];
    if (file) {
        showPreviewFile(file);
    }
});

function showPreviewFile(file) {
    let previewContainer = document.getElementById("filePreview");
    if (!previewContainer) {
        previewContainer = document.createElement("div");
        previewContainer.id = "filePreview";
        previewContainer.style.marginBottom = "10px";
        previewContainer.style.position = "relative"; // Needed for absolute positioning of close button
        document.getElementById("chatInput").insertAdjacentElement("beforebegin", previewContainer);
    }

    let fileExt = file.name.split(".").pop().toLowerCase();
    let reader = new FileReader();

    // Create close button once
    const closeBtn = createCloseButton();

    // Image
    if (["png", "jpg", "jpeg", "gif"].includes(fileExt)) {
        reader.onload = function (e) {
            previewContainer.innerHTML = `
                <div style="padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: #f9f9f9; border-radius: 5px;">
                    <img src="${e.target.result}" alt="${file.name}" style="max-width: 200px; border-radius: 5px;" />
                    <p>${file.name}</p>
                </div>
            `;
            previewContainer.appendChild(closeBtn);
        };
        reader.readAsDataURL(file);
    }
    // Video
    else if (["mp4", "webm", "ogg"].includes(fileExt)) {
        const videoUrl = URL.createObjectURL(file);
        previewContainer.innerHTML = `
            <div style="padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: #f9f9f9; border-radius: 5px;">
                <video width="200" controls muted>
                    <source src="${videoUrl}" type="video/${fileExt}">
                    Your browser does not support the video tag.
                </video>
                <p>${file.name}</p>
            </div>
        `;
        previewContainer.appendChild(closeBtn);
    }
    // Audio
    else if (["mp3", "wav", "ogg", "aac"].includes(fileExt)) {
        const audioUrl = URL.createObjectURL(file);
        previewContainer.innerHTML = `
            <div style="padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 5px; background: #f9f9f9; border-radius: 5px;">
                <audio controls>
                    <source src="${audioUrl}" type="audio/${fileExt}">
                    Your browser does not support the audio element.
                </audio>
                <p>${file.name}</p>
            </div>
        `;
        previewContainer.appendChild(closeBtn);
    }
    else if (fileExt === "pdf") {
        const pdfUrl = URL.createObjectURL(file);
        previewContainer.innerHTML = `
            <div style="padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; background: #f9f9f9; border-radius: 5px;">
                <embed src="${pdfUrl}" type="application/pdf" width="200" height="200" />
                <p>${file.name}</p>
            </div>
        `;
        previewContainer.appendChild(closeBtn);
    }
    // Office Documents (enhanced preview)
    else if (["docx", "doc", "xlsx", "xls", "pptx", "ppt"].includes(fileExt)) {
        const fileUrl = URL.createObjectURL(file);
        const iconClass = {
            'doc': 'ri-file-word-line',
            'docx': 'ri-file-word-line',
            'xls': 'ri-file-excel-line',
            'xlsx': 'ri-file-excel-line',
            'ppt': 'ri-file-ppt-line',
            'pptx': 'ri-file-ppt-line'
        }[fileExt];

        const typeName = {
            'doc': 'Word',
            'docx': 'Word',
            'xls': 'Excel',
            'xlsx': 'Excel',
            'ppt': 'PowerPoint',
            'pptx': 'PowerPoint'
        }[fileExt];

        previewContainer.innerHTML = `
            <div style="padding: 20px; background: #f9f9f9; border-radius: 5px; text-align: center;">
                <div style="font-size: 48px; color: ${fileExt.includes('doc') ? '#2b579a' :
                fileExt.includes('xls') ? '#217346' :
                    '#d24726'
            };">
                    <i class="${iconClass}"></i>
                </div>
                <p style="margin: 10px 0; font-weight: bold;">${typeName} Document</p>
                <p style="word-break: break-all;">${file.name}</p>
                <div style="margin-top: 15px;">
                    <a href="${fileUrl}" download="${file.name}">
                        
                    </a>
                </div>
            </div>
        `;
        previewContainer.appendChild(closeBtn);
    }
    else {
        previewContainer.innerHTML = `
            <div style="padding: 10px; background: #f9f9f9; border-radius: 5px; display: flex; align-items: center; justify-content: space-between;">
                <p>📄 ${file.name}</p>
            </div>
        `;
        previewContainer.appendChild(closeBtn);
    }
}

// ==========================================================================================================================
//                                           CLOSE BUTTON FUNCTION
// ==========================================================================================================================

// Helper function to create close button
function createCloseButton() {
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "❌";
    closeBtn.onclick = removePreview;
    closeBtn.style.cssText = `
        position: absolute;
        top: 5px;
        right: 5px;
        background: red;
        color: white;
        border: none;
        padding: 5px 8px;
        font-size: 12px;
        border-radius: 4px;
        cursor: pointer;
        z-index: 10;
    `;
    return closeBtn;
}

// ==========================================================================================================================
//                                          REMOVE PREVIEW FUNCTION
// ==========================================================================================================================

// Function to remove file preview
function removePreview() {
    let previewContainer = document.getElementById("filePreview");
    if (previewContainer) {
        previewContainer.remove();
    }
    fileInput.value = ""; // Reset file input
}

// ==========================================================================================================================
//                                           SEND MULTIPLE FILES FUNCTION
// ==========================================================================================================================

// const previewWrapper = document.getElementById("previewWrapper");
// fileInput.addEventListener("change", function () {
//     const files = Array.from(fileInput.files);
//     files.forEach(showFilePreview);
// });

// function showFilePreview(file) {
//     const fileExt = file.name.split(".").pop().toLowerCase();
//     const previewBox = document.createElement("div");

//     previewBox.className = "file-preview";
//     previewBox.style = `
//         position: relative;
//         margin-bottom: 10px;
//         padding: 15px;
//         background-color: #f0f0f0;
//         border-radius: 8px;
//         display: flex;
//         flex-direction: column;
//         align-items: center;
//         gap: 8px;
//     `;

//     const closeBtn = document.createElement("button");
//     closeBtn.textContent = "❌";
//     closeBtn.onclick = () => previewBox.remove();
//     closeBtn.style = `
//         position: absolute;
//         top: 5px;
//         right: 5px;
//         background: red;
//         color: white;
//         border: none;
//         padding: 5px 8px;
//         font-size: 12px;
//         border-radius: 4px;
//         cursor: pointer;
//     `;

//     const reader = new FileReader();

//     if (["png", "jpg", "jpeg", "gif"].includes(fileExt)) {
//         reader.onload = (e) => {
//             previewBox.innerHTML += `
//                 <img src="${e.target.result}" alt="${file.name}" style="max-width: 200px; border-radius: 6px;" />
//                 <p>${file.name}</p>
//             `;
//             previewBox.appendChild(closeBtn);
//         };
//         reader.readAsDataURL(file);
//     }
//     else if (["mp4", "webm", "ogg"].includes(fileExt)) {
//         const videoUrl = URL.createObjectURL(file);
//         previewBox.innerHTML += `
//             <video width="200" controls muted>
//                 <source src="${videoUrl}" type="video/${fileExt}">
//                 Your browser does not support the video tag.
//             </video>
//             <p>${file.name}</p>
//         `;
//         previewBox.appendChild(closeBtn);
//     }
//     else if (["mp3", "wav", "ogg", "aac"].includes(fileExt)) {
//         const audioUrl = URL.createObjectURL(file);
//         previewBox.innerHTML += `
//             <audio controls>
//                 <source src="${audioUrl}" type="audio/${fileExt}">
//                 Your browser does not support the audio element.
//             </audio>
//             <p>${file.name}</p>
//         `;
//         previewBox.appendChild(closeBtn);
//     }
//     else if (fileExt === "pdf") {
//         const pdfUrl = URL.createObjectURL(file);
//         previewBox.innerHTML += `
//             <embed src="${pdfUrl}" type="application/pdf" width="200" height="200" />
//             <p>${file.name}</p>
//         `;
//         previewBox.appendChild(closeBtn);
//     }
//     else {
//         previewBox.innerHTML += `<p>📄 ${file.name}</p>`;
//         previewBox.appendChild(closeBtn);
//     }

//     previewWrapper.appendChild(previewBox);
// }

// function removePreview() {
//     const previewContainer = document.getElementById("filePreview");
//     if (previewContainer) previewContainer.remove();
//     fileInput.value = ""; // reset file input
// }

// ==========================================================================================================================
//                                           GENERATE FILE PREVIEW FUNCTION BEFORE SENDING
// ==========================================================================================================================

function generateFilePreview(fileUrl, messageType, fileName = '') {
    // Extract file extension and name
    const fileExt = fileName
        ? fileName.split('.').pop().toLowerCase()
        : fileUrl.split('.').pop().toLowerCase().split('?')[0];
    const displayName = fileName || fileUrl.split('/').pop().split('?')[0];

    // Image preview
    if (messageType === 'image' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
        return generateImagePreview(fileUrl, displayName);
    }

    // Audio preview (check before video so .webm/.ogg voice notes render as audio)
    if (messageType === 'audio' || ['mp3', 'wav', 'aac', 'm4a'].includes(fileExt) || (displayName && displayName.startsWith('voice_note_'))) {
        return generateAudioPreview(fileUrl, fileExt, displayName);
    }

    // Video preview
    if (messageType === 'video' || ['mp4', 'webm', 'ogg', 'mov'].includes(fileExt)) {
        return generateVideoPreview(fileUrl, fileExt, displayName);
    }

    // Document previews (enhanced)
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        return generateDocumentPreview(fileUrl, fileExt, displayName);
    }

    // Generic file preview
    return generateGenericPreview(fileUrl, displayName);
}


// ==========================================================================================================================
//                                           GENERATE IMAGE PREVIEW FUNCTION EFORE SENDING
// ==========================================================================================================================

function generateImagePreview(url, name) {
    return `
        <div class="file-preview image-preview">
            <div class="image-container" onclick="openImageModal('${url}', '${name}')">
                <img src="${url}" alt="${name}" loading="lazy" class="preview-image">
            </div>
            <div class="file-info-img">
                <span class="file-name-img">${name}</span>
                <a href="${url}" download="${name}" class="download-btn-img">
                    <i class="ri-file-download-line"></i>
                </a>
            </div>
        </div>
    `;
}

// ==========================================================================================================================
//                                           OPENING IMAGE FULL SCREEN FUNCTION - WHEN CLICKED
// ==========================================================================================================================

function openImageModal(imageUrl, imageName) {
    // Create modal structure
    const modalHtml = `
        <div class="image-modal" onclick="closeImageModal()">
            <div class="modal-content-container">
                <div class="modal-content-fullscreen">
                    <span class="close-btn" onclick="closeImageModal()">&times;</span>
                    <img src="${imageUrl}" alt="Enlarged view" class="modal-image" 
                         onload="adjustModalSize(this)">
                    <div class="modal-actions">
                        <!-- <a href="${imageUrl}" download="${imageName}" class="modal-download-btn">
                        
                        </a> -->
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

function adjustModalSize(imgElement) {
    const modalContent = imgElement.closest('.modal-content-fullscreen');
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.9;

    // Get natural image dimensions
    const naturalWidth = imgElement.naturalWidth;
    const naturalHeight = imgElement.naturalHeight;

    // Calculate aspect ratio
    const aspectRatio = naturalWidth / naturalHeight;

    // Determine display dimensions
    let displayWidth = naturalWidth;
    let displayHeight = naturalHeight;

    if (naturalWidth > maxWidth) {
        displayWidth = maxWidth;
        displayHeight = maxWidth / aspectRatio;
    }

    if (displayHeight > maxHeight) {
        displayHeight = maxHeight;
        displayWidth = maxHeight * aspectRatio;
    }

    // Apply dimensions
    modalContent.style.width = `${displayWidth}px`;
    imgElement.style.maxWidth = `${displayWidth}px`;
    imgElement.style.maxHeight = `${displayHeight}px`;

    // Center modal vertically
    const container = modalContent.closest('.modal-content-container');
    container.style.alignItems = displayHeight >= maxHeight ? 'flex-start' : 'center';
}

function closeImageModal() {
    const modal = document.querySelector('.image-modal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// ==========================================================================================================================
//                                           GENERATE VIDEO PREVIEW FUNCTION
// ==========================================================================================================================


function generateVideoPreview(url, ext, name) {
    return `
        <div class="file-preview video-preview">
            <video controls playsinline preload="metadata">
                <source src="${url}" type="video/${ext}">
            </video>
            <div class="file-info">
                <span class="file-name">${name}</span>
                <a href="${url}" download="${name}" class="download-btn">
                    <i class="ri-file-download-line"></i>
                </a>
            </div>
        </div>
    `;
}

function generateAudioPreview(url, ext, name) {
    return `
        <div class="file-preview audio-preview">
            <audio controls preload="metadata">
                <source src="${url}" type="audio/${ext}">
            </audio>
            <div class="file-info">
                <span class="file-name">${name}</span>
                <a href="${url}" download="${name}" class="download-btn">
                    <i class="ri-file-download-line"></i>
                </a>
            </div>
        </div>
    `;
}


function generateDocumentPreview(url, ext, name) {
    // Define your icon paths
    const iconPaths = {
        'pdf': '/static/images/pdf-icon.png',
        'doc': '/static/images/doc-icon.png',
        'docx': '/static/images/docx-icon.png',
        'xls': '/static/images/xls-icon.png',
        'xlsx': '/static/images/xls-icon.png',
        'ppt': '/static/images/ppt-icon.png',
        'pptx': '/static/images/pptx-icon.png',
        'zip': '/static/images/zip-icon.png',
    };


    return `
        <a href="${url}" download="${name}" class="file-download-link">
            <div class="file-preview pdf-preview">
                <div class="document-preview-container">
                    <img src="${iconPaths[ext]}" alt="${ext.toUpperCase()} Icon" class="pdf-icon">
                </div>
                <div class="file-info">
                    <span class="file-name">${name}</span>
                    <div class="file-actions">
                        <i class="ri-file-download-line download-icon"></i>
                    </div>
                </div>
            </div>
        </a>
    `;
}

// ==========================================================================================================================
//                                           GENERATE ANY FILE TYPE PREVIEW FUNCTION
// ==========================================================================================================================

function generateGenericPreview(url, name) {
    return `
        <div class="file-preview generic-preview">
            <div class="file-icon">
                <i class="ri-file-line"></i>
            </div>
            <div class="file-info">
                <span class="file-name">${name}</span>
                <a href="${url}" download="${name}" class="download-btn">
                    <i class="ri-file-download-line"></i>
                </a>
            </div>
        </div>
    `;
}

// ================================== FILE AND MEDIA ATTACHMENT FUNCTIONALITY ENDS HERE =====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ===========================================================================================================================
//                                         MOVE CHAT TO TOP FUNCTION IN CHATLIST
// =========================================================================================================================== 

// ✅ CORRECTED: Now finds chat items properly
// function moveChatToTop(chatId, chatType, userId = null) {
//     const chatItem = findChatItem(chatId, chatType, userId);

//     if (chatItem) {
//         const parentList = chatItem.parentElement;
//         // Don't move if already at top
//         if (parentList.firstChild === chatItem) {
//             console.log(`✅ Chat already at top: ${chatType}:${chatId}`);
//             return;
//         }

//         parentList.prepend(chatItem);
//         console.log(`⬆️ Moved chat (${chatType}: ${chatId}) to top`);
//     }
// }


// ✅ Smarter: Orders chats by latest timestamp
// function moveChatToTop(chatId, chatType, userId = null, timestamp = null) {
//     const chatItem = findChatItem(chatId, chatType, userId);

//     if (!chatItem) {
//         console.warn(`⚠️ Chat item not found for ${chatType}:${chatId}`);
//         return;
//     }

//     const parentList = chatItem.parentElement;

//     // Store latest timestamp as data attribute
//     if (timestamp) {
//         chatItem.dataset.lastTimestamp = timestamp;
//     } else if (!chatItem.dataset.lastTimestamp) {
//         chatItem.dataset.lastTimestamp = Date.now();
//     }

//     // Convert children to array for sorting
//     const chatItems = Array.from(parentList.children);

//     // Sort chats by timestamp (descending = newest first)
//     chatItems.sort((a, b) => {
//         const tsA = parseInt(a.dataset.lastTimestamp || "0", 10);
//         const tsB = parseInt(b.dataset.lastTimestamp || "0", 10);
//         return tsB - tsA;
//     });

//     // Re-append in new order
//     chatItems.forEach(item => parentList.appendChild(item));

//     console.log(`⬆️ Reordered chats with ${chatType}:${chatId} at top`);
// }


function moveChatToTop(chatId, chatType, userId = null, timestamp = null) {
    const chatItem = findChatItem(chatId, chatType, userId);
    if (!chatItem) return;

    // Update timestamp with the latest message time
    chatItem.dataset.timestamp = timestamp || new Date().toISOString();

    const parentList = chatItem.parentElement;
    if (!parentList) return;
    const chatItems = Array.from(parentList.querySelectorAll("li.chat-item-list"));

    // Re-sort using shared function
    const sortedElements = sortChatListElements(chatItems);
    sortedElements.forEach(el => parentList.appendChild(el));

    if (typeof applyChatFilter === "function") {
        applyChatFilter();
    }
}



// ===========================================================================================================================
//                                         UPDATE CHAT LIST PREVIEW FUNCTION IN CHATLIST
// =========================================================================================================================== 

function updateChatPreview(chatId, chatType, message, timestamp, userId = null) {
    const chatItem = findChatItem(chatId, chatType, userId);

    if (!chatItem) {

        return;
    }

    const previewTextEl = chatItem.querySelector(".content-message-text");
    if (previewTextEl) previewTextEl.textContent = message;

    const timeEl = chatItem.querySelector(".content-message-time");
    if (timeEl) timeEl.textContent = formatTimestamp(timestamp);

    console.log("✅ Updated preview for chat:", chatId);
}


// ===========================================================================================================================
//                                         FIND CHAT ITEM FUNCTION IN CHATLIST
// =========================================================================================================================== 

function findChatItem(chatId, chatType, userId = null) {
    const lists = [
        document.getElementById("main-chat-list"),
        document.getElementById("groups-ul"),
        document.getElementById("starred-messages-ul")
    ];

    for (const list of lists) {
        if (!list) continue;

        let chatItem = null;

        if (chatId) {
            chatItem = list.querySelector(
                `.chat-item-list[data-chat-id="${chatId}"][data-chat-type="${chatType}"]`
            ) || list.querySelector(
                `.chat-item-list[data-chat-id="${chatId}"]`
            );
        }

        if (!chatItem && chatType === "private" && userId) {
            chatItem = list.querySelector(
                `.chat-item-list[data-user-id="${userId}"][data-chat-type="private"]`
            );
        }

        if (chatItem) return chatItem;
    }

    return null;
}




// ===========================================================================================================================
//                                         UPDATE UNREAD MESSAGE COUNT FUNCTION IN CHATLIST
// =========================================================================================================================== 

function updateUnreadCount(data) {
    const chatId = data.group_id || data.private_chat_id;
    if (!chatId) return;

    const chatElements = document.querySelectorAll(`.chat-item-list[data-chat-id="${chatId}"]`);

    chatElements.forEach(chatElement => {
        let unreadBadge = chatElement.querySelector(".content-message-unread, .unread-badge");
        let currentCount = parseInt(chatElement.getAttribute("data-unread-count") || (unreadBadge ? unreadBadge.innerText : "0"), 10) || 0;
        let unreadCount = currentCount + 1;
        chatElement.setAttribute("data-unread-count", String(unreadCount));
        chatElement.classList.add("has-unread");

        if (!unreadBadge) {
            const metaContainer = chatElement.querySelector(".content-message-meta") || chatElement.querySelector(".content-message-more");
            if (metaContainer) {
                unreadBadge = document.createElement("span");
                unreadBadge.className = "content-message-unread";
                metaContainer.insertBefore(unreadBadge, metaContainer.firstChild);
            }
        }

        if (unreadBadge) {
            unreadBadge.innerText = unreadCount > 99 ? "99+" : String(unreadCount);
            unreadBadge.style.display = "inline-flex";
        }

        const parentList = chatElement.parentElement;
        if (parentList) {
            parentList.prepend(chatElement);
        }
    });

    updateTotalUnreadBadge();
}

// ========================================= FUNCTION TO UPDATE UNREAD COUNT ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ============================== FUNCTION HANDLE DROPDOWN LIST ITEMS IN CHAT AREA STARTS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {

        // console.log('CLICK:', e.target);
        const replyBtn = e.target.closest('.reply-message');
        const copyBtn = e.target.closest('.copy-message');
        const forwardBtn = e.target.closest('.forward-message');
        const deleteBtn = e.target.closest('.delete-message');
        const starMessage = e.target.closest('.star-message');
        const dropdownToggle = e.target.closest('.conversation-item-dropdown-toggle');
        const dropdown = e.target.closest('.conversation-item-dropdown');

        // ===========================================================================================================================
        //                                         REPLY MESSAGE FROM DROPDOWN LIST
        // =========================================================================================================================== 
        if (replyBtn) {
            e.preventDefault();
            const messageId = replyBtn.dataset.messageId;
            replyMessage(messageId);
            return; // important: prevent further dropdown handling conflict
        }

        // ===========================================================================================================================
        //                                         COPY MESSAGE FROM DROPDOWN LIST
        // =========================================================================================================================== 

        if (copyBtn) {
            e.preventDefault();
            const messageId = copyBtn.dataset.messageId;
            const messageElement = document.querySelector(`[data-message-id="${messageId}"] .message-text`);

            if (messageElement) {
                const parts = messageElement.innerHTML.split('<br>');
                const textOnly = parts.length > 1 ? parts[1].trim() : parts[0].trim();
                const textToCopy = new DOMParser().parseFromString(textOnly, "text/html").body.textContent || "";

                navigator.clipboard.writeText(textToCopy)
                    .then(() => {
                        console.log("📋 Message copied:", textToCopy);
                        showCopiedTooltip(copyBtn);
                    })
                    .catch(err => {
                        console.error("❌ Failed to copy:", err);
                    });
            }
            return;
        }

        // ===========================================================================================================================
        //                                         FORWARD MESSAGE FROM DROPDOWN LIST
        // =========================================================================================================================== 

        if (forwardBtn) {
            e.preventDefault();

            const messageId = forwardBtn.dataset.messageId;
            const messageElement = forwardBtn.closest('.conversation-item-content') || forwardBtn.closest('.message-wrapper');
            if (!messageElement) return;

            const messageText = messageElement.querySelector('.message-text')?.textContent || "";

            // Check if there's media
            const mediaElement = messageElement.querySelector('img, video');
            let mediaType = 'text';
            let mediaUrl = null;

            if (mediaElement) {
                mediaUrl = mediaElement.src;

                if (mediaUrl.endsWith('.jpg') || mediaUrl.endsWith('.jpeg') || mediaUrl.endsWith('.png') || mediaUrl.endsWith('.webp')) {
                    mediaType = 'image';
                } else if (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.webm')) {
                    mediaType = 'video';
                } else {
                    mediaType = 'files'; // e.g., pdf, mp3, etc.
                }
            }

            openForwardModal(messageId, {
                element: messageElement,
                content: messageText,
                type: mediaType,
                mediaUrl: mediaUrl
            });

            return;
        }

        // ===========================================================================================================================
        //                                         DELETE MESSAGE FROM DROPDOWN LIST
        // =========================================================================================================================== 

        if (deleteBtn) {
            e.preventDefault();
            const messageId = deleteBtn.dataset.messageId;
            const isSender = deleteBtn.dataset.isSender === "true"; // Get sender status from data attribute
            showDeleteModal(messageId, isSender); // Pass isSender to modal
            return;
        }

        // ===========================================================================================================================
        //                                         STAR MESSAGE FROM DROPDOWN LIST
        // ===========================================================================================================================   

        // Star Message
        if (starMessage) {
            e.preventDefault();
            const messageId = starMessage.dataset.messageId;
            toggleStarMessage(messageId);
            return;
        }

        // Toggle dropdown
        if (dropdownToggle) {
            e.preventDefault();
            const dropdownMenu = dropdownToggle.closest('.conversation-item-dropdown');
            document.querySelectorAll('.conversation-item-dropdown').forEach(d => {
                if (d !== dropdownMenu) d.classList.remove('active');
            });
            dropdownMenu.classList.toggle('active');
            return;
        }

        // Close all dropdowns if clicked outside
        if (!dropdown) {
            document.querySelectorAll('.conversation-item-dropdown').forEach(d => {
                d.classList.remove('active');
            });
        }
    });
});

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ============================== FUNCTION HANDLE DROPDOWN LIST ITEMS IN CHAT AREA ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== COPY MESSAGE FUNCTIONALITY STARTS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ===========================================================================================================================
//                                         COPY MESSAGE FUNCTION FROM DROPDOWN LIST
// ===========================================================================================================================   

function showCopiedTooltip(targetElement) {
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.innerText = 'Copied!';
    tooltip.className = 'copy-tooltip';

    // Position near the clicked element
    const rect = targetElement.getBoundingClientRect();
    tooltip.style.top = `${rect.top - 30 + window.scrollY}px`;
    tooltip.style.left = `${rect.left + rect.width / 2}px`;

    document.body.appendChild(tooltip);

    setTimeout(() => {
        tooltip.remove();
    }, 1500); // Hide after 1.5 seconds


}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== COPY MESSAGE FUNCTIONALITY ENDS HERE ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== REPLY MESSAGE FUNCTIONALITY STARTS HERE ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ===========================================================================================================================
//                                         REPLY MESSAGE FUNCTION FROM DROPDOWN LIST
// ===========================================================================================================================

function replyMessage(messageId) {
    // Get reply preview elements
    const replyPreview = document.getElementById("replyPreview");
    const replyContent = document.getElementById("replyContent");
    const replyField = document.getElementById("reply_to_message_id");

    // Ensure all required elements are present
    if (!replyPreview || !replyContent || !replyField) {
        console.error("❌ Missing reply preview elements (replyPreview, replyContent, or replyField)");
        return;
    }

    console.log("replyMessage called with ID:", messageId);

    // Find the message wrapper using the message ID
    const messageWrapper = document.querySelector(`.message-wrapper[data-message-id="${messageId}"]`);
    if (!messageWrapper) {
        console.error(`❌ Message with ID ${messageId} not found!`);
        return;
    }

    // Get message elements
    const messageTextElement = messageWrapper.querySelector('.message-text');
    const filePreviewElement = messageWrapper.querySelector('.file-preview');
    const senderElement = messageWrapper.querySelector('strong');
    const timestampElement = messageWrapper.querySelector('.timestamp');

    // Get sender name (fallback to "You" if not found)
    const senderName = senderElement ? senderElement.textContent.trim().replace(':', '') : "You";

    // Clear previous reply content
    replyContent.innerHTML = '';

    // Create reply header
    const replyHeader = document.createElement('div');
    replyHeader.className = 'reply-header';
    replyHeader.innerHTML = `<strong>${senderName}</strong>`;

    // Add timestamp if available
    if (timestampElement) {
        const timestamp = document.createElement('span');
        timestamp.className = 'reply-timestamp';
        timestamp.textContent = timestampElement.textContent.trim();
        replyHeader.appendChild(timestamp);
    }

    replyContent.appendChild(replyHeader);

    // Handle different message types
    if (filePreviewElement) {
        // This is a file/image/video/audio message
        const replyMedia = document.createElement('div');
        replyMedia.className = 'reply-media-preview';

        // Clone the relevant parts of the file preview
        if (filePreviewElement.querySelector('img')) {
            // Image preview
            const img = filePreviewElement.querySelector('img').cloneNode(true);
            img.style.maxHeight = '60px';
            img.style.maxWidth = '100px';
            img.style.borderRadius = '4px';
            replyMedia.appendChild(img);
        }
        else if (filePreviewElement.querySelector('video')) {
            // Video preview
            const videoIcon = document.createElement('i');
            videoIcon.className = 'ri-video-line';
            replyMedia.appendChild(videoIcon);
            const videoText = document.createElement('span');
            videoText.textContent = 'Video';
            replyMedia.appendChild(videoText);
        }
        else if (filePreviewElement.querySelector('audio')) {
            // Audio preview
            const audioIcon = document.createElement('i');
            audioIcon.className = 'ri-music-2-line';
            replyMedia.appendChild(audioIcon);
            const audioText = document.createElement('span');
            audioText.textContent = 'Audio';
            replyMedia.appendChild(audioText);
        }
        else if (filePreviewElement.querySelector('.file-name')) {
            // Generic file preview
            const fileIcon = document.createElement('i');
            fileIcon.className = 'ri-file-line';
            replyMedia.appendChild(fileIcon);
            const fileName = filePreviewElement.querySelector('.file-name').cloneNode(true);
            fileName.style.maxWidth = '150px';
            fileName.style.whiteSpace = 'nowrap';
            fileName.style.overflow = 'hidden';
            fileName.style.textOverflow = 'ellipsis';
            replyMedia.appendChild(fileName);
        }

        replyContent.appendChild(replyMedia);
    }
    else if (messageTextElement) {
        // This is a text message
        const replyText = document.createElement('div');
        replyText.className = 'reply-text-preview';

        // Get text content (excluding sender name if present)
        let messageText = messageTextElement.textContent.trim();
        if (senderElement) {
            messageText = messageText.replace(`${senderName}:`, '').trim();
        }

        // Limit preview length
        messageText = messageText.length > 100
            ? messageText.substring(0, 100) + '...'
            : messageText;

        replyText.textContent = messageText;
        replyContent.appendChild(replyText);
    }
    else {
        // Fallback for unknown message types
        const unknownPreview = document.createElement('div');
        unknownPreview.className = 'reply-unknown-preview';
        unknownPreview.textContent = 'Message';
        replyContent.appendChild(unknownPreview);
    }

    // Show reply preview and set the reply ID
    replyPreview.style.display = 'flex';
    replyField.value = messageId;

    // Focus input
    const messageInput = document.getElementById("messageInput");
    if (messageInput) {
        messageInput.focus();
    }
}

// ===========================================================================================================================
//                                         CLOSE REPLY MODAL FUNCTION 
// ===========================================================================================================================


// Close preview handler — get elements inside event listener to be safe
const closeReplyBtn = document.getElementById("cancelReply");
if (closeReplyBtn) {
    closeReplyBtn.addEventListener('click', () => {
        const replyPreview = document.getElementById("replyPreview");
        const replyContent = document.getElementById("replyContent");
        const replyField = document.getElementById("reply_to_message_id");

        if (replyPreview) {
            replyPreview.style.display = 'none';
        }
        if (replyContent) {
            replyContent.textContent = '';
        }
        if (replyField) {
            replyField.value = '';
        }
    });
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== REPLY MESSAGE FUNCTIONALITY ENDS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== FORWARD MESSAGE FUNCTIONALITY STARTS HERE ====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// Global variables
let selectedForwardMessage = null;
let selectedForwardRecipients = new Map(); // Map<id, { id, chat_type }>

// ===========================================================================================================================
//                                         OPEN FORWARD MODAL FUNCTION FROM DROPDOWN LIST
// ===========================================================================================================================

function updateForwardButtonState() {
    const confirmBtn = document.getElementById('confirmForwardBtn');
    if (!confirmBtn) return;
    const hasSelection = selectedForwardRecipients && selectedForwardRecipients.size > 0;
    confirmBtn.disabled = !hasSelection;
    if (hasSelection) {
        confirmBtn.removeAttribute('disabled');
    } else {
        confirmBtn.setAttribute('disabled', 'disabled');
    }
}

// Show Message Preview in Modal (Enhanced)
function openForwardModal(messageId, messageData = {}) {
    selectedForwardMessage = { id: messageId, ...messageData };
    selectedForwardRecipients.clear();

    // Close any open message dropdown menus
    document.querySelectorAll('.conversation-item-dropdown.active').forEach(d => d.classList.remove('active'));

    const forwardPreview = document.getElementById('forwardMessagePreview');
    if (forwardPreview) {
        forwardPreview.innerHTML = ''; // Clear previous preview
        const previewText = messageData.message || messageData.content || '';

        // Handle media previews
        if ((messageData.type === 'image' || messageData.type === 'video') && messageData.mediaUrl) {
            const mediaElement = document.createElement(messageData.type === 'image' ? 'img' : 'video');
            mediaElement.src = messageData.mediaUrl + (messageData.type === 'video' ? '#t=0.1' : '');
            mediaElement.classList.add('forward-thumbnail');
            if (messageData.type === 'video') {
                mediaElement.muted = true;
                mediaElement.playsInline = true;
            }
            forwardPreview.appendChild(mediaElement);
            forwardPreview.style.display = 'block';
        } else if (previewText) {
            // Show text preview
            const textPreview = document.createElement('div');
            textPreview.classList.add('forward-text-preview');
            textPreview.textContent = previewText;
            forwardPreview.appendChild(textPreview);
            forwardPreview.style.display = 'block';
        } else {
            forwardPreview.style.display = 'none';
        }
    }

    // Reset UI state
    const searchInput = document.getElementById('forwardSearchInput');
    const searchResults = document.getElementById('forwardSearchResults');
    if (searchInput) searchInput.value = '';
    if (searchResults) searchResults.innerHTML = '';
    updateForwardButtonState();

    // Show modal
    const modal = document.getElementById('forwardModal');
    if (modal) modal.classList.remove('hidden');

    // Load initial contacts/groups immediately
    searchForwardToUser();
}

// Close Modal
function closeForwardModal() {
    const modal = document.getElementById('forwardModal');
    if (modal) modal.classList.add('hidden');
    selectedForwardMessage = null;
    selectedForwardRecipients.clear();
    updateForwardButtonState();
}

// ===========================================================================================================================
//                                       SEARCH USERS TO FORWARD MESSAGE TO FUNCTION
// ===========================================================================================================================

// Search Function (Enhanced)
function searchForwardToUser() {
    const searchInput = document.getElementById('forwardSearchInput');
    const forwardSearchResults = document.getElementById('forwardSearchResults');
    if (!forwardSearchResults) return;

    const forwardSearchQuery = searchInput ? searchInput.value.trim() : '';

    fetch(`/forward_search_users?query=${encodeURIComponent(forwardSearchQuery)}`)
        .then(response => response.json())
        .then(data => {
            forwardSearchResults.innerHTML = '';

            if (!Array.isArray(data) || data.length === 0) {
                forwardSearchResults.innerHTML = '<div class="no-results">No users/groups found</div>';
                return;
            }

            data.forEach(user => {
                const recipientId = String(user.id || user._id || '');
                if (!recipientId) return;

                const isSelected = selectedForwardRecipients.has(recipientId);
                const forwardUserItem = document.createElement('div');
                forwardUserItem.classList.add('search-item');
                forwardUserItem.dataset.recipientId = recipientId;
                forwardUserItem.dataset.chatType = user.chat_type || 'private';
                if (isSelected) forwardUserItem.classList.add('selected');

                const labelText = user.chat_type === 'group'
                    ? `${user.firstname} (Group)`
                    : `${user.firstname || ''} ${user.lastname || ''} (${user.staffid || ''})`.trim();

                forwardUserItem.innerHTML = `
                    <div class="forward-user-display">
                        <div class="search-user">
                            <img src="${user.image_url || '/static/images/default-profile.png'}" 
                                 alt="User Avatar" 
                                 class="user-avatar"
                                 onerror="this.src='/static/images/default-profile.png'">
                            <div class="user-details">
                                <p>${labelText}</p>
                            </div>
                        </div>
                        <div class="forward-checkbox">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} />
                        </div>
                    </div>
                `;

                const checkbox = forwardUserItem.querySelector('input[type="checkbox"]');
                const applySelection = (checked) => {
                    checkbox.checked = checked;
                    if (checked) {
                        selectedForwardRecipients.set(recipientId, {
                            id: recipientId,
                            chat_type: user.chat_type || 'private'
                        });
                        forwardUserItem.classList.add('selected');
                    } else {
                        selectedForwardRecipients.delete(recipientId);
                        forwardUserItem.classList.remove('selected');
                    }
                    updateForwardButtonState();
                };

                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    applySelection(checkbox.checked);
                });

                forwardUserItem.addEventListener('click', (e) => {
                    if (e.target === checkbox) return;
                    e.preventDefault();
                    applySelection(!checkbox.checked);
                });

                forwardSearchResults.appendChild(forwardUserItem);
            });

            updateForwardButtonState();
        })
        .catch(error => {
            console.error('Error searching users:', error);
            forwardSearchResults.innerHTML = '<div class="error">Error searching users</div>';
        });
}

// ===========================================================================================================================
//                                         FORWARD MESSAGE CONFIRM/SEND FUNCTION
// ===========================================================================================================================

document.getElementById('confirmForwardBtn').addEventListener('click', async () => {
    if (!selectedForwardMessage || !selectedForwardRecipients || selectedForwardRecipients.size === 0) {
        showFlashMessage('No message or recipients selected', 'error');
        return;
    }

    const currentUserId = sessionStorage.getItem("user_id");
    if (!currentUserId) {
        showFlashMessage('User session expired', 'error');
        return;
    }

    try {
        const forwardPromises = Array.from(selectedForwardRecipients.values()).map(recipient => {
            let recipientId, isGroup;

            if (typeof recipient === 'string') {
                recipientId = recipient;
                isGroup = recipientId.startsWith('group_');
            } else if (recipient && (recipient.id || recipient._id)) {
                recipientId = recipient.id || recipient._id;
                isGroup = recipient.chat_type === 'group' ||
                    recipient.type === 'group' ||
                    Boolean(recipient.isGroup) ||
                    (recipientId && recipientId.startsWith('group_'));
            } else {
                console.error('Invalid recipient format:', recipient);
                throw new Error('Invalid recipient format');
            }

            if (!recipientId) {
                console.error('Missing recipient ID:', recipient);
                throw new Error('Recipient has no ID');
            }

            const forwardData = {
                user_id: currentUserId,
                original_message_id: selectedForwardMessage.id,
                [isGroup ? 'target_group_id' : 'target_private_chat_id']: recipientId,
                [isGroup ? 'target_private_chat_id' : 'target_group_id']: null
            };

            console.log('Forwarding data:', forwardData);
            return fetch('/forward_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(forwardData)
            });
        });

        Promise.all(forwardPromises)
            .then(responses => Promise.all(responses.map(r => r.json())))
            .then(results => {
                const successCount = results.filter(r => r.status === 'success').length;
                if (successCount > 0) {
                    showFlashMessage(`Message forwarded to ${successCount} recipient${successCount > 1 ? 's' : ''}`);
                }
                if (successCount < selectedForwardRecipients.size) {
                    showFlashMessage(`Failed to forward to ${selectedForwardRecipients.size - successCount} recipient${selectedForwardRecipients.size - successCount > 1 ? 's' : ''}`, 'error');
                }
                closeForwardModal();
            });
    } catch (error) {
        console.error('Forwarding failed:', {
            error: error.message,
            recipients: Array.from(selectedForwardRecipients.values() || [])
        });
        showFlashMessage(`Forwarding failed: ${error.message}`, 'error');
    }
});

// ===========================================================================================================================
//                                         SOCKET MESSAGE FORWARDED MESSAGES
// ===========================================================================================================================

// Handle incoming forwarded messages if emitted via 'new_message'
socket.on('new_message', async (data) => {
    console.log("📥 New message received:", data);
});

// ===========================================================================================================================
//                                         FORWARD MESSAGE HELPER FUNCTIONS
// ===========================================================================================================================

// Close modal handlers
document.querySelector('.forwardModal .close').addEventListener('click', closeForwardModal);
window.addEventListener('click', (event) => {
    if (event.target === document.getElementById('forwardModal')) {
        closeForwardModal();
    }
});

// Search input debounce
let searchDebounce;
document.getElementById('forwardSearchInput').addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(searchForwardToUser, 300);
});


// SHOWTOAST FUNCTION:

// Toast notification system
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add this CSS for toast notifications
const style = document.createElement('style');
style.textContent = `
.toast-notification {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    background: #4CAF50;
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 1000;
    opacity: 1;
    transition: opacity 0.3s;
}
.toast-notification.error {
    background: #f44336;
}
.toast-notification.fade-out {
    opacity: 0;
}
`;
document.head.appendChild(style);

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== FORWARD MESSAGE FUNCTIONALITY ENDS HERE =====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== STAR MESSAGE FUNCTIONALITY STARTS HERE ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// ==========================================================================================================================
//                                         TOGGLE STAR MESSAGE FUNCTION FROM DROPDOWN LIST
// ===========================================================================================================================
// Toggle star status
function toggleStarMessage(messageId) {
    const messageElement = document.querySelector(`.message-wrapper[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const isStarred = !messageElement.classList.contains('starred');
    const userId = sessionStorage.getItem("user_id");

    // // Optimistic UI update
    updateStarStatus(messageElement, isStarred);

    // Optimistic UI update
    messageElement.classList.toggle("starred", isStarred);
    const starIcon = messageElement.querySelector(".starred-icon");
    if (starIcon) {
        starIcon.classList.toggle("ri-star-fill", isStarred);
        starIcon.classList.toggle("ri-star-line", !isStarred);
    }

    // Send to server
    socket.emit("star_message", {
        message_id: messageId,
        user_id: userId,
        starred: isStarred
    });
}

// ==========================================================================================================================
//                                         UPDATE STAR MESSAGE STATUS FUNCTION
// ===========================================================================================================================

// Update star UI state
function updateStarStatus(element, isStarred) {
    // Toggle message highlight
    element.classList.toggle('starred', isStarred);

    // Update star icon
    const starIcon = element.querySelector('.starred-icon');
    if (starIcon) {
        starIcon.classList.toggle('ri-star-line', !isStarred);
        starIcon.classList.toggle('ri-star-fill', isStarred);
    }

    // Update dropdown text
    const dropdownText = element.querySelector('.star-message');
    if (dropdownText) {
        dropdownText.innerHTML = isStarred
            ? '<i class="ri-star-fill"></i> Unstar'
            : '<i class="ri-star-line"></i> Star';
    }
}

// ==========================================================================================================================
//                                         FETCH/LOAD STARRED MESSAGES FROM BACKEND FUNCTION
// ===========================================================================================================================

// Load starred messages modal
async function loadStarredMessages() {
    try {
        const response = await fetch('/starred');
        const data = await response.json();

        const container = document.getElementById('starredMessagesList');
        container.innerHTML = '';

        if (!data.messages || data.messages.length === 0) {
            container.innerHTML = '<div class="empty-state">No starred messages</div>';
            return;
        }

        data.messages.forEach(msg => {
            const messageEl = document.createElement('div');
            messageEl.className = 'starred-message-item';
            messageEl.innerHTML = `
                <div class="starred-message-content">
                    <i class="ri-star-fill star-indicator"></i>
                    <div class="message-preview">
                        <span class="sender">${msg.is_own_message ? 'You' : msg.sender_name}</span>
                        <p class="message-text">
                            ${getMessagePreview(msg)}
                        </p>
                    </div>
                    <a href="${getMessageLink(msg)}" class="go-to-message">
                        <i class="ri-arrow-right-line"></i>
                    </a>
                </div>
                <div class="message-meta">
                    <span class="timestamp">${formatTimestamp(msg.timestamp)}</span>
                </div>
            `;
            container.appendChild(messageEl);
        });

        // Show modal
        document.getElementById('starredMessagesModal').classList.add('show');

    } catch (error) {
        console.error('Failed to load starred messages:', error);
    }
}

// Helper function to generate message preview text
function getMessagePreview(message) {
    if (message.message_type === 'text') {
        return message.message.length > 30
            ? message.message.substring(0, 30) + '...'
            : message.message;
    }
    return `📎 ${getFileType(message.message)}`;
}

// Helper function to generate message link
function getMessageLink(message) {
    if (message.group_id) {
        return `/group/${message.group_id}?message=${message._id}`;
    }
    return `/chat/${message.private_chat_id}?message=${message._id}`;
}

// Helper function to get file type
function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        'jpg': 'Image',
        'png': 'Image',
        'mp4': 'Video',
        'pdf': 'PDF',
        'docx': 'Word Doc',
        // Add more as needed
    };
    return types[ext] || 'File';
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== STAR MESSAGES FUNCTIONALITY ENDS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== DELETE MESSAGE FUNCTIONALITY STARTS HERE =====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ==========================================================================================================================
//                                         SHOW DELETE MODAL FUNCTION
// ===========================================================================================================================

let messageToDelete = null;
let isSenderOfMessage = false;

function showDeleteModal(messageId, isSender) {
    messageToDelete = messageId;
    isSenderOfMessage = isSender;
    const modal = document.getElementById("deleteModal");
    modal.classList.remove("hidden");

    // Only show "Delete for Everyone" if user is sender
    document.getElementById("deleteForEveryoneBtn").style.display =
        isSender ? "block" : "none";
}

// Delete for Me
document.getElementById("deleteForMeBtn").addEventListener("click", async function () {
    if (!messageToDelete) return;
    await deleteMessage(messageToDelete, "for_me");
    closeDeleteModal();
});

// Delete for Everyone
document.getElementById("deleteForEveryoneBtn").addEventListener("click", async function () {
    if (!messageToDelete || !isSenderOfMessage) return;
    await deleteMessage(messageToDelete, "for_everyone");
    closeDeleteModal();
});

// Cancel
document.getElementById("cancelDeleteBtn").addEventListener("click", closeDeleteModal);

function closeDeleteModal() {
    document.getElementById("deleteModal").classList.add("hidden");
    messageToDelete = null;
    isSenderOfMessage = false;
}


// ==========================================================================================================================
//                                         DELETE MESSAGE FUNCTION
// ==========================================================================================================================

async function deleteMessage(messageId, deleteType) {
    try {
        console.log("Deleting:", { messageId, deleteType }); // Debug log

        const user_id = sessionStorage.getItem("user_id"); // Get current user ID

        const response = await fetch(`/delete-messages/${messageId}/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // messageId: messageId,
                user_id: user_id,
                delete_type: deleteType,
            }),
        });

        const contentType = response.headers.get("Content-type");

        if (!response.ok) {
            if (contentType && contentType.includes("application/json")) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to delete message");
            } else {
                const errorText = await response.text();
                throw new Error(`Unexpected error: ${response.status} ${errorText}`);
            }
        }


        const data = await response.json();
        if (data.success) {
            console.log("✅ Deletion request sent. Waiting for socket to update UI.");
            return true;
        }
    } catch (err) {
        console.error("Delete error:", err);
        alert(err.message || "Failed to delete message");
        return false;
    }
}

// ==========================================================================================================================
//                                         UPDATE DELETE MESSAGE PREVIEW FUNCTION
// ==========================================================================================================================

function updateDeleteChatPreview(chatId, chatType, newText, newTimestamp) {
    const delchatItem = document.querySelector(
        `.chat-item-list[data-chat-id="${chatId}"][data-chat-type="${chatType}"]`
    );
    if (!delchatItem) {
        console.warn("⚠️ Chat item not found for preview update:", chatId, chatType);
        return;
    }

    // Update last message preview
    const delpreviewEl = delchatItem.querySelector(".content-message-text");
    if (delpreviewEl) {
        delpreviewEl.textContent = newText;
    }

    // Update timestamp
    const deltimeEl = delchatItem.querySelector(".content-message-time");
    if (deltimeEl) {
        const deldate = new Date(newTimestamp);
        deltimeEl.textContent = deldate.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        }).replace(" ", ""); // 8:40PM format
    }

    // Move chat to top of list if it was active
    const parentUl = delchatItem.parentElement;
    if (parentUl && delchatItem) {
        parentUl.prepend(delchatItem);
    }
}


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== DELETE MESSAGE FUNCTIONALITY ENDS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== ASIDE NAVIGATION FUNCTIONALITY STARTS HERE ===================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function showChatList() {
    // Show the main chat list section
    document.getElementById("chat-list").classList.remove("hidden");

    // Show chat list's internal message list
    document.querySelector("#chat-list > ul.content-messages-list").classList.remove("hidden");

    // Hide the starred messages list
    document.getElementById("starred-messages-list").classList.add("hidden");

    // Hide the Group and Private Chats
    document.getElementById("groups-list").classList.add("hidden");

    // Hide the Group and Private Chats
    document.getElementById("create-group").classList.add("hidden");
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================== ASIDE NAVIGATION - GROUP AND PRIVATE FUNCTIONALITY STARTS HERE ===============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ==========================================================================================================================
//                                         SHOW ALL GROUPS AND PRIVATE CHAT FOR USER FUNCTION
// ==========================================================================================================================

// async function showPrivateChatAndGroups() {
//     const user_id = sessionStorage.getItem("user_id");
//     if (!user_id) {
//         console.error("User ID not found.");
//         return;
//     }

//     const groupsList = document.getElementById("groups-list");
//     const ul = groupsList.querySelector("ul.content-messages-list");
//     ul.innerHTML = "";

//     try {
//         // Fetch groups + private chats
//         const res = await fetch(`/get_groups_and_private_chats?user_id=${user_id}`);
//         const data = await res.json();

//         // === Render Groups ===
//         if (Array.isArray(data.groups)) {
//             for (const group of data.groups) {
//                 const lastMessageResp = await fetch(
//                     `/get_last_message?chat_id=${group.id}&chat_type=group&user_id=${user_id}`
//                 );
//                 const lastMessageData = await lastMessageResp.json();

//                 const li = document.createElement("li");
//                 li.className = "chat-item-list";
//                 li.innerHTML = `
//                     <a href="#" class="chat-item"
//                        data-chat-id="${group.id}"
//                        data-chat-type="group"
//                        onclick="navigateToGroupAndPrivateChat(event)">
//                         <div class="chat-content-list">
//                             <img class="content-message-image" src="${group.image}" alt="Chat Image">
//                             <div class="chat-details content-message-info">
//                                 <span class="content-message-name" style="font-weight: bold;">${group.name}</span>
//                                 <span class="content-message-text">
//                                     ${lastMessageData?.message || 'No messages yet'}
//                                 </span>
//                                 <span class="content-message-time">
//                                     ${lastMessageData?.timestamp ? formatTimestamp(new Date(lastMessageData.timestamp)) : ''}
//                                     </span>
                                
//                             </div>
//                         </div>
//                     </a>
//                 `;
//                 ul.appendChild(li);
//             }
//         }

//         // === Render Private Chats ===
//         if (Array.isArray(data.private_chats)) {
//             for (const chat of data.private_chats) {
//                 const user = chat.with_user;
//                 const fullName = `${user.firstname} ${user.lastname}`;

//                 const lastMessageResp = await fetch(
//                     `/get_last_message?chat_id=${chat.chat_id}&chat_type=private&user_id=${user_id}`
//                 );
//                 const lastMessageData = await lastMessageResp.json();

//                 const li = document.createElement("li");
//                 li.className = "chat-item-list";
//                 li.innerHTML = `
//                     <a href="#" class="chat-item"
//                        data-chat-id="${chat.chat_id}"
//                        data-chat-type="private"
//                        onclick="navigateToGroupAndPrivateChat(event)">
//                         <div class="chat-content-list">
//                             <img class="content-message-image" src="${user.image}" alt="Chat Image">
//                             <div class="chat-details content-message-info">
//                                 <span class="content-message-name" style="font-weight: bold;">${fullName}</span>
//                                 <span class="content-message-text">
//                                     ${lastMessageData?.message || 'No messages yet'}
//                                 </span>
//                                 <span class="content-message-time">
//                                     ${lastMessageData?.timestamp ? formatTimestamp(new Date(lastMessageData.timestamp)) : ''}
//                                     </span>
                                
//                             </div>
//                         </div>
//                     </a>
//                 `;
//                 ul.appendChild(li);
//             }
//         }

//         // Show groups, hide starred messages
//         document.getElementById("chat-list").classList.remove("hidden");
//         document.querySelector("#chat-list > ul.content-messages-list").classList.add("hidden");
//         groupsList.classList.remove("hidden");
//         document.getElementById("starred-messages-list").classList.add("hidden");
//         document.getElementById("create-group").classList.add("hidden");

//     } catch (err) {
//         console.error("❌ Error fetching chats:", err);
//     }
// }

async function showPrivateChatAndGroups() {
    const user_id = sessionStorage.getItem("user_id");
    if (!user_id) {
        console.error("User ID not found.");
        return;
    }

    const groupsList = document.getElementById("groups-list");
    const ul = groupsList.querySelector("ul.content-messages-list");
    ul.innerHTML = "";

    try {
        const res = await fetch(`/get_groups_and_private_chats?user_id=${user_id}`);
        const data = await res.json();

        // === Render Groups ===
        if (Array.isArray(data.groups)) {
            for (const group of data.groups) {
                const li = document.createElement("li");
                li.className = "chat-item-list";
                li.innerHTML = `
                    <a href="#" class="chat-item"
                       data-chat-id="${group.id}"
                       data-chat-type="group"
                       onclick="navigateToGroupAndPrivateChat(event)">
                        <div class="chat-content-list">
                            <img class="content-message-image" src="${group.image}" alt="Chat Image">
                            <div class="chat-details content-message-info">
                                <span class="content-message-name" style="font-weight: bold;">${group.name}</span>
                                <span class="content-message-text">
                                    ${group.last_message || 'No messages yet'}
                                </span>
                                <span class="content-message-time">
                                    ${group.last_timestamp ? formatTimestamp(new Date(group.last_timestamp)) : ''}
                                </span>
                            </div>
                        </div>
                    </a>
                `;
                ul.appendChild(li);
            }
        }

        // === Render Private Chats ===
        if (Array.isArray(data.private_chats)) {
            for (const chat of data.private_chats) {
                const user = chat.with_user;
                const fullName = `${user.firstname} ${user.lastname}`;

                const li = document.createElement("li");
                li.className = "chat-item-list";
                li.innerHTML = `
                    <a href="#" class="chat-item"
                       data-chat-id="${chat.chat_id}"
                       data-chat-type="private"
                       onclick="navigateToGroupAndPrivateChat(event)">
                        <div class="chat-content-list">
                            <img class="content-message-image" src="${user.image}" alt="Chat Image">
                            <div class="chat-details content-message-info">
                                <span class="content-message-name" style="font-weight: bold;">${fullName}</span>
                                <span class="content-message-text">
                                    ${chat.last_message || 'No messages yet'}
                                </span>
                                <span class="content-message-time">
                                    ${chat.last_timestamp ? formatTimestamp(new Date(chat.last_timestamp)) : ''}
                                </span>
                            </div>
                        </div>
                    </a>
                `;
                ul.appendChild(li);
            }
        }

        // Show correct UI
        document.getElementById("chat-list").classList.remove("hidden");
        document.querySelector("#chat-list > ul.content-messages-list").classList.add("hidden");
        groupsList.classList.remove("hidden");
        document.getElementById("starred-messages-list").classList.add("hidden");
        document.getElementById("create-group").classList.add("hidden");

    } catch (err) {
        console.error("❌ Error fetching chats:", err);
    }
}



// ==========================================================================================================================
//                                         GET ALL PRIVATE AND GROUP CHAT HISTORY FUNCTION
// ==========================================================================================================================

function getGroupAndPrivateChatHistory() {
    // Clear the existing chat list
    const chatList = document.getElementById("chat-list");
    chatList.innerHTML = "";

    // Fetch the last messages for all chats
    fetch("/get_last_message", {
        method: "GET",
        headers: {
            "Content-Type": "application/json"
        }
    })
        .then(response => response.json())
        .then(data => {
            if (data.groups && data.groups.length > 0) {
                data.groups.forEach(group => {
                    addChatListItem(group.id, group.name, group.last_message, "group");
                });
            }

            if (data.private_chats && data.private_chats.length > 0) {
                data.private_chats.forEach(chat => {
                    addChatListItem(chat.id, chat.name, chat.last_message, "private");
                });
            }
        })
        .catch(err => console.error("Error fetching last messages:", err));
}

// ==========================================================================================================================
//                                         ADD FORWARDED CHAT TO CHATLIST FUNCTION
// ==========================================================================================================================

function addChatListItem(id, name, lastMessage, type) {
    const chatList = document.getElementById("chat-list");

    const listItem = document.createElement("div");
    listItem.classList.add("chat-list-item");
    listItem.dataset.chatId = id;
    listItem.dataset.chatType = type;

    listItem.innerHTML = `
        <div class="chat-name">${name}</div>
        <div class="chat-preview">${lastMessage || ""}</div>
    `;

    listItem.addEventListener("click", () => {
        navigateToGroupAndPrivateChat(type, id);
    });

    chatList.appendChild(listItem);
}

// ==========================================================================================================================
//                                         NAVIGATE TO GROUP AND PRIVATE CHAT FUNCTION
// ==========================================================================================================================

// Navigate to starred message
async function navigateToGroupAndPrivateChat(event) {
    event.preventDefault();

    const target = event.currentTarget;
    const chatId = target.dataset.chatId;
    const chatType = target.dataset.chatType;

    // Store the active chat in session for reference
    sessionStorage.setItem("active_chat_id", chatId);
    sessionStorage.setItem("active_chat_type", chatType);

    // Hide group/private panel and show main chat area
    document.getElementById("groups-list").classList.add("hidden");
    document.getElementById("starred-messages-list").classList.add("hidden");
    document.getElementById("create-group").classList.add("hidden");
    document.getElementById("chat-list").classList.remove("hidden");
    document.querySelector("#chat-list > ul.content-messages-list").classList.remove("hidden");

    // Load the chat (reuse your loadChat function)
    await loadChat(chatId, chatType);

    // 👇 Fetch chat info to update header
    try {
        const res = await fetch(`/chat-info/${chatType}/${chatId}`);
        const data = await res.json();
        updateChatHeader(data.name, data.image);
    } catch (err) {
        console.error("Failed to fetch chat info:", err);
    }


    // ✅ Highlight this chat in the list
    const chatListItems = document.querySelectorAll("#main-chat-list .chat-item-list");

    chatListItems.forEach(item => {
        const itemChatId = item.dataset.chatId;
        if (itemChatId === chatId) {
            item.classList.add("active");  // adjust this class if needed
        } else {
            item.classList.remove("active");
        }
    });

    const activeItem = document.querySelector(`#main-chat-list .chat-item-list[data-chat-id="${chatId}"]`);
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: "smooth", block: "center" });
    }


}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================== ASIDE NAVIGATION - GROUP AND PRIVATE FUNCTIONALITY ENDS HERE =================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================== ASIDE NAVIGATION - STARRED MESSAGE FUNCTIONALITY STARTS HERE =================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// ==========================================================================================================================
//                                         SHOW STARRED MESSAGES FUNCTION
// ==========================================================================================================================

function showStarredMessages() {
    fetch('/starred')
        .then(res => res.json())
        .then(data => {
            console.log('Starred messages data:', data); // Add this
            if (data.messages) {

                renderStarredMessages(data.messages);

                // Ensure chat list is visible, but hide its internal message list
                document.getElementById("chat-list").classList.remove("hidden");
                document.querySelector("#chat-list > ul.content-messages-list").classList.add("hidden");

                // Show the starred messages
                document.getElementById("starred-messages-list").classList.remove("hidden");

                // Show the Groups and Private Chat
                document.getElementById("groups-list").classList.add("hidden");

                // Show the Create group
                document.getElementById("create-group").classList.add("hidden");

            }
        })
        .catch(error => console.error('Error fetching starred messages:', error));
}


// ==========================================================================================================================
//                                            RENDER STARRED MESSAGES FUNCTION
// ==========================================================================================================================

function renderStarredMessages(messages) {
    const ul = document.getElementById("starred-messages-ul");
    ul.innerHTML = "";

    if (messages.length === 0) {
        ul.innerHTML = "<p style='padding:1em;'>No starred messages</p>";
        return;
    }

    messages.forEach(msg => {
        const chatType = msg.group_id ? "group" : "private";
        const chatId = msg.group_id || msg.private_chat_id;
        const sender = msg.sender_name || "Unknown";
        const date = new Date(msg.timestamp).toLocaleDateString("en-GB", {
            day: '2-digit', month: 'short', year: '2-digit'
        });

        let preview = "";
        const fileName = msg.file_name || "file";

        // Get file extension for icon mapping
        const fileExt = fileName.split('.').pop().toLowerCase();

        switch (msg.message_type) {
            case 'text':
                preview = `<span class="content-message-text">
                    ${msg.message && msg.message.length > 40 ? msg.message.slice(0, 40) + "…" : msg.message || ""}
                </span>`;
                break;

            case 'image':
                preview = `<img src="${msg.file_url}" alt="image" class="starred-thumb"
                             onerror="this.src='';"
                             style="max-width: 100px; max-height: 100px;">`;
                break;

            case 'video':
                preview = `<div class="video-preview">
                    <img src="" class="starred-thumb" alt="video" 
                         style="max-width: 100px; max-height: 100px;">
                </div>`;
                break;

            case 'audio':
                preview = `
                    <div class="file-row">
                        <img src="/static/images/audio-icon.png" class="starred-thumb" alt="audio file">
                        <span class="file-name">${fileName}</span>
                    </div>`;
                break;

            case 'pdf':
            case 'docx':
            case 'xlsx':
            case 'zip':
            case 'file': // Generic file type
                // Map file extensions to icons
                let iconType = 'file'; // default
                if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'zip'].includes(fileExt)) {
                    iconType = fileExt;
                } else if (msg.message_type !== 'file') {
                    iconType = msg.message_type;
                }

                preview = `
                    <div class="file-row" style="display: flex; align-items: center;">
                        <img src="/static/images/${iconType}-icon.png" class="starred-thumb" alt="${iconType} file" 
                             onerror="this.src='/static/images/file-icon.png';">
                        <span class="file-name" style="margin-left: 8px;">${fileName}</span>
                    </div>`;
                break;

            default:
                // Handle unknown file types
                if (msg.file_id) {
                    preview = `
                        <div class="file-row" style="display: flex; align-items: center;">
                            <img src="/static/images/file-icon.png" class="starred-thumb" alt="file">
                            <span class="file-name" style="margin-left: 8px;">${fileName}</span>
                        </div>`;
                } else {
                    preview = `<span class="content-message-text">${msg.message || ""}</span>`;
                }
        }

        const li = document.createElement("li");
        li.className = "chat-item-list";

        li.innerHTML = `
            <a href="#" class="chat-item"
               data-message-id="${msg._id}"
               data-chat-id="${chatId}"
               data-chat-type="${chatType}"
               onclick="navigateToMessage(event)">
                <div class="chat-content-list">
                    <div class="chat-details content-message-info">
                        <span class="content-message-name" style="font-weight: bold;">${sender}</span>
                        ${preview}
                        <span class="content-message-time">${date}</span>
                    </div>
                </div>
            </a>
        `;

        ul.appendChild(li);
    });
}

// ==========================================================================================================================
//                                             NAVIGATE TO MESSAGES FUNCTION
// ==========================================================================================================================

// Navigate to starred message
async function navigateToMessage(event) {
    event.preventDefault();

    const target = event.currentTarget;
    const chatId = target.dataset.chatId;
    const chatType = target.dataset.chatType;
    const messageId = target.dataset.messageId;

    // Store the active chat in session for reference
    sessionStorage.setItem("active_chat_id", chatId);
    sessionStorage.setItem("active_chat_type", chatType);

    // Hide starred messages and show main chat view
    document.getElementById("starred-messages-list").classList.add("hidden");
    document.getElementById("chat-list").classList.remove("hidden");
    document.querySelector("#chat-list > ul.content-messages-list").classList.remove("hidden");

    // Load the chat (reuse your loadChat function)
    await loadChat(chatId, chatType);

    // 👇 Fetch chat info to update header
    try {
        const res = await fetch(`/chat-info/${chatType}/${chatId}`);
        const data = await res.json();
        updateChatHeader(data.name, data.image);
    } catch (err) {
        console.error("Failed to fetch chat info:", err);
    }

    // ✅ Highlight this chat in the list
    const chatListItems = document.querySelectorAll("#main-chat-list .chat-item-list");

    chatListItems.forEach(item => {
        const itemChatId = item.dataset.chatId;
        if (itemChatId === chatId) {
            item.classList.add("active");  // adjust this class if needed
        } else {
            item.classList.remove("active");
        }
    });


    // Scroll to the starred message after chat loads
    setTimeout(() => {
        const msgEl = document.getElementById(`message-${messageId}`);
        if (msgEl) {
            msgEl.scrollIntoView({ behavior: "smooth", block: "center" });
            msgEl.classList.add("highlighted-message");

            // Remove highlight after 2-3 seconds
            setTimeout(() => {
                msgEl.classList.remove("highlighted-message");
            }, 3000);
        }
    }, 500); // Adjust timeout as needed based on load time
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================== ASIDE NAVIGATION - STARRED MESSAGE FUNCTIONALITY ENDS HERE ===================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxX

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ============================== SIDEBAR -  FUNCTION HANDLE DROPDOWN LIST ITEMS IN CHAT LISTS STARTS HERE ============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// Toggle dropdown menu visibility
function toggleMenu(button) {
    let chatOptions = button.closest(".chat-options");

    // Close any open dropdowns before opening a new one
    document.querySelectorAll(".chat-options").forEach(option => {
        if (option !== chatOptions) {
            option.classList.remove("active");
        }
    });

    // Toggle the current dropdown
    chatOptions.classList.toggle("active");
}

// Close dropdown when clicking outside
document.addEventListener("click", function (event) {
    document.querySelectorAll(".chat-options").forEach(dropdown => {
        if (!dropdown.contains(event.target) && !event.target.closest(".menu-btn")) {
            dropdown.classList.remove("active");
        }
    });
});



// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ============================== SIDEBAR -  FUNCTION HANDLE DROPDOWN LIST ITEMS IN CHAT LISTS ENDSS HERE ============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== DELETE CHAT FROM CHATLIST FUNCTIONALITY STARTS HERE ==================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function deleteChat(chatId, button) {
    let chatItem = button.closest(".chat-item-list"); // Find the closest chat list item

    if (chatItem) {
        chatItem.remove(); // Remove from UI
    } else {
        console.error("Chat element not found in the DOM.");
    }

    // Send request to Flask to mark chat as deleted
    fetch(`/delete_chat/${chatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                alert("Error: " + data.error);
            }
        })
        .catch(error => console.error("Error deleting chat:", error));
}
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== DELETE CHAT FROM CHATLIST FUNCTIONALITY ENDS HERE ====================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== NEW GROUP FUNCTIONALITY STRATS HERE ===================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function createGroups() {
    // Show only the create group section
    document.getElementById("create-group").classList.remove("hidden");

    // Hide starred messages
    document.getElementById("starred-messages-list").classList.add("hidden");

    // Hide groups list
    document.getElementById("groups-list").classList.add("hidden");

    // Hide main chat list
    document.getElementById("main-chat-list").classList.add("hidden");

}

// ==========================================================================================================================
//                                             SEARCH AND ADD USER TO GROUP
// ==========================================================================================================================

let selectedMembers = new Set(); // keeps track of selected members

function searchNewUser() {
    let query = document.getElementById("NewSearchInput").value.trim();
    if (query.length < 2) {
        document.getElementById("NewSearchResults").innerHTML = "";
        return;
    }

    fetch(`/search_users?query=${query}`)
        .then(response => response.json())
        .then(data => {
            let searchResults = document.getElementById("NewSearchResults");
            searchResults.innerHTML = "";

            if (data.length === 0) {
                searchResults.innerHTML = "<p>No users found</p>";
                return;
            }

            data.forEach(user => {
                let userItem = document.createElement("div");
                userItem.classList.add("search-item");

                let userImage = user.image_url || "/static/images/dsa-logo.png";

                userItem.innerHTML = `
                    <div class="group-search-user">
                        <div class="user-container">
                            <img src="${userImage}" alt="User Avatar" class="user-avatar">
                            <div class="user-details">
                                <p>${user.firstname} ${user.lastname} (${user.staffid})</p>
                            </div>
                        </div>
                        <div class="checkbox-container">
                            <input type="checkbox" value="${user.id}" 
                                onchange="toggleMemberSelection('${user.id}', this)">
                        </div>
                    </div>
                `;


                searchResults.appendChild(userItem);
            });
        })
        .catch(error => console.error("Error searching users:", error));
}

function toggleMemberSelection(userId, checkbox) {
    if (checkbox.checked) {
        selectedMembers.add(userId);
    } else {
        selectedMembers.delete(userId);
    }

}
// ==========================================================================================================================
//                                             NEW GROUP MODAL
// ==========================================================================================================================

function showCreateGroup() {
    document.getElementById("groupModal").classList.remove("hidden");

}

// ==========================================================================================================================
//                                             SUBMIT NEW GROUP TO SERVER
// ==========================================================================================================================

async function submitNewGroup() {
    const groupName = document.getElementById("groupName").value.trim();
    if (!groupName) {
        showFlashMessage('Group name is required!', 'error');
        return;
    }

    const currentUserId = sessionStorage.getItem("user_id");
    selectedMembers.add(currentUserId);

    let payload = {
        name: groupName,
        members: Array.from(selectedMembers),
        created_by: currentUserId
    };

    let res = await fetch("/create_group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    let data = await res.json();
    if (data.success) {
        showFlashMessage('Group created successfully!', 'success');
        closeGroupModal();

        // ✅ Add new group to chat list dynamically
        addGroupToChatList(data.group_id, groupName);

        // ✅ Update chat header immediately
        updateChatHeader(data.name, data.image);

        // ✅ Auto-open the group chat immediately
        sessionStorage.setItem("active_chat_id", data.group_id);
        sessionStorage.setItem("active_chat_type", "group");
        socket.emit("join_group", { group_id: data.group_id }); // ✅ join immediately
        await loadChat(data.group_id, "group");

    } else {
        showFlashMessage(`Error: ${data.error}`, 'error');
    }
}

// ==========================================================================================================================
//                                            NEW GROUP CLOSE MODAL
// ==========================================================================================================================

function closeGroupModal() {
    const modal = document.getElementById("groupModal");
    if (modal) {
        modal.classList.add("hidden"); // matches your `showCreateGroup`
    }

    // Reset inputs
    document.getElementById("groupName").value = "";
    document.getElementById("NewSearchInput").value = "";
    document.getElementById("NewSearchResults").innerHTML = "";

    selectedMembers.clear();
}


// Close modal when clicking outside content
document.getElementById("groupModal").addEventListener("click", function (e) {
    if (e.target === this) { // only when clicking the background, not content
        closeGroupModal();
    }
});

// ==========================================================================================================================
//                                            ADD NEW GROUP TO CHATLIST
// ==========================================================================================================================

function addGroupToChatList(groupId, groupName, groupImage = "/static/images/dsa-logo.png") {
    const list = document.getElementById("main-chat-list");
    if (!list) return;

    // Create LI element same as server-rendered chats
    let li = document.createElement("li");
    li.className = "chat-item-list";
    li.setAttribute("data-chat-id", groupId);
    li.setAttribute("data-chat-type", "group");
    li.setAttribute("data-chat-name", groupName);   // ✅ store group name
    li.setAttribute("data-chat-image", groupImage); // ✅ store group image
    li.setAttribute("data-unread-count", "0");
    li.setAttribute("data-last-message", "Group created");
    li.setAttribute("data-timestamp", new Date().toISOString());

    li.innerHTML = `
        <a href="javascript:void(0)" onclick="loadChat('${groupId}','group')" 
           class="chat-item" aria-label="Group ${groupName}">
            <div class="chat-content-list">
                <img class="content-message-image" src="${groupImage}" alt="${groupName}"
                     onerror="this.src='/static/images/default-profile.png'">

                <div class="chat-details content-message-info">
                    <span class="content-message-name">${groupName}</span>
                    <div class="tooltip-wrapper">
                        <span class="content-message-text">Group created</span>
                        <div class="custom-tooltip">Group created</div>
                    </div>
                    <div class="content-message-meta">
                        <span class="content-message-time">${formatTimestamp(new Date())}</span>
                    </div>
                </div>
                <hr>
            </div>
        </a>
        <div class="chat-options">
            <button type="button" class="menu-btn" onclick="toggleMenu(this)">
                <i class="ri-more-2-line"></i>
            </button>
            <ul class="chat-dropdown-menu">
                <li><a href="#" class="chat-dropdown-item" onclick="deleteChat('${groupId}', this)">
                    <i class="ri-delete-bin-line"></i> Delete
                </a></li>
            </ul>
        </div>
    `;

    // Remove active from other chats
    document.querySelectorAll(".chat-item-list").forEach(el => el.classList.remove("active"));

    // Add active class to the new one
    li.classList.add("active");

    list.prepend(li); // Add to top immediately

    // ✅ Instantly update header with this group's info
    updateChatHeader(groupName, groupImage);
}

// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== NEW GROUP FUNCTIONALITY ENDS HERE ===================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== CHAT AREA HEADER FUNCTIONALITY STARTS HERE ===================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

function syncChatHeaderDrawer(chatId, chatType, userId = null) {
    if (!chatId || !chatType) return;
    const currentUserId = userId || sessionStorage.getItem("user_id");

    const sidebar = document.getElementById("hideMember");
    if (sidebar) {
        sidebar.style.display = (chatType === "group") ? "block" : "none";
    }

    const showPrivateInfo = document.getElementById("showPrivateInfo");
    const showGroupInfo = document.getElementById("showGroupInfo");
    const showPrivatebutton = document.getElementById("showPrivatebutton");
    const showGroupbutton = document.getElementById("showGroupbutton");

    if (showPrivateInfo && showPrivatebutton) {
        showPrivateInfo.style.display = (chatType === "private") ? "block" : "none";
        showPrivatebutton.style.display = (chatType === "private") ? "flex" : "none";
    }
    if (showGroupInfo && showGroupbutton) {
        showGroupInfo.style.display = (chatType === "group") ? "block" : "none";
        showGroupbutton.style.display = (chatType === "group") ? "flex" : "none";
    }

    if (chatType === "group") {
        sessionStorage.setItem("active_group_id", chatId);
        const headerTitle = document.getElementById("chatHeader")?.textContent?.trim();
        if (headerTitle) {
            sessionStorage.setItem("active_group_name", headerTitle);
        }
        getGroupMembers(chatId);
        updateChatBlockUI(chatId, "group", false, false);
    }

    loadOverviewDetails(chatId, chatType, currentUserId);
    loadMedia(chatId, chatType);
    loadFiles(chatId, chatType);
    if (typeof loadLinks === "function") {
        loadLinks(chatId, chatType);
    }
}

function toggleHeaderModal() {
    const modal = document.getElementById("headerModal");
    if (!modal) return;
    const willOpen = !modal.classList.contains("active");
    if (willOpen) {
        const chatId = window.activeChatId || sessionStorage.getItem("active_chat_id");
        const chatType = window.activeChatType || sessionStorage.getItem("active_chat_type");
        if (chatId && chatType) {
            syncChatHeaderDrawer(chatId, chatType);
        }
    }
    modal.classList.toggle("active");
}

function closeHeadersModal() {
    const modal = document.getElementById("headerModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// Close modal when clicking outside content
document.addEventListener("click", function (event) {
    const modal = document.getElementById("headerModal");
    if (!modal) return;
    const content = modal.querySelector(".header-content");

    // Only act if modal is active/open
    if (modal.classList.contains("active")) {
        if (content && !content.contains(event.target) && !event.target.closest("[data-open-header]")) {
            modal.classList.remove("active");
        }
    }
});


document.querySelectorAll(".header-sidebar a").forEach(link => {
    link.addEventListener("click", function (e) {
        e.preventDefault();

        // Remove active class from all sidebar items
        document.querySelectorAll(".header-sidebar a").forEach(a => a.classList.remove("active"));
        // Add active to clicked item
        this.classList.add("active");

        // Hide all tab contents
        document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));

        // Show the selected tab
        const tabId = this.getAttribute("data-tab");
        document.getElementById(tabId).classList.add("active");
    });
});


function filterMembers() {
    const input = document.getElementById("search").value.toLowerCase();
    const members = document.querySelectorAll(".member");
    members.forEach(member => {
        const name = member.querySelector("h4").innerText.toLowerCase();
        member.style.display = name.includes(input) ? "" : "none";
    });
}


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO DISPLAY ALL GROUP MEMBERS STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

// FOR MEMBERS TAB

function getGroupMembers(groupId) {
    const currentUserId = sessionStorage.getItem("user_id") || "";
    if (!groupId) return;

    fetch(`/get_group_members?group_id=${encodeURIComponent(groupId)}&user_id=${encodeURIComponent(currentUserId)}`)
        .then(response => response.json())
        .then(data => {
            const group_members = document.getElementById("memberList");
            const membersCountEl = document.getElementById("membersCount");
            if (!group_members || !membersCountEl) return;

            group_members.innerHTML = "";

            if (data.group_name) {
                sessionStorage.setItem("active_group_name", data.group_name);
            }

            // Show "+ Add Member" button only to group admins (WhatsApp style)
            const addMemberContainer = document.querySelector("#hideMember .new-member");
            if (addMemberContainer) {
                addMemberContainer.style.display = data.is_admin ? "block" : "none";
            }

            if (!data.members || data.members.length === 0) {
                group_members.innerHTML = "<p style='padding: 12px; color: #666;'>No members found</p>";
                membersCountEl.textContent = "Members (0)";
                return;
            }

            membersCountEl.textContent = `Members (${data.members.length})`;
            const currentUserIsAdmin = Boolean(data.is_admin);

            data.members.forEach(user => {
                const memberItem = document.createElement("div");
                memberItem.classList.add("member-item");

                const isYou = Boolean(user.is_you) || String(user.id) === String(currentUserId);
                const isAdmin = user.role === "admin" || Boolean(user.is_admin);
                const fullName = `${user.firstname || ""} ${user.lastname || ""}`.trim() || "Unknown";
                const safeFullName = escapeHtml(fullName).replace(/'/g, "\\'");

                const roleBadgeHtml = isAdmin
                    ? `<span class="role admin-badge">Group Admin</span>`
                    : `<span class="role member-badge">Member</span>`;

                let adminControlsHtml = "";
                if (currentUserIsAdmin && !isYou) {
                    const toggleBtnHtml = isAdmin
                        ? `<button type="button" class="member-action-btn dismiss-admin-btn" title="Dismiss as admin" onclick="toggleGroupAdmin('${groupId}', '${user.id}', 'demote', '${safeFullName}')">
                               <i class="ri-shield-cross-line"></i> Dismiss as admin
                           </button>`
                        : `<button type="button" class="member-action-btn make-admin-btn" title="Make group admin" onclick="toggleGroupAdmin('${groupId}', '${user.id}', 'promote', '${safeFullName}')">
                               <i class="ri-shield-user-line"></i> Make group admin
                           </button>`;

                    const removeBtnHtml = `<button type="button" class="member-action-btn remove-member-btn" title="Remove from group" onclick="removeGroupMember('${groupId}', '${user.id}', '${safeFullName}')">
                        <i class="ri-user-unfollow-line"></i> Remove
                    </button>`;

                    adminControlsHtml = `
                        <div class="member-admin-actions">
                            ${toggleBtnHtml}
                            ${removeBtnHtml}
                        </div>
                    `;
                }

                memberItem.innerHTML = `
                    <div class="member">
                        <img src="${user.image}" alt="User Avatar" class="user-avatar" onerror="this.src='/static/images/default-profile.png'">
                        <div class="member-info">
                            <p class="member-name">
                                ${escapeHtml(fullName)} ${isYou ? '<span class="you-tag">(You)</span>' : ''}
                            </p>
                            <span class="member-staffid">${escapeHtml(user.staffid || '')}</span>
                            ${adminControlsHtml}
                        </div>
                        <div class="member-role-col">
                            ${roleBadgeHtml}
                        </div>
                    </div>
                `;

                group_members.appendChild(memberItem);
            });
        })
        .catch(error => console.error("Error fetching members:", error));
}

async function toggleGroupAdmin(groupId, targetUserId, action, targetName = "Member") {
    const currentUserId = sessionStorage.getItem("user_id");
    if (!groupId || !targetUserId || !currentUserId) return;

    try {
        const res = await fetch("/group_admin_action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                target_user_id: targetUserId,
                action: action,
                user_id: currentUserId
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showFlashMessage(
                data.message || (action === "promote" ? `${targetName} is now a group admin` : `${targetName} dismissed as admin`),
                "success"
            );
            getGroupMembers(groupId);
        } else {
            showFlashMessage(data.error || "Failed to update admin status", "error");
        }
    } catch (err) {
        console.error("Error updating group admin:", err);
        showFlashMessage("Failed to update group admin role", "error");
    }
}

async function removeGroupMember(groupId, targetUserId, targetName = "this member") {
    const currentUserId = sessionStorage.getItem("user_id");
    if (!groupId || !targetUserId || !currentUserId) return;

    try {
        const res = await fetch("/remove_group_member", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                target_user_id: targetUserId,
                user_id: currentUserId
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            showFlashMessage(data.message || `Removed ${targetName} from group`, "success");
            getGroupMembers(groupId);
            loadOverviewDetails(groupId, "group", currentUserId);
        } else {
            showFlashMessage(data.error || "Failed to remove member", "error");
        }
    } catch (err) {
        console.error("Error removing group member:", err);
        showFlashMessage("Failed to remove member from group", "error");
    }
}

// ==========================================================================================================================
//                                         EXIT / LEAVE GROUP FUNCTIONALITY
// ==========================================================================================================================

let pendingExitGroupId = null;

function leaveGroup() {
    const activeType = window.activeChatType || sessionStorage.getItem("active_chat_type");
    const groupId = (activeType === "group" && window.activeChatId) ||
        sessionStorage.getItem("active_group_id") ||
        sessionStorage.getItem("active_chat_id");

    if (!groupId) {
        showFlashMessage("No active group selected", "error");
        return;
    }

    pendingExitGroupId = groupId;
    const groupName = document.getElementById("groupname")?.textContent?.trim() ||
        document.getElementById("chatHeader")?.textContent?.trim() ||
        sessionStorage.getItem("active_group_name") ||
        "this group";

    const confirmTextEl = document.getElementById("exitGroupConfirmText");
    if (confirmTextEl) {
        confirmTextEl.textContent = `Are you sure you want to exit "${groupName}"?`;
    }

    const exitModal = document.getElementById("exitGroupModal");
    if (exitModal) {
        exitModal.classList.remove("hidden");
    } else {
        confirmLeaveGroup();
    }
}

function closeExitGroupModal() {
    const exitModal = document.getElementById("exitGroupModal");
    if (exitModal) {
        exitModal.classList.add("hidden");
    }
    pendingExitGroupId = null;
}

async function confirmLeaveGroup() {
    const groupId = pendingExitGroupId ||
        sessionStorage.getItem("active_group_id") ||
        (window.activeChatType === "group" ? window.activeChatId : null);
    const currentUserId = sessionStorage.getItem("user_id");

    if (!groupId || !currentUserId) {
        closeExitGroupModal();
        showFlashMessage("Unable to exit group: missing group or user session", "error");
        return;
    }

    try {
        const res = await fetch("/leave_group", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                user_id: currentUserId
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            showFlashMessage(data.error || "Failed to exit group", "error");
            closeExitGroupModal();
            return;
        }

        // Leave socket room for this group
        socket.emit("leave_group", { group_id: groupId });

        // Close modals
        closeExitGroupModal();
        closeHeadersModal();

        // Remove group from sidebar chat lists (#main-chat-list and #groups-ul)
        document.querySelectorAll(`[data-chat-id="${groupId}"]`).forEach(el => {
            const li = el.closest("li.chat-item-list") || el;
            li.remove();
        });

        // Clear active chat state if this group was open
        if (String(window.activeChatId) === String(groupId)) {
            window.activeChatId = null;
            window.activeChatType = null;
        }
        sessionStorage.removeItem("active_chat_id");
        sessionStorage.removeItem("active_chat_type");
        sessionStorage.removeItem("active_group_id");
        sessionStorage.removeItem("active_group_name");

        // Reset conversation view back to welcome screen
        const chatContainer = document.getElementById("conversation-main");
        if (chatContainer) chatContainer.innerHTML = "";

        const conversation = document.getElementById("conversation-1");
        const welcomeScreen = document.querySelector(".conversation-default");
        if (conversation) {
            conversation.classList.remove("active");
            conversation.classList.add("hidden");
        }
        if (welcomeScreen) {
            welcomeScreen.classList.remove("hidden");
            welcomeScreen.classList.add("active");
        }

        showFlashMessage(data.message || "You exited the group", "success");
    } catch (err) {
        console.error("Error exiting group:", err);
        closeExitGroupModal();
        showFlashMessage("Something went wrong while exiting the group", "error");
    }
}

// Listen for real-time group member & admin updates
socket.on("group_members_updated", (data) => {
    if (!data || !data.group_id) return;
    const activeId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    const activeGroupId = sessionStorage.getItem("active_group_id");

    if (String(activeId) === String(data.group_id) || String(activeGroupId) === String(data.group_id)) {
        getGroupMembers(data.group_id);
        const currentUserId = sessionStorage.getItem("user_id");
        if (currentUserId) {
            loadOverviewDetails(data.group_id, "group", currentUserId);
        }
    }
});

// Listen if the current user was removed from a group by an admin
socket.on("removed_from_group", (data) => {
    if (!data || !data.group_id) return;
    const groupId = String(data.group_id);
    socket.emit("leave_group", { group_id: groupId });

    document.querySelectorAll(`[data-chat-id="${groupId}"]`).forEach(el => {
        const li = el.closest("li.chat-item-list") || el;
        li.remove();
    });

    const activeId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    if (String(activeId) === groupId) {
        closeHeadersModal();
        window.activeChatId = null;
        window.activeChatType = null;
        sessionStorage.removeItem("active_chat_id");
        sessionStorage.removeItem("active_chat_type");
        sessionStorage.removeItem("active_group_id");
        sessionStorage.removeItem("active_group_name");

        const chatContainer = document.getElementById("conversation-main");
        if (chatContainer) chatContainer.innerHTML = "";

        const conversation = document.getElementById("conversation-1");
        const welcomeScreen = document.querySelector(".conversation-default");
        if (conversation) {
            conversation.classList.remove("active");
            conversation.classList.add("hidden");
        }
        if (welcomeScreen) {
            welcomeScreen.classList.remove("hidden");
            welcomeScreen.classList.add("active");
        }
    }

    showFlashMessage(`You were removed from ${data.group_name || "the group"}`, "error");
});

// ==========================================================================================================================
//                                         BLOCK / UNBLOCK CONTACT FUNCTIONALITY
// ==========================================================================================================================

window.currentChatBlockState = {
    chatId: null,
    isBlockedByMe: false,
    isBlockedByOther: false
};

let pendingBlockContactChatId = null;
let pendingBlockAction = "block";

function updateBlockContactButton(isBlockedByMe) {
    const btn = document.getElementById("showPrivatebutton");
    if (!btn) return;

    if (isBlockedByMe) {
        btn.innerHTML = `<i class="ri-Forbid-2-line"></i> Unblock Contact`;
        btn.classList.remove("exit-group-btn");
        btn.classList.add("unblock-contact-btn");
        btn.dataset.blockState = "blocked";
    } else {
        btn.innerHTML = `<i class="ri-Forbid-2-line"></i> Block Contact`;
        btn.classList.remove("unblock-contact-btn");
        btn.classList.add("exit-group-btn");
        btn.dataset.blockState = "unblocked";
    }
}

function updateChatBlockUI(chatId, chatType, isBlockedByMe = false, isBlockedByOther = false) {
    const banner = document.getElementById("blockedChatBanner");
    const chatInputForm = document.getElementById("chatInput");

    if (chatType !== "private") {
        window.currentChatBlockState = {
            chatId: chatId || null,
            isBlockedByMe: false,
            isBlockedByOther: false
        };
        if (banner) {
            banner.classList.add("hidden");
            banner.innerHTML = "";
        }
        if (chatInputForm) {
            chatInputForm.style.display = "";
        }
        return;
    }

    window.currentChatBlockState = {
        chatId: String(chatId || ""),
        isBlockedByMe: Boolean(isBlockedByMe),
        isBlockedByOther: Boolean(isBlockedByOther)
    };

    updateBlockContactButton(Boolean(isBlockedByMe));

    if (!banner || !chatInputForm) return;

    if (isBlockedByMe) {
        chatInputForm.style.display = "none";
        banner.classList.remove("hidden");
        banner.innerHTML = `
            <span><i class="ri-forbid-2-line"></i> You blocked this contact.</span>
            <button type="button" class="blocked-chat-unblock-link" onclick="openBlockContactModal('unblock')">Unblock</button>
        `;
    } else if (isBlockedByOther) {
        chatInputForm.style.display = "none";
        banner.classList.remove("hidden");
        banner.innerHTML = `
            <span><i class="ri-forbid-2-line"></i> You can no longer send messages to this contact.</span>
        `;
    } else {
        banner.classList.add("hidden");
        banner.innerHTML = "";
        chatInputForm.style.display = "";
    }
}

function openBlockContactModal(forceAction = null) {
    const activeType = window.activeChatType || sessionStorage.getItem("active_chat_type");
    const chatId = (activeType === "private" && window.activeChatId) ||
        sessionStorage.getItem("active_chat_id");

    if (!chatId || activeType !== "private") {
        showFlashMessage("No active private chat selected", "error");
        return;
    }

    const isCurrentlyBlocked = Boolean(
        window.currentChatBlockState &&
        String(window.currentChatBlockState.chatId) === String(chatId) &&
        window.currentChatBlockState.isBlockedByMe
    );

    pendingBlockContactChatId = chatId;
    pendingBlockAction = forceAction || (isCurrentlyBlocked ? "unblock" : "block");

    const contactName = document.getElementById("privateChatName")?.textContent?.trim() ||
        document.getElementById("chatHeader")?.textContent?.trim() ||
        sessionStorage.getItem("active_chat_partner_name") ||
        "this contact";

    const titleEl = document.getElementById("blockContactModalTitle");
    const confirmTextEl = document.getElementById("blockContactConfirmText");
    const confirmBtnEl = document.getElementById("confirmBlockContactBtn");

    if (pendingBlockAction === "unblock") {
        if (titleEl) titleEl.textContent = "Unblock Contact";
        if (confirmTextEl) {
            confirmTextEl.textContent = `Are you sure you want to unblock ${contactName}? You will be able to exchange messages again.`;
        }
        if (confirmBtnEl) {
            confirmBtnEl.textContent = "Unblock";
            confirmBtnEl.style.background = "#15803d";
        }
    } else {
        if (titleEl) titleEl.textContent = "Block Contact";
        if (confirmTextEl) {
            confirmTextEl.textContent = `Are you sure you want to block ${contactName}? Blocked contacts will no longer be able to send you messages.`;
        }
        if (confirmBtnEl) {
            confirmBtnEl.textContent = "Block";
            confirmBtnEl.style.background = "#dc2626";
        }
    }

    const modal = document.getElementById("blockContactModal");
    if (modal) {
        modal.classList.remove("hidden");
    } else {
        confirmBlockContact();
    }
}

function closeBlockContactModal() {
    const modal = document.getElementById("blockContactModal");
    if (modal) {
        modal.classList.add("hidden");
    }
    pendingBlockContactChatId = null;
}

async function confirmBlockContact() {
    const chatId = pendingBlockContactChatId ||
        (window.activeChatType === "private" ? window.activeChatId : null) ||
        sessionStorage.getItem("active_chat_id");
    const currentUserId = sessionStorage.getItem("user_id");
    const action = pendingBlockAction || "block";

    if (!chatId || !currentUserId) {
        closeBlockContactModal();
        showFlashMessage("Unable to update block status: missing chat or user session", "error");
        return;
    }

    try {
        const res = await fetch("/block_contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                user_id: currentUserId,
                action: action
            })
        });

        const data = await res.json();
        closeBlockContactModal();

        if (!res.ok || !data.success) {
            showFlashMessage(data.error || "Failed to update contact block status", "error");
            return;
        }

        const isBlockedByOther = window.currentChatBlockState &&
            String(window.currentChatBlockState.chatId) === String(chatId)
            ? Boolean(window.currentChatBlockState.isBlockedByOther)
            : false;

        updateChatBlockUI(chatId, "private", Boolean(data.is_blocked_by_me), isBlockedByOther);
        showFlashMessage(data.message || (data.is_blocked_by_me ? "Contact blocked" : "Contact unblocked"), "success");
    } catch (err) {
        console.error("Error blocking/unblocking contact:", err);
        closeBlockContactModal();
        showFlashMessage("Something went wrong while updating contact block status", "error");
    }
}

// Listen for real-time block/unblock events from either user
socket.on("contact_block_updated", (data) => {
    if (!data || !data.chat_id) return;
    const activeId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    const activeType = window.activeChatType || sessionStorage.getItem("active_chat_type");
    if (activeType !== "private" || String(activeId) !== String(data.chat_id)) return;

    const currentUserId = String(sessionStorage.getItem("user_id") || "");
    const blockedByList = Array.isArray(data.blocked_by) ? data.blocked_by.map(String) : [];
    const isBlockedByMe = blockedByList.includes(currentUserId);
    const isBlockedByOther = blockedByList.some(uid => uid !== currentUserId);

    updateChatBlockUI(data.chat_id, "private", isBlockedByMe, isBlockedByOther);
});

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO DISPLAY ALL GROUP MEMBERS ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO OPEN NEW GROUP MODAL STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

function openAddMemberModal() {
    const groupId = sessionStorage.getItem("active_group_id") || (window.activeChatType === "group" ? window.activeChatId : null);
    const groupName = sessionStorage.getItem("active_group_name") || document.getElementById("groupname")?.textContent?.trim() || document.getElementById("chatHeader")?.textContent?.trim();

    if (!groupId) {
        showFlashMessage("No active group selected!", "error");
        return;
    }

    document.getElementById("groupNameField").value = groupName || "";
    document.getElementById("newMemberModal").setAttribute("data-group-id", groupId);
    document.getElementById("newMemberModal").classList.remove("hidden");
}

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO OPEN NEW GROUP MODAL ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO ADD MEMBERS TO GROUP WHEN CREATING NEW GROUP STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->  

let selectedNewMembers = new Set(); // keeps track of selected members

function addNewGroupMember() {
    let query = document.getElementById("addSearchInput").value.trim();
    if (query.length < 2) {
        document.getElementById("addSearchResults").innerHTML = "";
        return;
    }

    fetch(`/search_users?query=${query}`)
        .then(response => response.json())
        .then(data => {
            console.log("Search results:", data);
            let searchResults = document.getElementById("addSearchResults");
            searchResults.innerHTML = "";

            if (data.length === 0) {
                searchResults.innerHTML = "<p>No users found</p>";
                return;
            }

            data.forEach(user => {
                let userItem = document.createElement("div");
                userItem.classList.add("search-item");

                let userImage = user.image_url || "/static/images/dsa-logo.png";

                userItem.innerHTML = `
                    <div class="group-search-user">
                        <div class="user-container">
                            <img src="${userImage}" alt="User Avatar" class="user-avatar">
                            <div class="user-details">
                                <p>${user.firstname} ${user.lastname} (${user.staffid})</p>
                            </div>
                        </div>
                        <div class="checkbox-container">
                            <input type="checkbox" value="${user.id}" 
                                onchange="addToggleMemberSelection('${user.id}', this)">
                        </div>
                    </div>
                `;


                searchResults.appendChild(userItem);
            });
        })
        .catch(error => console.error("Error searching users:", error));
}

function addToggleMemberSelection(userId, checkbox) {
    if (checkbox.checked) {
        selectedNewMembers.add(userId);
    } else {
        selectedNewMembers.delete(userId);
    }

}



function closeAddNewMemberModal() {
    const modal = document.getElementById("newMemberModal");
    if (modal) {
        modal.classList.add("hidden"); // matches your `showCreateGroup`
    }

    // Reset inputs
    document.getElementById("groupName").value = "";
    document.getElementById("addSearchInput").value = "";
    document.getElementById("addSearchResults").innerHTML = "";

    selectedMembers.clear();
}


// Close modal when clicking outside content
document.getElementById("newMemberModal").addEventListener("click", function (e) {
    if (e.target === this) { // only when clicking the background, not content
        closeAddNewMemberModal();
    }
});
//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO ADD MEMBERS TO GROUP WHEN CREATING NEW GROUP ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO ADD NEW MEMBER TO GROUP STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

async function addNewMember() {
    const modal = document.getElementById("newMemberModal");
    const groupId = modal.getAttribute("data-group-id");

    if (!groupId) {
        showFlashMessage("No group selected", "error");
        return;
    }

    if (selectedNewMembers.size === 0) {
        showFlashMessage("Please select at least one user", "error");
        return;
    }

    try {
        const res = await fetch("/add_group_member", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                user_ids: Array.from(selectedNewMembers), // Send user IDs directly
                user_id: sessionStorage.getItem("user_id")
            })
        });

        const data = await res.json();
        if (res.ok) {
            if (data.all_added) {
                showFlashMessage('Members added successfully', 'success');
            } else if (data.all_skipped) {
                const reasons = [...new Set(data.skipped.map(s => s.reason))];
                showFlashMessage(reasons.join(', '), 'error');
            } else if (data.partial_success) {
                showFlashMessage('Members added successfully', 'success');
                const reasons = [...new Set(data.skipped.map(s => s.reason))];
                showFlashMessage('Some could not be added: ' + reasons.join(', '), 'error');
            }

            closeAddNewMemberModal();
            getGroupMembers(groupId);
            selectedNewMembers.clear();
        }

        else {
            showFlashMessage(data.error, 'error')
        }
    } catch (err) {
        showFlashMessage('Something went wrong', 'error')
    }
}


// Function to show flash message
function showFlashMessage(message, type) {
    const flashContainer = document.getElementById('flash-messages');

    // Create the flash message element
    const flashMessage = document.createElement('div');
    flashMessage.classList.add('flash', type);
    flashMessage.textContent = message;

    // Append it to the container
    flashContainer.appendChild(flashMessage);

    // Fade out and remove the flash message after 5 seconds
    setTimeout(() => {
        flashMessage.style.opacity = '0';
        setTimeout(() => flashMessage.remove(), 500);
    }, 5000);
}

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO ADD NEW MEMBER TO GROUP ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO LOAD OVERVIEW DETAILS STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

// FOR OVERVIEW TAB - EDIT GROUP DESCRIPTION

async function loadOverviewDetails(chatId, chatType, userId) {
    fetch(`/get_chat_details?chat_type=${chatType}&chat_id=${chatId}&user_id=${userId}`)
        .then(response => response.json())
        .then(data => {
            if (data.type === "group") {
                document.getElementById("groupSection").style.display = "block";
                document.getElementById("privateSection").style.display = "none";

                document.getElementById("groupAvatar").src = data.image || "/static/images/dsa-logo.png";
                document.getElementById("groupname").textContent = data.name;
                document.getElementById("dateCreated").textContent = `Created on: ${data.timestamp}`;
                document.getElementById("group-description").textContent = data.description || "No description";

                const isAdmin = Boolean(data.is_admin);
                const editBtn = document.getElementById("editGroupInfoBtn");
                const avatarBtn = document.getElementById("changeGroupAvatarBtn");
                const editForm = document.getElementById("editGroupInfoForm");
                if (editBtn) editBtn.classList.toggle("hidden", !isAdmin);
                if (avatarBtn) avatarBtn.classList.toggle("hidden", !isAdmin);
                if (editForm) editForm.classList.add("hidden");

                window.currentGroupDetails = {
                    id: data.id || chatId,
                    name: data.name || "",
                    description: data.description || "",
                    image: data.image || "/static/images/dsa-logo.png",
                    is_admin: isAdmin
                };

                updateChatBlockUI(chatId, "group", false, false);
            } else if (data.type === "private") {
                document.getElementById("groupSection").style.display = "none";
                document.getElementById("privateSection").style.display = "block";

                document.getElementById("userAvatar-private").src = data.with_user.image || "/static/images/default-profile.png";
                document.getElementById("privateChatName").textContent =
                    `${data.with_user.firstname || ""} ${data.with_user.lastname || ""}`;
                document.getElementById("privateStaffid").textContent =
                    data.with_user.staffid || "N/A";
                updateChatBlockUI(
                    chatId,
                    "private",
                    Boolean(data.is_blocked_by_me),
                    Boolean(data.is_blocked_by_other)
                );
            }
        })
        .catch(error => console.error("Error fetching chat details:", error));
}


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO LOAD OVERVIEW DETAILS ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO LOAD ALL MEDIA IN A CHAT STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->

// FOR MEMBER TAB - EDIT GROUP DESCRIPTION
let mediaItems = []; // global variable

async function loadMedia(chatId, chatType) {
    let url = `/get_media?chat_id=${chatId}&chat_type=${chatType}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        const container = document.querySelector(".media-container");
        container.innerHTML = "";

        mediaItems = data; // save all media items globally

        if (Array.isArray(data) && data.length > 0) {
            data.forEach((m, index) => {
                const fileUrl = `/file/${m.file_id}`;
                let mediaEl = "";

                if (m.message_type === "image") {
                    mediaEl = `
                        <div class="media-item-wrapper">
                            <img src="${fileUrl}" alt="${m.file_name}" class="media-item" 
                                 onclick="openMediaModal(${index})"/>
                        </div>
                    `;
                } else if (m.message_type === "video") {
                    mediaEl = `
                        <div class="media-item-wrapper">
                            <video class="media-item" onclick="openMediaModal(${index})">
                                <source src="${fileUrl}" type="video/mp4">
                            </video>
                        </div>
                    `;
                } else if (m.message_type === "audio") {
                    mediaEl = `
                        <div class="media-item-wrapper" onclick="openMediaModal(${index})">
                            <audio controls class="media-item">
                                <source src="${fileUrl}" type="audio/mpeg">
                            </audio>
                        </div>
                    `;
                }

                container.innerHTML += mediaEl;
            });
        } else {
            container.innerHTML = "<p class='no-media'>No media found in this chat</p>";
        }
    } catch (err) {
        console.error("Error loading media:", err);
        document.querySelector(".media-container").innerHTML =
            `<p class='error-message'>Error loading media: ${err.message}</p>`;
    }
}


// ==========================================================================================================================
//                                            OPEN FULLSCREEN OF MEDIA WHEN CLICKED 
// ==========================================================================================================================


let currentMediaIndex = 0;

function openMediaModal(index) {
    currentMediaIndex = index;
    const item = mediaItems[index];
    const fileUrl = `/file/${item.file_id}`;
    const type = item.message_type;
    const name = item.file_name;

    let mediaContent = "";
    if (type === "image") {
        mediaContent = `<img src="${fileUrl}" alt="${name}" class="modal-image">`;
    } else if (type === "video") {
        mediaContent = `
            <video controls autoplay class="modal-video">
                <source src="${fileUrl}" type="video/mp4">
            </video>
        `;
    } else if (type === "audio") {
        mediaContent = `
            <audio controls autoplay class="modal-audio">
                <source src="${fileUrl}" type="audio/mpeg">
            </audio>
        `;
    }

    const modalHtml = `
        <div class="image-modal" onclick="closeMediaModal(event)">
            <div class="modal-content-container">
                <span class="close-btn" onclick="closeMediaModal()">&times;</span>
                <span class="prev-btn" onclick="showPrevMedia(event)">&#10094;</span>
                <div class="modal-content-media">
                    ${mediaContent}
                    <div class="modal-actions">
                        <a href="${fileUrl}" download="${name}" class="modal-download-btn">Save as</a>
                    </div>
                </div>
                <span class="next-btn" onclick="showNextMedia(event)">&#10095;</span>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHtml);
    document.body.style.overflow = "hidden";
}

function showPrevMedia(event) {
    event.stopPropagation();
    currentMediaIndex = (currentMediaIndex - 1 + mediaItems.length) % mediaItems.length;
    closeMediaModal();
    openMediaModal(currentMediaIndex);
}

function showNextMedia(event) {
    event.stopPropagation();
    currentMediaIndex = (currentMediaIndex + 1) % mediaItems.length;
    closeMediaModal();
    openMediaModal(currentMediaIndex);
}


function closeMediaModal(event) {
    // Prevent closing if clicking inside the content
    if (event && event.target.closest(".modal-content-media")) return;

    const modal = document.querySelector(".image-modal");
    if (modal) {
        modal.remove();
        document.body.style.overflow = "";
    }
}

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TOLOAD ALL MEDIA IN A CHAT ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->


//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCTION TO LOAD ALL FILE IN A CHAT STARTS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->
// FOR FILE TAB - EDIT GROUP DESCRIPTION
async function loadFiles(chatId, chatType) {
    let url = `/get_files?chat_id=${chatId}&chat_type=${chatType}`;
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

        const data = await res.json();
        const container = document.querySelector(".file-container");
        container.innerHTML = "";

        if (Array.isArray(data) && data.length > 0) {
            data.forEach(m => {
                const fileUrl = `/file/${m.file_id}`;
                const fileName = m.file_name || "Unnamed File";
                const ext = fileName.split(".").pop().toLowerCase();

                // define icons
                const iconPaths = {
                    'pdf': '/static/images/pdf-icon.png',
                    'doc': '/static/images/doc-icon.png',
                    'docx': '/static/images/docx-icon.png',
                    'xls': '/static/images/xls-icon.png',
                    'xlsx': '/static/images/xls-icon.png',
                    'ppt': '/static/images/ppt-icon.png',
                    'pptx': '/static/images/pptx-icon.png',
                    'zip': '/static/images/zip-icon.png',
                };

                // fallback generic icon
                const icon = iconPaths[ext] || '';

                let fileEl = `
                    <div class="file-item-wrapper">
                        <div class="file-icon">
                            <img src="${icon}" alt="${ext} icon" class="file-icon-img">
                        </div>
                        <div class="file-info-main">
                            <a href="${fileUrl}" download="${fileName}" class="file-link">
                                ${fileName}
                            </a>
                        </div>
                    </div>
                `;
                container.innerHTML += fileEl;
            });
        } else {
            container.innerHTML = "<p class='no-files'>No files found in this chat</p>";
        }
    } catch (err) {
        console.error("Error loading files:", err);
        document.querySelector(".file-container").innerHTML =
            `<p class='error-message'>Error loading files: ${err.message}</p>`;
    }
}

//<!-- xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
//# ================================================ FUNCION TO LOAD ALL FILE IN A CHAT ENDS HERE ================================================
//# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx -->


// ==========================================================================================================================
// 1. CLICKABLE LINKS IN MESSAGES & "LINKS" SECTION IN CONTACT/GROUP INFO DRAWER
// ==========================================================================================================================

function linkifyMessageText(rawText) {
    if (!rawText) return "";
    const escaped = escapeHtml(String(rawText));
    const urlPattern = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
    return escaped.replace(urlPattern, function (match) {
        let cleanUrl = match;
        let trailing = "";
        while (/[.,;:!?)]$/.test(cleanUrl)) {
            trailing = cleanUrl.slice(-1) + trailing;
            cleanUrl = cleanUrl.slice(0, -1);
        }
        const href = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-message-link">${cleanUrl}</a>${trailing}`;
    });
}

async function loadLinks(chatId, chatType) {
    const container = document.querySelector("#links .links-container");
    if (!container || !chatId || !chatType) return;
    const currentUserId = sessionStorage.getItem("user_id") || "";

    try {
        const res = await fetch(`/get_links?chat_id=${encodeURIComponent(chatId)}&chat_type=${encodeURIComponent(chatType)}&user_id=${encodeURIComponent(currentUserId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const links = await res.json();

        container.innerHTML = "";
        if (!Array.isArray(links) || links.length === 0) {
            container.innerHTML = "<p class='no-links'>No links found in this chat</p>";
            return;
        }

        links.forEach(item => {
            const card = document.createElement("a");
            card.href = item.href || item.url;
            card.target = "_blank";
            card.rel = "noopener noreferrer";
            card.className = "link-item-card";

            const timeLabel = item.timestamp ? formatTimestamp(item.timestamp) : "";
            card.innerHTML = `
                <div class="link-item-icon"><i class="ri-links-line"></i></div>
                <div class="link-item-details">
                    <span class="link-item-url">${escapeHtml(item.url)}</span>
                    ${timeLabel ? `<span class="link-item-time">${escapeHtml(timeLabel)}</span>` : ""}
                </div>
            `;
            container.appendChild(card);
        });
    } catch (err) {
        console.error("Error loading links:", err);
        container.innerHTML = "<p class='no-links'>No links found</p>";
    }
}


// ==========================================================================================================================
// 2. ONLINE / OFFLINE PRESENCE & "LAST SEEN" + REAL-TIME "TYPING..." INDICATOR
// ==========================================================================================================================

window.userPresenceCache = window.userPresenceCache || {};
window.activeHeaderStatusText = "";
window.typingTimeoutsByChat = window.typingTimeoutsByChat || {};
let localTypingTimeout = null;
let isLocalUserTyping = false;

function formatLastSeenStatus(lastSeenIso) {
    if (!lastSeenIso) return "Offline";
    const dt = new Date(lastSeenIso);
    if (isNaN(dt.getTime())) return "Offline";

    const now = new Date();
    const isToday = dt.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = dt.toDateString() === yesterday.toDateString();
    const timeStr = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

    if (isToday) {
        return `last seen today at ${timeStr}`;
    } else if (isYesterday) {
        return `last seen yesterday at ${timeStr}`;
    }
    const dateStr = dt.toLocaleDateString([], { day: "numeric", month: "short" });
    return `last seen ${dateStr} at ${timeStr}`;
}

function updateChatHeaderStatusFromPresence(isOnline, lastSeenIso) {
    const statusEl = document.getElementById("chatHeaderStatus");
    if (!statusEl) return;

    const text = isOnline ? "Online" : formatLastSeenStatus(lastSeenIso);
    window.activeHeaderStatusText = text;
    window.activeHeaderIsOnline = Boolean(isOnline);

    if (!statusEl.classList.contains("status-typing")) {
        statusEl.textContent = text;
        statusEl.classList.toggle("status-online", Boolean(isOnline));
    }
}

function updateGroupHeaderStatus(membersCount, onlineCount) {
    const statusEl = document.getElementById("chatHeaderStatus");
    if (!statusEl) return;

    let text = "";
    if (membersCount > 0) {
        text = `${membersCount} member${membersCount === 1 ? "" : "s"}`;
        if (onlineCount > 0) {
            text += `, ${onlineCount} online`;
        }
    }
    window.activeHeaderStatusText = text;
    window.activeHeaderIsOnline = false;

    if (!statusEl.classList.contains("status-typing")) {
        statusEl.textContent = text;
        statusEl.classList.remove("status-online");
    }
}

socket.on("user_presence_update", (data) => {
    if (!data || !data.user_id) return;
    const uid = String(data.user_id);
    const isOnline = Boolean(data.is_online);
    const lastSeen = data.last_seen || null;

    window.userPresenceCache[uid] = { is_online: isOnline, last_seen: lastSeen };

    // Update sidebar dot for any private chat with this user
    document.querySelectorAll(`li.chat-item-list[data-chat-type="private"][data-user-id="${uid}"]`).forEach(li => {
        li.dataset.isOnline = isOnline ? "true" : "false";
        if (lastSeen) li.dataset.lastSeen = lastSeen;
        const dot = li.querySelector(".sidebar-online-dot");
        if (dot) {
            dot.style.display = isOnline ? "" : "none";
        }
    });

    // If this user is the currently open private chat partner, update the top header status
    const activeType = window.activeChatType || sessionStorage.getItem("active_chat_type");
    const activePartnerId = sessionStorage.getItem("active_chat_user_id");
    if (activeType === "private" && String(activePartnerId) === uid) {
        updateChatHeaderStatusFromPresence(isOnline, lastSeen);
    }
});

function notifyLocalStopTyping() {
    if (localTypingTimeout) {
        clearTimeout(localTypingTimeout);
        localTypingTimeout = null;
    }
    if (!isLocalUserTyping) return;
    isLocalUserTyping = false;

    const chatId = window.activeChatId || sessionStorage.getItem("active_chat_id");
    const chatType = window.activeChatType || sessionStorage.getItem("active_chat_type");
    const userId = sessionStorage.getItem("user_id");
    if (chatId && chatType && userId) {
        socket.emit("stop_typing", {
            chat_id: chatId,
            chat_type: chatType,
            user_id: userId
        });
    }
}

document.addEventListener("DOMContentLoaded", function () {
    const msgInput = document.getElementById("messageInput");
    if (msgInput) {
        msgInput.addEventListener("input", function () {
            const chatId = window.activeChatId || sessionStorage.getItem("active_chat_id");
            const chatType = window.activeChatType || sessionStorage.getItem("active_chat_type");
            const userId = sessionStorage.getItem("user_id");
            if (!chatId || !chatType || !userId) return;

            if (!this.value.trim()) {
                notifyLocalStopTyping();
                return;
            }

            if (!isLocalUserTyping) {
                isLocalUserTyping = true;
                socket.emit("typing", {
                    chat_id: chatId,
                    chat_type: chatType,
                    user_id: userId
                });
            }

            if (localTypingTimeout) clearTimeout(localTypingTimeout);
            localTypingTimeout = setTimeout(() => {
                notifyLocalStopTyping();
            }, 2200);
        });
    }
});

function clearRemoteTypingIndicator(chatId) {
    const cid = String(chatId || "");
    if (!cid) return;

    if (window.typingTimeoutsByChat[cid]) {
        clearTimeout(window.typingTimeoutsByChat[cid]);
        delete window.typingTimeoutsByChat[cid];
    }

    // Restore sidebar preview text
    document.querySelectorAll(`li.chat-item-list[data-chat-id="${cid}"]`).forEach(li => {
        const previewEl = li.querySelector(".content-message-text");
        if (previewEl && previewEl.classList.contains("sidebar-typing-preview")) {
            previewEl.classList.remove("sidebar-typing-preview");
            previewEl.textContent = li.dataset.lastPreviewText || formatMessagePreview(li.dataset.lastMessage || "", "text");
        }
    });

    // Restore header status if this is the active chat
    const activeId = String(window.activeChatId || sessionStorage.getItem("active_chat_id") || "");
    if (activeId === cid) {
        const statusEl = document.getElementById("chatHeaderStatus");
        if (statusEl) {
            statusEl.classList.remove("status-typing");
            statusEl.textContent = window.activeHeaderStatusText || "";
            statusEl.classList.toggle("status-online", Boolean(window.activeHeaderIsOnline));
        }
    }
}

socket.on("user_typing", (data) => {
    if (!data || !data.chat_id) return;
    const currentUserId = String(sessionStorage.getItem("user_id") || "");
    if (String(data.user_id) === currentUserId) return;

    const cid = String(data.chat_id);
    const isGroup = data.chat_type === "group";
    const typingText = isGroup ? `${data.user_name || "Someone"} is typing...` : "typing...";

    // Update sidebar chat item preview
    document.querySelectorAll(`li.chat-item-list[data-chat-id="${cid}"]`).forEach(li => {
        const previewEl = li.querySelector(".content-message-text");
        if (previewEl) {
            if (!previewEl.classList.contains("sidebar-typing-preview")) {
                li.dataset.lastPreviewText = previewEl.textContent;
            }
            previewEl.classList.add("sidebar-typing-preview");
            previewEl.textContent = typingText;
        }
    });

    // Update active chat header subtitle
    const activeId = String(window.activeChatId || sessionStorage.getItem("active_chat_id") || "");
    if (activeId === cid) {
        const statusEl = document.getElementById("chatHeaderStatus");
        if (statusEl) {
            statusEl.classList.remove("status-online");
            statusEl.classList.add("status-typing");
            statusEl.textContent = typingText;
        }
    }

    if (window.typingTimeoutsByChat[cid]) {
        clearTimeout(window.typingTimeoutsByChat[cid]);
    }
    window.typingTimeoutsByChat[cid] = setTimeout(() => {
        clearRemoteTypingIndicator(cid);
    }, 3000);
});

socket.on("user_stop_typing", (data) => {
    if (!data || !data.chat_id) return;
    clearRemoteTypingIndicator(data.chat_id);
});


// ==========================================================================================================================
// 3. IN-CHAT MESSAGE SEARCH
// ==========================================================================================================================

let inChatSearchMatches = [];
let inChatSearchCurrentIndex = -1;

function toggleInChatSearch() {
    const bar = document.getElementById("inChatSearchBar");
    const input = document.getElementById("inChatSearchInput");
    if (!bar) return;

    if (bar.classList.contains("hidden")) {
        bar.classList.remove("hidden");
        if (input) {
            input.focus();
            input.select();
        }
    } else {
        closeInChatSearch();
    }
}

function clearInChatSearchHighlights() {
    document.querySelectorAll("#conversation-main .message-wrapper").forEach(wrapper => {
        wrapper.classList.remove("in-chat-search-match", "in-chat-search-active-match");
        const bodySpan = wrapper.querySelector(".message-body-content");
        if (bodySpan && wrapper.dataset.rawMessage !== undefined && wrapper.dataset.rawMessage !== "") {
            bodySpan.innerHTML = linkifyMessageText(wrapper.dataset.rawMessage);
        }
    });
    inChatSearchMatches = [];
    inChatSearchCurrentIndex = -1;
}

function runInChatSearch(query) {
    clearInChatSearchHighlights();
    const countEl = document.getElementById("inChatSearchCount");
    const cleanQuery = String(query || "").trim();

    if (!cleanQuery) {
        if (countEl) countEl.textContent = "0/0";
        return;
    }

    const qLower = cleanQuery.toLowerCase();
    const wrappers = Array.from(document.querySelectorAll("#conversation-main .message-wrapper"));

    wrappers.forEach(wrapper => {
        if (wrapper.classList.contains("deleted")) return;
        const rawText = wrapper.dataset.rawMessage || wrapper.querySelector(".message-text")?.textContent || "";
        if (rawText && rawText.toLowerCase().includes(qLower)) {
            wrapper.classList.add("in-chat-search-match");
            inChatSearchMatches.push(wrapper);
        }
    });

    if (inChatSearchMatches.length === 0) {
        if (countEl) countEl.textContent = "0/0";
        return;
    }

    // Jump to newest matching message first
    inChatSearchCurrentIndex = inChatSearchMatches.length - 1;
    highlightActiveInChatMatch();
}

function highlightActiveInChatMatch() {
    const countEl = document.getElementById("inChatSearchCount");
    if (inChatSearchMatches.length === 0 || inChatSearchCurrentIndex < 0) {
        if (countEl) countEl.textContent = "0/0";
        return;
    }

    inChatSearchMatches.forEach((el, idx) => {
        el.classList.toggle("in-chat-search-active-match", idx === inChatSearchCurrentIndex);
    });

    const activeEl = inChatSearchMatches[inChatSearchCurrentIndex];
    if (activeEl) {
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (countEl) {
        countEl.textContent = `${inChatSearchCurrentIndex + 1}/${inChatSearchMatches.length}`;
    }
}

function navigateInChatSearch(direction) {
    if (inChatSearchMatches.length === 0) return;
    inChatSearchCurrentIndex = (inChatSearchCurrentIndex + direction + inChatSearchMatches.length) % inChatSearchMatches.length;
    highlightActiveInChatMatch();
}

function closeInChatSearch() {
    const bar = document.getElementById("inChatSearchBar");
    const input = document.getElementById("inChatSearchInput");
    const countEl = document.getElementById("inChatSearchCount");
    if (bar) bar.classList.add("hidden");
    if (input) input.value = "";
    if (countEl) countEl.textContent = "0/0";
    clearInChatSearchHighlights();
}

document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("inChatSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", function () {
            runInChatSearch(this.value);
        });
        searchInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                navigateInChatSearch(e.shiftKey ? 1 : -1);
            } else if (e.key === "Escape") {
                closeInChatSearch();
            }
        });
    }
});


// ==========================================================================================================================
// 4. EMOJI PICKER
// ==========================================================================================================================

const COMMON_CHAT_EMOJIS = [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍",
    "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎",
    "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "😣", "😖", "😫", "😩", "🥺", "😢",
    "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓",
    "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😴", "🤤", "😪",
    "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "🤙", "👏", "🙌", "👐", "🤲", "🙏", "🤝",
    "💪", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💯", "💢", "💥", "💫", "💦",
    "🎉", "🎊", "🔥", "✨", "⭐", "🌟", "✅", "❌", "⚠️", "🚀", "💡", "📌", "📎", "🫡"
];

function initEmojiPicker() {
    const popover = document.getElementById("emojiPickerPopover");
    if (!popover || popover.dataset.initialized === "true") return;

    popover.innerHTML = `
        <div class="emoji-picker-header">Emojis</div>
        <div class="emoji-picker-grid">
            ${COMMON_CHAT_EMOJIS.map(emoji => `<button type="button" class="emoji-picker-item" data-emoji="${emoji}">${emoji}</button>`).join("")}
        </div>
    `;

    popover.addEventListener("click", function (e) {
        const btn = e.target.closest(".emoji-picker-item");
        if (!btn) return;
        e.stopPropagation();
        insertEmojiAtCursor(btn.dataset.emoji);
    });

    popover.dataset.initialized = "true";
}

function toggleEmojiPicker(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    initEmojiPicker();
    const popover = document.getElementById("emojiPickerPopover");
    if (!popover) return;
    popover.classList.toggle("hidden");
}

function insertEmojiAtCursor(emoji) {
    const input = document.getElementById("messageInput");
    if (!input || !emoji) return;

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const text = input.value;
    input.value = text.slice(0, start) + emoji + text.slice(end);
    input.focus();
    const nextPos = start + emoji.length;
    input.setSelectionRange(nextPos, nextPos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

document.addEventListener("click", function (e) {
    const popover = document.getElementById("emojiPickerPopover");
    if (!popover || popover.classList.contains("hidden")) return;
    if (!e.target.closest(".emoji-picker-wrapper")) {
        popover.classList.add("hidden");
    }
});


// ==========================================================================================================================
// 5. EDIT SENT MESSAGES
// ==========================================================================================================================

window.editingMessageId = null;

document.addEventListener("click", function (e) {
    const editBtn = e.target.closest(".edit-message");
    if (!editBtn) return;
    e.preventDefault();
    const messageId = editBtn.dataset.messageId;
    const dropdown = editBtn.closest(".conversation-item-dropdown");
    if (dropdown) dropdown.classList.remove("active");
    startEditMessage(messageId);
});

function startEditMessage(messageId) {
    if (!messageId) return;
    const wrapper = document.querySelector(`.message-wrapper[data-message-id="${messageId}"]`);
    const cached = window.messageCache ? window.messageCache[messageId] : null;
    const rawText = (wrapper && wrapper.dataset.rawMessage) || (cached && cached.message) || "";

    if (!rawText) {
        showFlashMessage("Only text messages can be edited", "error");
        return;
    }

    // Cancel any active reply preview first
    if (typeof cancelReply === "function") {
        const replyPreview = document.getElementById("replyPreview");
        if (replyPreview) replyPreview.style.display = "none";
        const replyField = document.getElementById("reply_to_message_id");
        if (replyField) replyField.value = "";
    }

    window.editingMessageId = String(messageId);
    const banner = document.getElementById("editMessageBanner");
    const previewTextEl = document.getElementById("editMessagePreviewText");
    const input = document.getElementById("messageInput");

    if (previewTextEl) previewTextEl.textContent = rawText;
    if (banner) banner.style.display = "flex";
    if (input) {
        input.value = rawText;
        input.focus();
        input.setSelectionRange(rawText.length, rawText.length);
    }
}

function cancelEditMessage() {
    window.editingMessageId = null;
    const banner = document.getElementById("editMessageBanner");
    const previewTextEl = document.getElementById("editMessagePreviewText");
    const input = document.getElementById("messageInput");

    if (banner) banner.style.display = "none";
    if (previewTextEl) previewTextEl.textContent = "";
    if (input) input.value = "";
}

async function submitEditMessage(messageId, newText) {
    const cleanText = String(newText || "").trim();
    if (!messageId || !cleanText) return;

    try {
        const res = await fetch("/edit_message", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message_id: messageId,
                new_message: cleanText,
                user_id: sessionStorage.getItem("user_id")
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            showFlashMessage(data.error || "Failed to edit message", "error");
            return;
        }
        cancelEditMessage();
        applyEditedMessageToDOM(data);
    } catch (err) {
        console.error("Error editing message:", err);
        showFlashMessage("Error editing message", "error");
    }
}

function applyEditedMessageToDOM(data) {
    if (!data || !data.message_id) return;
    const msgId = String(data.message_id);
    const newText = String(data.new_message || "");

    if (window.messageCache && window.messageCache[msgId]) {
        window.messageCache[msgId].message = newText;
        window.messageCache[msgId].edited = true;
    }

    const wrapper = document.querySelector(`.message-wrapper[data-message-id="${msgId}"]`);
    if (wrapper) {
        wrapper.dataset.rawMessage = newText;
        const bodySpan = wrapper.querySelector(".message-body-content");
        if (bodySpan) {
            bodySpan.innerHTML = linkifyMessageText(newText);
        } else {
            const p = wrapper.querySelector(".message-text");
            if (p) p.innerHTML = linkifyMessageText(newText);
        }
        const editedTag = wrapper.querySelector(".edited-message-tag");
        if (editedTag) {
            editedTag.textContent = "(edited)";
        }
    }
}

socket.on("message_edited", (data) => {
    applyEditedMessageToDOM(data);
});


// ==========================================================================================================================
// 6. VOICE NOTE RECORDING BUTTON (MediaRecorder)
// ==========================================================================================================================

let voiceMediaRecorder = null;
let voiceAudioChunks = [];
let voiceRecordingStream = null;
let voiceRecordTimerInterval = null;
let voiceRecordStartTime = 0;
let voiceShouldSendOnStop = false;

function formatVoiceTimer(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

async function startVoiceRecording() {
    const chatType = cleanTemplateVar(window.activeChatType) || cleanTemplateVar(sessionStorage.getItem("active_chat_type"));
    const activeChatId = cleanTemplateVar(window.activeChatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
    if (!chatType || !activeChatId) {
        showFlashMessage("Please select a chat first", "error");
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showFlashMessage("Voice recording is not supported in this browser", "error");
        return;
    }

    try {
        voiceRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceAudioChunks = [];
        voiceShouldSendOnStop = false;

        let mimeType = "";
        if (window.MediaRecorder && typeof MediaRecorder.isTypeSupported === "function") {
            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
                mimeType = "audio/webm;codecs=opus";
            } else if (MediaRecorder.isTypeSupported("audio/webm")) {
                mimeType = "audio/webm";
            } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
                mimeType = "audio/ogg;codecs=opus";
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                mimeType = "audio/mp4";
            }
        }

        voiceMediaRecorder = mimeType
            ? new MediaRecorder(voiceRecordingStream, { mimeType })
            : new MediaRecorder(voiceRecordingStream);

        voiceMediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                voiceAudioChunks.push(event.data);
            }
        };

        voiceMediaRecorder.onstop = async () => {
            stopVoiceStreamTracks();
            if (!voiceShouldSendOnStop || voiceAudioChunks.length === 0) {
                voiceAudioChunks = [];
                return;
            }
            const recordedMime = voiceMediaRecorder.mimeType || "audio/webm";
            let ext = "webm";
            if (recordedMime.includes("ogg")) ext = "ogg";
            else if (recordedMime.includes("mp4") || recordedMime.includes("aac")) ext = "m4a";
            else if (recordedMime.includes("wav")) ext = "wav";

            const audioBlob = new Blob(voiceAudioChunks, { type: recordedMime });
            voiceAudioChunks = [];
            await uploadAndSendVoiceNote(audioBlob, ext);
        };

        voiceMediaRecorder.start();
        voiceRecordStartTime = Date.now();
        toggleVoiceRecordingUI(true);

        const timerEl = document.getElementById("voiceRecordTimer");
        if (timerEl) timerEl.textContent = "0:00";
        if (voiceRecordTimerInterval) clearInterval(voiceRecordTimerInterval);
        voiceRecordTimerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - voiceRecordStartTime) / 1000);
            if (timerEl) timerEl.textContent = formatVoiceTimer(elapsed);
        }, 500);
    } catch (err) {
        console.error("Microphone access error:", err);
        showFlashMessage("Could not access microphone. Please allow microphone permission.", "error");
        stopVoiceStreamTracks();
        toggleVoiceRecordingUI(false);
    }
}

function stopVoiceStreamTracks() {
    if (voiceRecordTimerInterval) {
        clearInterval(voiceRecordTimerInterval);
        voiceRecordTimerInterval = null;
    }
    if (voiceRecordingStream) {
        voiceRecordingStream.getTracks().forEach(track => track.stop());
        voiceRecordingStream = null;
    }
}

function toggleVoiceRecordingUI(isRecording) {
    const formGroup = document.getElementById("conversationFormGroup");
    const sendBtn = document.getElementById("sendButton");
    const attachBtn = document.getElementById("attachFileIcon");
    const emojiWrapper = document.querySelector(".emoji-picker-wrapper");
    const recordBar = document.getElementById("voiceRecordingBar");

    if (formGroup) formGroup.style.display = isRecording ? "none" : "";
    if (sendBtn) sendBtn.style.display = isRecording ? "none" : "";
    if (attachBtn) attachBtn.style.display = isRecording ? "none" : "";
    if (emojiWrapper) emojiWrapper.style.display = isRecording ? "none" : "";
    if (recordBar) recordBar.classList.toggle("hidden", !isRecording);
}

function cancelVoiceRecording() {
    voiceShouldSendOnStop = false;
    if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
        voiceMediaRecorder.stop();
    } else {
        stopVoiceStreamTracks();
    }
    toggleVoiceRecordingUI(false);
}

function finishAndSendVoiceRecording() {
    voiceShouldSendOnStop = true;
    if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
        voiceMediaRecorder.stop();
    }
    toggleVoiceRecordingUI(false);
}

async function uploadAndSendVoiceNote(audioBlob, ext = "webm") {
    const chatType = cleanTemplateVar(window.activeChatType) || cleanTemplateVar(sessionStorage.getItem("active_chat_type"));
    const activeChatId = cleanTemplateVar(window.activeChatId) || cleanTemplateVar(sessionStorage.getItem("active_chat_id"));
    const userId = sessionStorage.getItem("user_id");
    const senderName = `${sessionStorage.getItem("firstname") || ""} ${sessionStorage.getItem("lastname") || ""}`.trim();

    if (!chatType || !activeChatId || !userId) return;

    const fileName = `voice_note_${Date.now()}.${ext}`;
    const fileObj = new File([audioBlob], fileName, { type: audioBlob.type || `audio/${ext}` });

    try {
        const formData = new FormData();
        formData.append("file", fileObj);

        const uploadRes = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
            showFlashMessage(uploadData.error || "Failed to upload voice note", "error");
            return;
        }

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const messageData = {
            temp_id: tempId,
            user_id: userId,
            [chatType === "private" ? "private_chat_id" : "group_id"]: activeChatId,
            message: null,
            message_type: "audio",
            file_id: uploadData.file_id,
            file_name: uploadData.file_name || fileName,
            timestamp: new Date().toISOString(),
            sender: senderName,
            reply_to_message_id: document.getElementById("reply_to_message_id")?.value || null
        };

        await displayMessage({ ...messageData, id: tempId, status: "sent" }, chatType);

        const previewText = formatMessagePreview(null, "audio", messageData.file_name);
        moveChatToTop(activeChatId, chatType, sessionStorage.getItem("active_chat_user_id"));
        updateChatPreview(activeChatId, chatType, previewText, messageData.timestamp, false);

        socket.emit("send_message", messageData, async (ack) => {
            if (ack && ack.success && ack.message) {
                await displayMessage(ack.message, chatType);
            } else if (ack && !ack.success) {
                showFlashMessage(ack.error || "Failed to send voice note", "error");
            }
        });
    } catch (err) {
        console.error("Error sending voice note:", err);
        showFlashMessage("Error sending voice note", "error");
    }
}


// ==========================================================================================================================
// 7. EDITING GROUP NAME, DESCRIPTION & GROUP AVATAR
// ==========================================================================================================================

function openEditGroupInfo() {
    const form = document.getElementById("editGroupInfoForm");
    const nameInput = document.getElementById("editGroupNameInput");
    const descInput = document.getElementById("editGroupDescInput");
    if (!form) return;

    const currentName = document.getElementById("groupname")?.textContent?.trim() || "";
    const currentDescRaw = document.getElementById("group-description")?.textContent?.trim() || "";
    const currentDesc = currentDescRaw === "No description" ? "" : currentDescRaw;

    if (nameInput) nameInput.value = currentName;
    if (descInput) descInput.value = currentDesc;
    form.classList.remove("hidden");
    if (nameInput) nameInput.focus();
}

function cancelEditGroupInfo() {
    const form = document.getElementById("editGroupInfoForm");
    if (form) form.classList.add("hidden");
}

async function saveGroupInfo() {
    const groupId = sessionStorage.getItem("active_group_id") || (window.activeChatType === "group" ? window.activeChatId : null);
    const nameInput = document.getElementById("editGroupNameInput");
    const descInput = document.getElementById("editGroupDescInput");
    const newName = (nameInput?.value || "").trim();
    const newDesc = (descInput?.value || "").trim();

    if (!groupId) {
        showFlashMessage("No active group selected", "error");
        return;
    }
    if (!newName) {
        showFlashMessage("Group name cannot be empty", "error");
        return;
    }

    try {
        const res = await fetch("/update_group_info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                name: newName,
                description: newDesc,
                user_id: sessionStorage.getItem("user_id")
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            showFlashMessage(data.error || "Failed to update group info", "error");
            return;
        }
        cancelEditGroupInfo();
        applyGroupInfoUpdate(data);
        showFlashMessage("Group info updated", "success");
    } catch (err) {
        console.error("Error updating group info:", err);
        showFlashMessage("Error updating group info", "error");
    }
}

function triggerGroupAvatarUpload() {
    const input = document.getElementById("groupAvatarInput");
    if (input) input.click();
}

async function handleGroupAvatarChange(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const groupId = sessionStorage.getItem("active_group_id") || (window.activeChatType === "group" ? window.activeChatId : null);
    if (!groupId) return;

    try {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch("/upload", {
            method: "POST",
            body: formData
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success || !uploadData.file_id) {
            showFlashMessage(uploadData.error || "Failed to upload group image", "error");
            return;
        }

        const res = await fetch("/update_group_info", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                group_id: groupId,
                image_file_id: uploadData.file_id,
                user_id: sessionStorage.getItem("user_id")
            })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            showFlashMessage(data.error || "Failed to update group avatar", "error");
            return;
        }
        applyGroupInfoUpdate(data);
        showFlashMessage("Group avatar updated", "success");
    } catch (err) {
        console.error("Error updating group avatar:", err);
        showFlashMessage("Error updating group avatar", "error");
    } finally {
        event.target.value = "";
    }
}

function applyGroupInfoUpdate(data) {
    if (!data || !data.group_id) return;
    const gid = String(data.group_id);

    // Update sidebar chat items
    document.querySelectorAll(`li.chat-item-list[data-chat-id="${gid}"]`).forEach(li => {
        if (data.name) {
            const nameEl = li.querySelector(".content-message-name");
            if (nameEl) nameEl.textContent = data.name;
        }
        if (data.image) {
            const imgEl = li.querySelector(".content-message-image");
            if (imgEl) imgEl.src = data.image;
        }
    });

    // Update active chat header and drawer if this group is open
    const activeId = String(window.activeChatId || sessionStorage.getItem("active_chat_id") || "");
    if (activeId === gid) {
        if (data.name || data.image) {
            updateChatHeader(
                data.name || document.getElementById("chatHeader")?.textContent || "Group",
                data.image || document.getElementById("chatHeaderImg")?.src
            );
        }
        const groupAvatarEl = document.getElementById("groupAvatar");
        const groupNameEl = document.getElementById("groupname");
        const groupDescEl = document.getElementById("group-description");

        if (groupAvatarEl && data.image) groupAvatarEl.src = data.image;
        if (groupNameEl && data.name) groupNameEl.textContent = data.name;
        if (groupDescEl && data.description !== undefined) {
            groupDescEl.textContent = data.description || "No description";
        }
    }
}

socket.on("group_info_updated", (data) => {
    applyGroupInfoUpdate(data);
});


// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =================================== CHAT AREA HEADER FUNCTIONALITY ENDS HERE ===================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

document.addEventListener("DOMContentLoaded", function () {
    loadChatList();
});

function loadChatList() {
    fetch("/get_chatlist")
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                renderChatList(data.chats); // <- you’ll define this
            }
        })
        .catch(err => console.error("Error loading chat list:", err));
}
