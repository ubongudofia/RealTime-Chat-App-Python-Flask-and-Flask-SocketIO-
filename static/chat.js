// ================================== CHAT SIDEBAR STRATS HERE (ASIDE) =================================
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

// ================================ CHAT SIDEBAR ENDS HERE (ASIDE) ======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ================================== CHAT AREA TOGGLE STRATS HERE ======================================
// Chat conversation toggle functionality

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
// ========================= CHAT AREA TOGGLE ENDS HERE ===================================================
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
        e.preventDefault()
        this.closest('.conversation').classList.remove('active')
        document.querySelector('.conversation-default').classList.add('active')
    })
})


// document.addEventListener("DOMContentLoaded", function () {
//     const chatItems = document.querySelectorAll(".chat-item");
//     const welcomeScreen = document.querySelector(".welcome-content");
//     const conversation = document.getElementById("conversation-1");

//     // Initially hide the conversation
//     if (conversation) conversation.style.display = "none";

//     chatItems.forEach(item => {
//         item.addEventListener("click", function (e) {
//             e.preventDefault(); // prevent default link behavior

//             // Hide welcome screen
//             if (welcomeScreen) welcomeScreen.style.display = "none";

//             // Show the conversation area
//             if (conversation) conversation.style.display = "flex"; // match your flex layout

//             // Update header info
//             const name = item.getAttribute("data-chat-name");
//             const img = item.getAttribute("data-chat-img");

//             document.getElementById("chatHeader").textContent = name;
//             document.getElementById("chatHeaderImg").src = img;
//         });
//     });
// });


document.addEventListener("DOMContentLoaded", function () {
    const chatItems = document.querySelectorAll(".chat-item");
    const welcomeScreen = document.querySelector(".welcome-content");
    const conversation = document.getElementById("conversation-1");

    chatItems.forEach(item => {
        item.addEventListener("click", function (e) {
            e.preventDefault(); // prevent page reload from href

            // Hide welcome screen
            if (welcomeScreen) welcomeScreen.classList.add("hidden");

            // Show conversation area
            if (conversation) conversation.classList.remove("hidden");

        });
    });
});


// =================================== CHAT AREA TOTGGLE ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ====================== FLASK SOCKETIO CONNECTION SET UP STARTS HERE  ====================================


var sessionUserId = "{{ user_id }}";
var groupId = "{{ group_id }}" || null;
var privateChatId = "{{ private_chat_id }}" || null;
window.activeChatId = groupId || privateChatId;
window.activeChatType = groupId ? "group" : privateChatId ? "private" : null;

const socket = io.connect("http://127.0.0.1:5005");


socket.on("connect", function () {
    console.log("Connected to the server!");

    if (window.activeChatType === "group") {
        socket.emit("join_group", { group_id: parseInt(window.activeChatId) });
    } else if (window.activeChatType === "private") {
        socket.emit("join_private_chat", { chat_id: parseInt(window.activeChatId), user_id: sessionUserId });
    }
});


// ================================ FLASK SOCKETIO CONNECTION SET UP ENDS HERE  ================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =============================== USER SESSION STORAGE STARTS HERE ============================================

window.onload = async function () {
    const sessionData = await fetchSessionData();

    if (sessionData) {
        let chatId = sessionStorage.getItem("active_chat_id");
        let chatType = sessionStorage.getItem("active_chat_type");

        if (chatId && chatType) {
            switchChat(chatId, chatType);
        }
    }
};

// ------------------------------------ FUNCTION TO FETCH USER SESSION DATA -------------------------------------
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
        sessionStorage.setItem("firstname", data.firstname);
        sessionStorage.setItem("lastname", data.lastname);
        sessionStorage.setItem("staffid", data.staffid);

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
// ======================================== SWITCH FUNCTION STARTS HERE ========================================

function switchChat(chat_id, chat_type) {
    if (!chat_id || !chat_type) {
        console.error("❌ Invalid chat switch request!");
        return;
    }

    console.log(`✅ Switching to ${chat_type} chat (ID: ${chat_id})`);

    sessionStorage.setItem("active_chat_id", chat_id);
    sessionStorage.setItem("active_chat_type", chat_type);


    window.activeChatId = chat_id;
    window.activeChatType = chat_type;

    let sessionUserId = sessionStorage.getItem("user_id");
    if (!sessionUserId) {
        console.error("⚠️ User ID missing from sessionStorage!");
        return;
    }

    socket.emit("leave_group", { group_id: chat_id });
    socket.emit("leave_private_chat", { chat_id: chat_id });

    if (chat_type === "group") {
        socket.emit("leave_private_chat", { chat_id: window.activeChatId }); // Leave the previous private chat (if any)
        socket.emit("join_group", { group_id: chat_id });
    } else if (chat_type === "private") {
        socket.emit("leave_group", { group_id: window.activeChatId }); // Leave the previous group chat (if any)
        socket.emit("join_private_chat", { chat_id: chat_id, user_id: sessionUserId });
    }
    loadChat(chat_id, chat_type);
}


// -------------------------- Function to join the chat room --------------------------
// This function is called when the user clicks on a chat item in the sidebar
function joinChatRoom(chatType, chatId) {
    window.activeChatType = chatType;
    window.activeChatId = chatId;

    // 🔹 Make sure the user joins the correct room
    if (chatType === "group") {
        socket.emit("join_group", { group_id: chatId });
        console.log(`📡 Joining group: ${chatId}`);
    } else if (chatType === "private") {
        socket.emit("join_private_chat", { chat_id: chatId });
        console.log(`📡 Joining private chat: ${chatId}`);
    }
}

