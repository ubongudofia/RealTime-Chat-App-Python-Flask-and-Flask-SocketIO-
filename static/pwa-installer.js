/**
 * DSA MESSENGER - BULLETPROOF PWA INSTALLER
 * Handles beforeinstallprompt, in-app banner promotion, iOS instructions, and service worker registration.
 */

(function () {
    let deferredPrompt = null;
    const DISMISS_KEY = "dsa_pwa_install_dismissed_at";
    const DISMISS_HOURS = 24;

    function isStandalone() {
        return (
            window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true ||
            document.referrer.includes("android-app://")
        );
    }

    function isIOS() {
        const ua = window.navigator.userAgent.toLowerCase();
        return /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    }

    // 1. Service Worker Registration
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("/service-worker.js", { scope: "/" })
                .then(reg => {
                    // Check for SW updates
                    reg.update().catch(() => {});
                })
                .catch(err => {
                    console.warn("[PWA] Service Worker registration failed:", err);
                });
        });
    }

    // 2. Listen for beforeinstallprompt
    window.addEventListener("beforeinstallprompt", e => {
        // Prevent default mini-infobar
        e.preventDefault();
        deferredPrompt = e;
        window.deferredPWAInstallPrompt = e;

        // Reveal any manual install buttons in UI
        document.querySelectorAll(".pwa-install-btn, #pwaInstallMenuItem, #pwaInstallDropdownItem").forEach(el => {
            el.style.display = "";
            el.classList.remove("hidden");
        });

        // Automatically show floating prompt banner if not recently dismissed
        if (!isStandalone() && shouldShowBanner()) {
            showInstallBanner();
        }
    });

    // 3. Listen for appinstalled
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        window.deferredPWAInstallPrompt = null;
        hideInstallBanner();
        document.querySelectorAll(".pwa-install-btn, #pwaInstallMenuItem, #pwaInstallDropdownItem").forEach(el => {
            el.style.display = "none";
        });
        showPWAToast("DSA Messenger installed successfully!");
    });

    function shouldShowBanner() {
        const dismissedAt = localStorage.getItem(DISMISS_KEY);
        if (!dismissedAt) return true;
        const diffMs = Date.now() - parseInt(dismissedAt, 10);
        return diffMs > DISMISS_HOURS * 60 * 60 * 1000;
    }

    function showInstallBanner() {
        if (document.getElementById("pwaInstallBanner") || isStandalone()) return;

        const banner = document.createElement("div");
        banner.id = "pwaInstallBanner";
        banner.className = "pwa-install-banner";
        banner.innerHTML = `
            <div class="pwa-banner-header">
                <img src="/static/icons/dsa-logo-192x192.png" alt="DSA Logo" class="pwa-banner-icon">
                <div class="pwa-banner-info">
                    <h4 class="pwa-banner-title">Install DSA Messenger</h4>
                    <p class="pwa-banner-desc">Add to your Home Screen for faster access, full-screen chatting and notifications.</p>
                </div>
                <button type="button" class="pwa-banner-close" id="pwaBannerCloseBtn" title="Dismiss">&times;</button>
            </div>
            <div class="pwa-banner-actions">
                <button type="button" class="pwa-btn-install" id="pwaBannerInstallBtn">
                    <i class="ri-download-cloud-2-line"></i> Install App
                </button>
                <button type="button" class="pwa-btn-dismiss" id="pwaBannerDismissBtn">Later</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById("pwaBannerInstallBtn")?.addEventListener("click", () => {
            triggerPWAInstall();
        });

        const dismiss = () => {
            localStorage.setItem(DISMISS_KEY, Date.now().toString());
            hideInstallBanner();
        };

        document.getElementById("pwaBannerCloseBtn")?.addEventListener("click", dismiss);
        document.getElementById("pwaBannerDismissBtn")?.addEventListener("click", dismiss);
    }

    function hideInstallBanner() {
        const banner = document.getElementById("pwaInstallBanner");
        if (banner) {
            banner.style.opacity = "0";
            banner.style.transform = "translateY(20px)";
            setTimeout(() => banner.remove(), 250);
        }
    }

    // 4. Global Install Trigger Function
    window.triggerPWAInstall = async function (e) {
        if (e && e.preventDefault) e.preventDefault();

        if (isStandalone()) {
            showPWAToast("DSA Messenger is already installed on this device.");
            return;
        }

        // Native prompt available (Chrome / Edge / Android)
        if (deferredPrompt) {
            try {
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === "accepted") {
                    hideInstallBanner();
                }
                deferredPrompt = null;
                window.deferredPWAInstallPrompt = null;
            } catch (err) {
                console.error("[PWA] Error showing install prompt:", err);
            }
            return;
        }

        // iOS Safari Instructions
        if (isIOS()) {
            showIOSModal();
            return;
        }

        // Insecure context (HTTP over LAN IP)
        if (!window.isSecureContext && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
            showInsecureContextModal();
            return;
        }

        // Fallback for Chromium when prompt has already been dismissed or not ready
        showPWAToast("To install: Open browser menu (⋮) and tap 'Install app' or 'Add to Home screen'.");
    };

    function showIOSModal() {
        if (document.getElementById("pwaIosModal")) return;

        const modal = document.createElement("div");
        modal.id = "pwaIosModal";
        modal.className = "pwa-ios-modal-overlay";
        modal.innerHTML = `
            <div class="pwa-ios-modal-sheet">
                <div class="pwa-ios-header">
                    <h3>Install DSA Messenger on iOS</h3>
                    <button type="button" class="pwa-banner-close" onclick="document.getElementById('pwaIosModal').remove()">&times;</button>
                </div>
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">1</span>
                    <p class="pwa-ios-step-text">Tap the <strong>Share</strong> button <i class="ri-share-box-line" style="font-size:16px; color:#008069;"></i> in your Safari toolbar at the bottom of the screen.</p>
                </div>
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">2</span>
                    <p class="pwa-ios-step-text">Scroll down the menu and select <strong>Add to Home Screen</strong> <i class="ri-add-box-line" style="font-size:16px; color:#008069;"></i>.</p>
                </div>
                <div class="pwa-ios-step">
                    <span class="pwa-ios-step-num">3</span>
                    <p class="pwa-ios-step-text">Tap <strong>Add</strong> in the top right corner. The app icon will appear on your Home Screen.</p>
                </div>
                <button type="button" class="pwa-ios-done-btn" onclick="document.getElementById('pwaIosModal').remove()">Got it</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener("click", evt => {
            if (evt.target === modal) modal.remove();
        });
    }

    function showInsecureContextModal() {
        if (document.getElementById("pwaInsecureModal")) return;

        const modal = document.createElement("div");
        modal.id = "pwaInsecureModal";
        modal.className = "pwa-ios-modal-overlay";
        modal.innerHTML = `
            <div class="pwa-ios-modal-sheet" style="border-top: 4px solid #f59e0b;">
                <div class="pwa-ios-header">
                    <h3 style="color:#b45309;"><i class="ri-alert-fill"></i> HTTPS / Secure Context Required</h3>
                    <button type="button" class="pwa-banner-close" onclick="document.getElementById('pwaInsecureModal').remove()">&times;</button>
                </div>
                <p style="font-size:13px; color:#475569; margin:0; line-height:1.45;">
                    Browser security policies (Chrome & Edge) block the 1-click Install Prompt on plain HTTP IP addresses like <code>${location.host}</code>.
                </p>
                <div class="pwa-ios-step" style="background:#fffbeb; border-color:#fde68a;">
                    <span class="pwa-ios-step-num" style="background:#d97706;">A</span>
                    <p class="pwa-ios-step-text">
                        <strong>Test on Localhost:</strong> Access the app via <code>http://localhost:5005</code> or <code>http://127.0.0.1:5005</code> on this computer, where Chrome treats it as secure and enables the install button!
                    </p>
                </div>
                <div class="pwa-ios-step" style="background:#fffbeb; border-color:#fde68a;">
                    <span class="pwa-ios-step-num" style="background:#d97706;">B</span>
                    <p class="pwa-ios-step-text">
                        <strong>For Mobile Chrome:</strong> In Chrome address bar, open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, add <code>http://${location.host}</code>, enable it, and restart Chrome.
                    </p>
                </div>
                <div class="pwa-ios-step" style="background:#fffbeb; border-color:#fde68a;">
                    <span class="pwa-ios-step-num" style="background:#d97706;">C</span>
                    <p class="pwa-ios-step-text">
                        <strong>Manual Install:</strong> Tap the 3 dots (⋮) in your mobile browser and select <strong>Install app</strong> or <strong>Add to Home Screen</strong>.
                    </p>
                </div>
                <button type="button" class="pwa-ios-done-btn" style="background:#d97706;" onclick="document.getElementById('pwaInsecureModal').remove()">Understood</button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener("click", evt => {
            if (evt.target === modal) modal.remove();
        });
    }

    function showPWAToast(msg) {
        const toast = document.createElement("div");
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: #0f172a;
            color: #ffffff;
            padding: 10px 18px;
            border-radius: 20px;
            font-size: 13.5px;
            font-weight: 500;
            z-index: 1000001;
            box-shadow: 0 4px 16px rgba(0,0,0,0.25);
            animation: pwaFadeIn 0.2s ease;
        `;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = "0";
            toast.style.transition = "opacity 0.3s ease";
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
})();