// ===================================== SWITCH FUNCTION ENDS HERE =============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ==================================== HANDLE CHAT CLICK FUNCTION STARTS HERE =================================

function handleChatClick(event) {
    // Prevent default anchor behavior
    event.preventDefault();

    // Find the closest chat list item
    const chatItemList = event.target.closest(".chat-item-list");
    if (!chatItemList) return;

    // Get the chat item and its data attributes
    const chatItem = chatItemList.querySelector(".chat-item");
    if (!chatItem) {
        console.error("Chat item element not found!");
        return;
    }

    const chatId = chatItem.dataset.chatId?.trim();
    const chatType = chatItem.dataset.chatType?.trim();

    if (!chatId || !chatType) {
        console.error("Missing chat ID or type!");
        return;
    }

    // 1. FIRST REMOVE ACTIVE CLASS FROM ALL CHATS
    document.querySelectorAll(".chat-item-list").forEach(item => {
        item.classList.remove("active-chat", "active"); // Remove both classes for safety
    });

    // 2. THEN ADD ACTIVE CLASS ONLY TO THE CLICKED CHAT
    chatItemList.classList.add("active"); // Using just one active class

    // 3. UPDATE CHAT HEADER
    updateChatHeader(
        chatItemList.querySelector(".content-message-name")?.textContent.trim(),
        chatItemList.querySelector(".content-message-image")?.src
    );


    // 4. HANDLE UNREAD MESSAGES
    const unreadBadge = chatItemList.querySelector(".content-message-unread");
    if (unreadBadge) {
        unreadBadge.textContent = "";
        unreadBadge.style.display = "none";
    }

    // 5. MARK MESSAGES AS READ VIA SOCKET
    socket.emit("mark_messages_as_read", {
        chat_id: chatId,
        chat_type: chatType,
        user_id: sessionStorage.getItem("user_id")
    });

    // 6. STORE ACTIVE CHAT IN SESSION STORAGE
    sessionStorage.setItem("active_chat_id", chatId);
    sessionStorage.setItem("active_chat_type", chatType);

    // 7. FINALLY SWITCH TO THE SELECTED CHAT
    switchChat(chatId, chatType);
}

// Attach event listener correctly
document.querySelectorAll(".chat-item").forEach(item => {
    item.addEventListener("click", handleChatClick);
});



socket.on("messages_marked_as_read", function (data) {
    console.log(`✅ ${data.updated_count} messages marked as read for ${data.chat_id}`);

    const chatItem = document.querySelector(`.chat-item[data-chat-id="${data.chat_id}"]`);
    if (chatItem) {
        let unreadBadge = chatItem.querySelector(".content-message-unread");
        if (unreadBadge) {
            unreadBadge.textContent = ""; // Clear unread count
            unreadBadge.style.display = "none"; // Hide unread badge
        }
    }
});

// =========================================== HANDLE CHAT CLICK FUNCTION ENDS HERE ========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ========================================== UPDATE CHAT HEADER AND IMAGE FUNCTION STARTS HERE ============================

function updateChatHeader(chatName, chatImage) {
    let chatHeader = document.getElementById("chatHeader");
    let chatImg = document.getElementById("chatHeaderImg");

    if (chatHeader) {
        chatHeader.textContent = chatName || "Chat";
    }

    if (chatImg) {
        if (chatImage) {
            chatImg.src = chatImage;
            chatImg.style.display = "block"; // Ensure image is visible
        } else {
            chatImg.src = "/static/images/default-profile.png"; // Fallback avatar
            chatImg.style.display = "block"; // Ensure default image shows
        }
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

// -========================================== UPDATE CHAT HEADER AND IMAGE FUNCTION ENDS HERE ===============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ===========================================  TIMESTAMP FORMAT FUNCTION ====================================================

function formatTimestamp(timestamp) {
    if (!timestamp) return "Just now";

    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
        console.error("❌ Invalid timestamp:", timestamp);
        return "Just now";
    }

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

// =========================================== TIMESTAMP FORMAT FUNCTION ENDS HERE =========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =========================================== LOAD CHAT FUNCTION STARTS HERE ==============================================

function loadChat(chatId, chatType) {
    chatId = chatId || sessionStorage.getItem("active_chat_id");
    chatType = chatType || sessionStorage.getItem("active_chat_type");

    if (!chatId || !chatType) {
        console.error("loadChat: Missing chat ID or type!", { chatId, chatType });
        return;
    }

    console.log("📥 Loading chat:", chatId, chatType);

    if (chatType === "group") {
        socket.emit("join_group", { group_id: chatId });
        console.log(`📡 Joining group: ${chatId}`);
    } else if (chatType === "private") {
        socket.emit("join_private_chat", { chat_id: chatId });
        console.log(`📡 Joining private chat: ${chatId}`);
    }

    let chatbox = document.getElementById("conversation-main");
    if (!chatbox) {
        console.error("Chatbox element not found!");
        return;
    }

    chatbox.innerHTML = "<p>Loading messages...</p>";

    fetch(`/get_messages?chat_id=${chatId}&chat_type=${chatType}`)
        .then(response => response.json())
        .then(data => {
            chatbox.innerHTML = "";

            if (!Array.isArray(data.messages)) {
                console.error("Invalid messages format:", data.messages);
                chatbox.innerHTML = "<p>Error loading messages.</p>";
                return;
            }

            if (data.messages.length === 0) {
                chatbox.innerHTML = "<p>No messages yet.</p>";
                return;
            }

            let lastDate = null;

            data.messages.forEach(message => {

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

        })

        .catch(error => {
            console.error("Error loading chat messages:", error);
            chatbox.innerHTML = "<p>Error loading messages.</p>";
        });

        // Add listener for star updates
    socket.on("message_starred", (data) => {
        const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
        if (messageElement) {
            const isStarred = data.user_id === sessionStorage.getItem("user_id") ? data.starred : 
                             messageElement.classList.contains("starred");
            
            messageElement.classList.toggle("starred", isStarred);
            const starIcon = messageElement.querySelector(".starred-icon");
            if (starIcon) {
                starIcon.classList.toggle("ri-star-fill", isStarred);
                starIcon.classList.toggle("ri-star-line", !isStarred);
            }
        }
    });
}


// ====================================== LOAD CHAT FUNCTION ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ======================================= DISPLAY MESSAGE FUNCTION STARTS HERE ======================================

async function displayMessage(data, chatType) {
    let messagesContainer = document.getElementById("conversation-main");

    const messageStore = new Map();

    if (!messagesContainer) {
        console.error("❌ Chatbox not found!");
        return;
    }

    let sessionUserId = sessionStorage.getItem("user_id");
    let isOutgoing = String(data.user_id) === String(sessionUserId);

    let messageWrapper = document.createElement("div");
    messageWrapper.classList.add("message-wrapper");
    messageWrapper.id = `message-${data.id}`; // 👈 Important for scroll target
    messageWrapper.classList.add(isOutgoing ? "outgoing" : "incoming");
    messageWrapper.dataset.messageId = data.id;

    let senderName = (chatType === "group" && data.sender) ? `<strong>${data.sender}:</strong> ` : "";
    let messageText = data.message_type === "text" ? data.message : "";

    let fileUrl = data.file_url || data.message;
    let filePreview = "";

    if (data.message_type === "image" || data.message_type === "file") {
        if (fileUrl) {
            let fullUrl = fileUrl.startsWith("http") ? fileUrl : window.location.origin + fileUrl;
            filePreview = generateFilePreview(fullUrl, data.message_type);
        } else {
            console.warn("⚠️ No file URL found for preview!");
        }
    }

    if (!messageText && !filePreview) {
        console.warn("⚠️ Empty message and no file preview! Skipping message display.");
        return;
    }

    messageStore.set(data.id, data);

    let replyHtml = '';
    if (data.reply_to) {
        const reply = data.reply_to;
        const replySender = reply.sender || (reply.user_id === sessionUserId ? "You" : "Someone");
        const replyType = reply.message_type;
        const replyText = reply.message || "";
        const fileExt = replyText.split('.').pop().toLowerCase();

        let previewContent = '';
        let fileUrl = replyText.startsWith("http") ? replyText : `${window.location.origin}${replyText}`;

        // Get appropriate icon based on file type
        let fileIcon = 'ri-file-line'; // Default file icon

        if (replyType === "image" || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
            previewContent = `
            <div class="reply-media-preview">
                <i class="ri-image-line reply-icon"></i>
                <img src="${fileUrl}" alt="Image" class="reply-preview-image">
            </div>
        `;
        }
        else if (replyType === "video" || ['mp4', 'webm', 'mov', 'avi'].includes(fileExt)) {
            previewContent = `
            <div class="reply-media-preview">
                <i class="ri-video-line reply-icon"></i>
                <span class="reply-type-label">Video</span>
                <video class="reply-preview-video" src="${fileUrl}" muted playsinline></video>
            </div>
        `;
        }
        else if (replyType === "audio" || ['mp3', 'wav', 'ogg', 'aac'].includes(fileExt)) {
            previewContent = `
            <div class="reply-media-preview">
                <i class="ri-music-2-line reply-icon"></i>
                <span class="reply-type-label">Audio</span>
                <audio class="reply-preview-audio" src="${fileUrl}" controls preload="metadata"></audio>
            </div>
        `;
        }
        else if (replyType === "file") {
            let fileName = fileUrl.split("/").pop();

            // Set specific icons for different file types
            if (fileExt === 'pdf') {
                fileIcon = 'ri-file-pdf-line';
            } else if (['doc', 'docx'].includes(fileExt)) {
                fileIcon = 'ri-file-word-line';
            } else if (['xls', 'xlsx'].includes(fileExt)) {
                fileIcon = 'ri-file-excel-line';
            } else if (['ppt', 'pptx'].includes(fileExt)) {
                fileIcon = 'ri-file-ppt-line';
            } else if (['zip', 'rar', '7z'].includes(fileExt)) {
                fileIcon = 'ri-file-zip-line';
            }

            previewContent = `
            <div class="reply-file-preview">
                <i class="${fileIcon} reply-icon"></i>
                <span class="reply-file-name">${fileName}</span>
            </div>
        `;
        }
        else {
            // Text fallback
            let textPreview = replyText.length > 30 ? replyText.slice(0, 30) + "..." : replyText;
            previewContent = `
            <div class="reply-text-preview">
                <i class="ri-chat-1-line reply-icon"></i>
                <em>${textPreview}</em>
            </div>
        `;
        }

        replyHtml = `
    <div class="replied-message" data-reply-id="${reply.message_id}">
        <div class="reply-header">
            <i class="ri-reply-line reply-arrow"></i>
            <strong>${replySender}</strong>
        </div>
        ${previewContent}
    </div>
    `;
    }

    // Determine tick icon
    let tickIcon = "";
    if (isOutgoing) {
        const readBy = data.read_by || [];
        if (readBy.includes(sessionUserId)) {
            tickIcon = '<i class="ri-check-double-line" style="color: red;"></i>';
        } else if (data.status === "delivered") {
            tickIcon = '<i class="ri-check-double-line"></i>';
        } else {
            tickIcon = '<i class="ri-check-line"></i>';
        }
    }


    // Add star icon - this is the key addition
    const starIcon = data.starred
        ? '<i class="ri-star-fill starred-icon" onclick="toggleStarMessage(\'' + data.id + '\')"></i>'
        : '<i class="ri-star-line starred-icon" onclick="toggleStarMessage(\'' + data.id + '\')"></i>';

    messageWrapper.innerHTML = `
    <div class="conversation-item ${isOutgoing ? 'outgoing' : 'incoming'} ${data.starred ? 'starred' : ''} ">
        <!-- Dropdown for outgoing messages (left side) -->
        ${isOutgoing ? `
            <div class="conversation-item-dropdown">
                <button type="button" class="conversation-item-dropdown-toggle">
                    <i class="ri-more-2-line"></i>
                </button>
                <ul class="conversation-item-dropdown-list">
                    <li><a href="#" class="dropdown-item reply-message" data-message-id="${data.id}">
                        <i class="ri-reply-line"></i> Reply
                    </a></li>
                    <li><a href="#" class="dropdown-item copy-message" data-message-id="${data.id}">
                        <i class="ri-file-copy-line"></i> Copy
                    </a></li>
                    <li><a href="#" class="dropdown-item forward-message" data-message-id="${data.id}">
                        <i class="ri-share-forward-line"></i> Forward
                    </a></li>
                    <li><a href="#" class="dropdown-item star-message" data-message-id="${data.id}">
                        <i class="ri-star-line"></i> Star
                    </a></li>
                    <li><a href="#" class="dropdown-item delete-message" data-message-id="${data.id}">
                        <i class="ri-delete-bin-line"></i> Delete
                    </a></li>
                    <li><a href="#" class="dropdown-item select-message" data-message-id="${data.id}">
                        <i class="ri-checkbox-line"></i> Select
                    </a></li>
                    <li><a href="#" class="dropdown-item share-message" data-message-id="${data.id}">
                        <i class="ri-share-line"></i> Share
                    </a></li>
                </ul>
            </div>
        ` : ''}

        <!-- Avatar for incoming messages -->
        ${!isOutgoing ? `
            <div class="conversation-item-side">
                <img class="conversation-item-image" src="/profile_picture/${data.user_id}" alt="">
            </div>
        ` : ''}

        <!-- Message content -->
        <div class="conversation-item-content">
            <div class="conversation-item-wrapper">
                <div class="conversation-item-box ${isOutgoing ? 'outgoing-bubble' : 'incoming-bubble'}">
                    <div class="conversation-item-text">
                    ${replyHtml}
                        <p class="message-text">${senderName}<br>${messageText}</p>
                        ${filePreview}
                        <div class="timestamp conversation-item-time">
                            ${formatTimestamp(data.timestamp)}
                            ${tickIcon}
                            ${starIcon} 
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Avatar for outgoing messages -->
        ${isOutgoing ? `
            <div class="conversation-item-side">
                <img class="conversation-item-image" src="/profile_picture/${sessionUserId}" alt="">
            </div>
        ` : ''}

        <!-- Dropdown for incoming messages (right side) -->
        ${!isOutgoing ? `
            <div class="conversation-item-dropdown">
                <button type="button" class="conversation-item-dropdown-toggle">
                    <i class="ri-more-2-line"></i>
                </button>
                <ul class="conversation-item-dropdown-list">
                    <li><a href="#" class="dropdown-item reply-message" data-message-id="${data.id}">
                        <i class="ri-reply-line"></i> Reply
                    </a></li>
                    <li><a href="#" class="dropdown-item copy-message" data-message-id="${data.id}">
                        <i class="ri-file-copy-line"></i> Copy
                    </a></li>
                    <li><a href="#" class="dropdown-item forward-message" data-message-id="${data.id}">
                        <i class="ri-share-forward-line"></i> Forward
                    </a></li>
                    <li><a href="#" class="dropdown-item star-message" data-message-id="${data.id}">
                        <i class="ri-star-line"></i> Star
                    </a></li>
                    <li><a href="#" class="dropdown-item delete-message" data-message-id="${data.id}">
                        <i class="ri-delete-bin-line"></i> Delete
                    </a></li>
                    <li><a href="#" class="dropdown-item select-message" data-message-id="${data.id}">
                        <i class="ri-checkbox-line"></i> Select
                    </a></li>
                    <li><a href="#" class="dropdown-item share-message" data-message-id="${data.id}">
                        <i class="ri-share-line"></i> Share
                    </a></li>
                </ul>
            </div>
        ` : ''}
    </div>
`;

    messagesContainer.appendChild(messageWrapper);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// -----------------------------FUNCTION TO SCROLL TO REPLY MESSAGE----------------------------

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



// ======================================== DISPLAY MESSAGE FUNCTION ENDS HERE ==============================================
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

                // Handle click event to start private chat
                userItem.onclick = () => {
                    // Pass user.id, fullName, and imageUrl to startPrivateChat
                    startPrivateChat(user.id, `${user.firstname} ${user.lastname}`, user.image_url);
                    searchResults.innerHTML = "";  // Clear search results
                    document.getElementById("searchInput").value = "";  // Clear input field
                };

                searchResults.appendChild(userItem);
            });
        })
        .catch(error => console.error("Error searching users:", error));
}

// ==================================== SEARCH USER FUNCTION ENDS HERE ==============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ================================== SEND MESSAGE FUNCTION STARTS HERE =============================================


document.addEventListener("DOMContentLoaded", function () {
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

        console.log("▶️ sendMessage called, message:", message, "file:", file);


        const replyToMessageId = document.getElementById("reply_to_message_id")?.value;

        if (!message && !file) {
            console.error("❌ Please enter a message or select a file.");
            return;
        }

        const userId = sessionStorage.getItem("user_id");
        const firstname = sessionStorage.getItem("firstname") || "";
        const lastname = sessionStorage.getItem("lastname") || "";
        const username = `${firstname} ${lastname}`.trim(); // 👈 Proper sender name
        const chatType = window.activeChatType;
        const chatId = window.activeChatId;

        let messageData = {
            user_id: userId,
            group_id: chatType === "group" ? chatId : null,
            private_chat_id: chatType === "private" ? chatId : null,
            message: message || null,
            message_type: file ? (file.name.match(/\.(png|jpg|jpeg|gif)$/i) ? "image" : "file") : "text",
            timestamp: new Date().toISOString(),
            sender: username, // ✅ this now comes from firstname + lastname
            reply_to_message_id: replyToMessageId
        };

        if (file) {
            let formData = new FormData();
            formData.append("file", file);

            try {
                let response = await fetch("/upload", {
                    method: "POST",
                    body: formData
                });

                let result = await response.json();
                console.log("📂 File Upload Response:", result);

                if (result.success && result.file_url) {
                    let cleanFileUrl = result.file_url.replace("//uploads", "/uploads");
                    messageData.message = cleanFileUrl;  // Fix: Assign file path to message
                } else {
                    console.error("❌ Error uploading file:", result.error);
                    return;
                }
            } catch (error) {
                console.error("❌ Error uploading file:", error);
                return;
            }
        }



        socket.emit("send_message", messageData, (ack) => {
            console.log("✅ Message sent successfully:", ack);
        });

        messageInput.value = "";
        fileInput.value = "";


        if (document.getElementById("filePreview")) {
            document.getElementById("filePreview").remove();
        }

        // ✅ Clear reply preview and reset reply_to_message_id
        const replyPreview = document.getElementById("replyPreview");
        const replyContent = document.getElementById("replyContent");
        const replyToInput = document.getElementById("reply_to_message_id");

        if (replyPreview) {
            replyPreview.style.display = "none";

        }

        if (replyContent) {
            replyContent.textContent = '';
        }

        if (replyToInput) {
            replyToInput.value = "";
        }
    }

    // ----------------------------- Function to handle Enter key press --------------------------------------------

    function handleEnterKey(event) {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault(); // Prevent new line
            sendMessage();
        }
    }
});

// ------------------------------- Handle incoming WebSocket messages ------------------------------------------------

socket.on("receive_message", async (data) => {
    console.log("📩 New message received:", data);
    console.log("Sender Name:", data.sender);

    // Ensure starred fields exist (backward compatibility)
    data.starred = data.starred || false;
    data.starred_by = data.starred_by || [];
    data.starred_at = data.starred_at || null;

    const isGroup = !!data.group_id;
    const chatId = isGroup ? data.group_id : data.private_chat_id;
    const chatType = isGroup ? "group" : "private";
    const sessionUserId = sessionStorage.getItem("user_id");

    // Check if current user starred this message
    if (sessionUserId) {
        data.starred = data.starred_by.includes(sessionUserId);
    }

    // Check if the message belongs to the active chat
    if (
        (window.activeChatType === "group" && chatId == window.activeChatId) ||
        (window.activeChatType === "private" && chatId == window.activeChatId)
    ) {
        console.log("🔎 Active chat:", window.activeChatType, window.activeChatId);
        await displayMessage(data, window.activeChatType);

        const sessionUserId = sessionStorage.getItem("user_id");

        if (data.user_id !== sessionUserId) {
            socket.emit("message_delivered", {
                message_id: data.id,
                user_id: sessionUserId
            });
        }
    } else {
        console.warn("⚠️ Message received for a different chat. Updating unread count...");
        updateUnreadCount(data);  // Increment unread messages
    }

    // Always move the chat to the top
    moveChatToTop(chatId, chatType);
    updateChatPreview(chatId, chatType, data.message, data.timestamp, data.starred);

});


// Handle star updates (separate handler, not nested)
socket.on("message_starred", (data) => {
    console.log("⭐ Star update received:", data);

    const messageElement = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (!messageElement) return;

    const sessionUserId = sessionStorage.getItem("user_id");
    const isOurStar = data.user_id === sessionUserId;

    // Update UI only if:
    // - It's our own star action, or
    // - The message is in the current chat view
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
        updateChatStarIndicator(chatId, data.message_id, data.starred);
    }
});

// ========================================= SEND MESSAGES FUNCTION ENDS HERE ===========================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ================================= FILE PREVIEW FUNCTION STARTS HERE ==================================================

document.getElementById("attachFileIcon").addEventListener("click", function () {
    document.getElementById("fileInput").click();
});

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

// Function to remove file preview
function removePreview() {
    let previewContainer = document.getElementById("filePreview");
    if (previewContainer) {
        previewContainer.remove();
    }
    fileInput.value = ""; // Reset file input
}


// ----------------- SEND MULTIPLE FILES START --------------------------------
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

// // ----------------- SEND MULTIPLE FILES END ----------------------------------


// ---------------------------------- Function to generate file preview ---------------------------------------------------------------------------

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

    // Video preview
    if (messageType === 'video' || ['mp4', 'webm', 'ogg', 'mov'].includes(fileExt)) {
        return generateVideoPreview(fileUrl, fileExt, displayName);
    }

    // Audio preview
    if (messageType === 'audio' || ['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(fileExt)) {
        return generateAudioPreview(fileUrl, fileExt, displayName);
    }

    // Document previews (enhanced)
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(fileExt)) {
        return generateDocumentPreview(fileUrl, fileExt, displayName);
    }

    // Generic file preview
    return generateGenericPreview(fileUrl, displayName);
}

// Helper functions for each preview type

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

function openImageModal(imageUrl, imageName) {
    // Create modal structure
    const modalHtml = `
        <div class="image-modal" onclick="closeImageModal()">
            <div class="modal-content-container">
                <div class="modal-content">
                    <span class="close-btn" onclick="closeImageModal()">&times;</span>
                    <img src="${imageUrl}" alt="Enlarged view" class="modal-image" 
                         onload="adjustModalSize(this)">
                    <div class="modal-actions">
                        <a href="${imageUrl}" download="${imageName}" class="modal-download-btn">
                        
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.body.style.overflow = 'hidden';
}

function adjustModalSize(imgElement) {
    const modalContent = imgElement.closest('.modal-content');
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

// ================================ FILE PREVIEW FUNCTION ENDS HERE =====================================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// =============================== FUNCTION TO ADD USERS TO CHATLIST FOR PRIVATE CHAT STARTS HERE =======================================

function startPrivateChat(user_id, fullName, imageUrl) {
    // 1. FIRST REMOVE ACTIVE CLASS FROM ALL CHATS
    document.querySelectorAll(".chat-item-list").forEach(item => {
        item.classList.remove("active-chat", "active");
    });

    let chatList = document.querySelector(".content-messages-list");
    let existingChat = chatList.querySelector(`[data-user-id="${user_id}"]`);

    if (!existingChat) {
        // Create new chat item
        let chatItem = document.createElement("li");
        chatItem.setAttribute("data-user-id", user_id);
        chatItem.classList.add("chat-item-list");

        chatItem.innerHTML = `
            <a href="#" class="chat-item" data-chat-type="private">
                <div class="chat-content-list">
                    <img class="content-message-image" src="${imageUrl}" alt="Chat Image" onerror="this.src='/static/images/default-profile.png';">
                    <div class="chat-details content-message-info">
                        <span class="content-message-name">${fullName}</span>
                        <span class="content-message-text">No messages yet</span>
                        <div class="content-message-more">
                            <span class="content-message-time">-</span>
                        </div>
                    </div>
                </div>
            </a>

            <div class="chat-options">
                <button type="button" class="menu-btn" onclick="toggleMenu(this)">
                    <i class="ri-more-2-line"></i>
                </button>
                <ul class="chat-dropdown-menu">
                    <li><a href="#" class="chat-dropdown-item" onclick="deleteChat('${user_id}', this)">
                        <i class="ri-delete-bin-line"></i> Delete
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="archiveChat('${user_id}', this)">
                        <i class="ri-inbox-archive-line"></i> Archive
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="muteChat('${user_id}', this)">
                        <i class="ri-volume-mute-line"></i> Mute chat
                    </a></li>
                    <hr>
                    <li><a href="#" class="chat-dropdown-item" onclick="markChat('${user_id}', this)">
                        <i class="ri-check-double-line"></i> Mark as read
                    </a></li>
                </ul>
            </div>
        `;

        // Add click handler to the new chat item
        chatItem.querySelector(".chat-item").addEventListener("click", handleChatClick);
        chatList.prepend(chatItem);
        existingChat = chatItem;
    }

    // 2. ADD ACTIVE CLASS TO THE NEW/EXISTING CHAT
    existingChat.classList.add("active");

    // 3. UPDATE CHAT HEADER
    updateChatHeader(fullName, imageUrl);

    // 4. SWITCH TO THE CHAT
    switchChat(user_id, "private");

    // 5. FETCH CHAT ID FROM SERVER
    fetch("/start_private_chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user_id }),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error("Error starting chat:", data.error);
                return;
            }

            // Update the chat item with the correct chat ID
            const chatItem = existingChat.querySelector(".chat-item");
            if (chatItem) {
                chatItem.dataset.chatId = data.chat_id;
                // Update session storage with the actual chat ID
                sessionStorage.setItem("active_chat_id", data.chat_id);
                sessionStorage.setItem("active_chat_type", "private");
            }
        })
        .catch(error => console.error("Error starting private chat:", error));

    // 6. CLEAN UP SEARCH UI
    document.getElementById("searchResults").innerHTML = "";
    document.getElementById("searchInput").value = "";
}


// ========================================= FUNCTION TO ADD USERS TO CHATLIST FOR PRIVATE CHAT ENDS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ========================================= FUNCTION TO MOVE CHAT TO TOP STARTS HERE ===========================================================

// Function to move the chat to the top of the list
function moveChatToTop(chatId, chatType) {
    const chatList = document.querySelector(".content-messages-list");

    const chatItem = document.querySelector(
        `.chat-item-list .chat-item[data-chat-id="${chatId}"][data-chat-type="${chatType}"]`
    )?.closest(".chat-item-list");

    if (chatItem && chatList) {
        chatList.prepend(chatItem);
        console.log(`⬆️ Moved ${chatType} chat (ID: ${chatId}) to top`);
    } else {
        console.warn(`⚠️ Could not find chat with ID: ${chatId} and type: ${chatType} to move.`);
    }
}

// ----------------------------------------- UPDATE CHAT PREVIEW FUNCTION STARTS HERE -----------------------------------------------
// Function to update chat preview with the latest message and timestamp

function updateChatPreview(chatId, chatType, message, timestamp) {
    const chatItem = document.querySelector(
        `.chat-item-list .chat-item[data-chat-id="${chatId}"][data-chat-type="${chatType}"]`
    )?.closest(".chat-item-list");

    if (!chatItem) {
        console.warn("⚠️ Could not find chat to update preview.");
        return;
    }

    const previewTextEl = chatItem.querySelector(".content-message-text");
    if (previewTextEl) {
        previewTextEl.textContent = message;
    }

    const timeEl = chatItem.querySelector(".content-message-time");
    if (timeEl) {
        timeEl.textContent = formatTimestamp(timestamp);
    }
}

// ----------------------------------------- UPDATE CHAT PREVIEW FUNCTION ENDS HERE --------------------------------------------------

// ========================================= FUNCTION TO MOVE CHAT TO TOP ENDS HERE ==================================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ======================================= DATE CHAT GROUPING IN THE CHAT AREA STARTS HERE ===========================================
// This function shows Date time separations between chats in the chat area
// It will show the date when the message was sent in the chat area

function formatDate(dateString) {
    let date = new Date(dateString);
    let options = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
    return date.toLocaleDateString(undefined, options); // Example: "Wednesday, March 20, 2025"
}

function insertDateSeparator(dateString) {
    let messagesContainer = document.getElementById("conversation-main");

    let dateSeparator = document.createElement("div");
    dateSeparator.className = "chat-date-separator";
    dateSeparator.textContent = formatDate(dateString);

    messagesContainer.appendChild(dateSeparator);
}

// ======================================= DATE CHAT GROUPING IN THE CHAT AREA ENDS HERE ==============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ========================================= FUNCTION TO UPDATE UNREAD COUNT STARTS HERE ==============================================
// Function to update unread count and move chat to the top
function updateUnreadCount(data) {
    const chatId = data.group_id || data.private_chat_id;
    const chatElement = document.querySelector(`[data-chat-id="${chatId}"]`);

    if (chatElement) {
        let unreadBadge = chatElement.querySelector(".unread-badge");
        let unreadCount = parseInt(unreadBadge.innerText) || 0;
        unreadCount += 1; // Increment unread messages
        unreadBadge.innerText = unreadCount;
        unreadBadge.style.display = "inline-block";

        // Move chat to the top of the chat list
        let chatListContainer = document.querySelector(".content-messages-list");
        chatListContainer.prepend(chatElement);
    }
}

// ========================================= FUNCTION TO UPDATE UNREAD COUNT ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ======================================== FUNCTION TO UPDATE MESSAGE STATUS STARTS HERE ===============================================

socket.on("message_status_update", (data) => {
    console.log("📬 Status update received:", data); // 🔍 Log the incoming data
    const messageId = data.message_id;
    const status = data.status;

    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const timestampEl = messageEl.querySelector(".timestamp");
    if (!timestampEl) return;

    // Remove previous tick
    const existingTick = timestampEl.querySelector(".tick");
    if (existingTick) existingTick.remove();

    let tickHTML = "";

    if (status === "sent") {
        tickHTML = '<span class="tick"><i class="ri-check-line"></i></span>';
    } else if (status === "delivered") {
        tickHTML = '<span class="tick"><i class="ri-check-double-line"></i></span>';
    } else if (status === "read") {
        tickHTML = '<span class="tick"><i class="ri-check-double-line" style="color: red;"></i></span>';
    } else {
        console.warn("⚠️ Unknown status received:", status);
    }

    // Append the tick
    timestampEl.insertAdjacentHTML("beforeend", tickHTML);
});

// ======================================== FUNCTION TO UPDATE MESSAGES STATUS ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ================================== FUNCTION TO DELETE CHAT FROM CHAT LISTS STRATS HERE ==============================================

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
// =================================== FUNCTION TO DELETE CHAT FROM CHAT LISTS ENDS HERE ===============================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ========================= FUNCTION FOR TOGGLE FUNCTIONALITIES FOR CHAT LIST ITEMS STARTS HERE =======================================

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



// ========================= FUNCTION FOR TOGGLE FUNCTIONALITIES FOR CHAT LIST ITEMS ENDS HERE =======================================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
// ======================== FUNCTION TO TOGGLE CHAT ARE DROPDOWN FOR EACH CHAT MESSAGES IN THE CHAT AREA =============================

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

        // Handle reply messages action FIRST
        if (replyBtn) {
            e.preventDefault();
            const messageId = replyBtn.dataset.messageId;
            replyMessage(messageId);
            return; // important: prevent further dropdown handling conflict
        }

        // Copy message
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

        // Forward
        if (forwardBtn) {
            e.preventDefault();
            const messageId = forwardBtn.dataset.messageId;
            const messageElement = forwardBtn.closest('.conversation-item-content') || forwardBtn.closest('.message-wrapper');

            if (!messageElement) return;

            const messageText = messageElement.querySelector('.message-text')?.textContent || "";
            const filePreview = messageElement.querySelector('.media-preview');
            const isMedia = filePreview !== null;
            const mediaUrl = isMedia ? filePreview.src : null;
            const messageType = isMedia ? 'image' : 'text';

            openForwardModal(messageId, {
                element: messageElement,
                content: messageText,
                type: messageType,
                mediaUrl: mediaUrl
            });
            return;
        }

        // Delete
        if (deleteBtn) {
            e.preventDefault();
            const messageId = deleteBtn.dataset.messageId;
            deleteMessage(messageId);
            return;
        }

        // Star Message
        if (starMessage) {
            e.preventDefault();
            const messageId = starMessage.dataset.messageId;
            toggleStarMessage(messageId);
            return;
        }

        // Handle clicking the star icon itself
        // if (e.target.classList.contains('starred-icon')) {
        //     const messageWrapper = e.target.closest('.message-wrapper');
        //     if (messageWrapper) {
        //         const messageId = messageWrapper.dataset.messageId;
        //         toggleStarMessage(messageId);
        //     }
        // }

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


// -------------------------Function to show copied tooltip -------------------------------------------------     
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

// ----------------------------------------------------------------------------------------------------------------

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

// --------------------------------- Function to open forward modal -------------------------------------------------
const modal = document.getElementById("forwardModal");
const closeBtn = document.querySelector(".modal .close");
const forwardList = document.getElementById("forwardTargetList");
const searchInput = document.getElementById("forwardSearchInput");
const forwardBtn = document.getElementById("confirmForwardBtn");

let selectedTargets = new Set();
let allTargets = [];

// Open modal with message preview
async function openForwardModal(messageId, messageData) {
    selectedTargets.clear();
    forwardList.innerHTML = '';
    searchInput.value = '';
    modal.style.display = 'block';

    // Store message being forwarded
    currentForwardMessage = {
        id: messageId,
        content: messageData.content,
        type: messageData.type,
        mediaUrl: messageData.mediaUrl
    };

    // Show preview
    const preview = document.getElementById('forwardMessagePreview');
    preview.innerHTML = `
        <strong>Forwarding:</strong>
        ${messageData.type !== 'text'
            ? `<img src="${messageData.mediaUrl}" alt="Media" style="max-width: 100%; max-height: 150px; border-radius: 4px; margin-top: 8px;">`
            : `<p style="margin: 8px 0 0; padding: 8px; background: #f0f0f0; border-radius: 4px;">${messageData.content}</p>`
        }
    `;

    // Load targets
    try {
        const response = await fetch('/get_forward_targets');
        if (!response.ok) throw new Error("Failed to load targets");

        allTargets = await response.json();
        renderTargetList(allTargets);
    } catch (err) {
        console.error("Error loading targets:", err);
        forwardList.innerHTML = '<li class="error">Could not load recipients</li>';
    }
}

function renderTargetList(targets) {
    forwardList.innerHTML = '';

    if (targets.length === 0) {
        forwardList.innerHTML = '<li class="no-targets">No contacts or groups found</li>';
        return;
    }

    targets.forEach(target => {
        const li = document.createElement('li');

        // Group vs. User UI
        const icon = target.type === 'user' ? '👤' : '👥';
        const meta = target.type === 'user'
            ? `Dept: ${target.meta}`
            : `Created: ${target.timestamp.split(' ')[0]}`;  // Show only date

        li.innerHTML = `
            <div class="target-info">
                <img src="${target.image}" alt="${target.name}" 
                     onerror="this.src='${target.type === 'user'
                ? '/static/images/default-user.png'
                : '/static/images/default-group.png'}'">
                <div class="target-details">
                    <span class="target-name">${icon} ${target.name}</span>
                    <span class="target-meta">${meta}</span>
                </div>
            </div>
            <input type="checkbox" id="target_${target.id}" data-id="${target.id}">
        `;

        // Checkbox interaction
        const checkbox = li.querySelector('input');
        checkbox.checked = selectedTargets.has(target.id);
        checkbox.addEventListener('change', (e) => {
            e.target.checked
                ? selectedTargets.add(target.id)
                : selectedTargets.delete(target.id);
        });

        forwardList.appendChild(li);
    });
}

// Close modal
closeBtn.onclick = () => modal.style.display = "none";
window.onclick = (e) => { if (e.target === modal) modal.style.display = "none"; };

// // Filter on search
searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const filtered = allTargets.filter(t => t.name.toLowerCase().includes(q));
    renderTargetList(filtered);
});

// --------------------FORWARD MESSAGE BUTTON -------------------------

forwardBtn.addEventListener('click', async () => {
    if (selectedTargets.size === 0) {
        alert("Please select at least one recipient");
        return;
    }

    forwardBtn.disabled = true;
    forwardBtn.textContent = "Sending...";

    try {
        const response = await fetch('/forward_message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message_id: currentForwardMessage.id,
                targets: Array.from(selectedTargets),
                content: currentForwardMessage.content,
                type: currentForwardMessage.type,
                media_url: currentForwardMessage.mediaUrl
            })
        });

        if (!response.ok) throw new Error("Forwarding failed");

        modal.style.display = 'none';
        showToast("Message forwarded successfully!");
    } catch (err) {
        console.error("Forward error:", err);
        showToast("Failed to forward message", "error");
    } finally {
        forwardBtn.disabled = false;
        forwardBtn.textContent = "Forward";
    }
});
// ========================================= FUNCTION TO OPEN FORWARD MODAL ENDS HERE ==================================================

function deleteMessage(messageId) {
    if (confirm('Are you sure you want to delete this message?')) {
        const messageWrapper = document.querySelector(`.message-wrapper[data-message-id="${messageId}"]`);
        if (messageWrapper) {
            messageWrapper.remove();
            // Add your API call to delete from server here
            console.log('Deleted message:', messageId);
        }
    }
}

// ======================== FUNCTION TO TOGGLE CHAT ARE DROPDOWN FOR EACH CHAT MESSAGES IN THE CHAT AREA =============================
// xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

// Toggle star status
function toggleStarMessage(messageId) {
    const messageElement = document.querySelector(`.message-wrapper[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    const isStarred = !messageElement.classList.contains('starred');
    const userId = sessionStorage.getItem("user_id");

    // // Optimistic UI update
    // updateStarStatus(messageElement, isStarred);

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
                    <span class="timestamp">${formatTime(msg.timestamp)}</span>
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
        return message.message.length > 50
            ? message.message.substring(0, 50) + '...'
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