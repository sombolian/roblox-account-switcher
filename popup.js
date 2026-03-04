const $ = (s) => document.querySelector(s);
const STORAGE_KEY = "roblox_accounts";

let accounts = [];
let activeAccountId = null;
let adding = false;
let isInitialRender = true;

// ── Init ──────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadAccounts();
  await detectActiveAccount();
  render();
  isInitialRender = false;
  bindEvents();
});

// ── Storage ───────────────────────────────────────
async function loadAccounts() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  accounts = data[STORAGE_KEY] || [];
}

async function saveAccounts() {
  await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
}

// ── Detect which account is currently active ──────
async function detectActiveAccount() {
  const { cookie } = await sendMessage({ action: "getCurrentCookie" });
  if (!cookie) {
    activeAccountId = null;
    return;
  }
  const match = accounts.find((a) => a.cookie === cookie);
  activeAccountId = match ? match.id : null;
}

// ── Render ────────────────────────────────────────
function render() {
  const list = $("#accountList");
  const empty = $("#emptyState");

  if (accounts.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");
  list.innerHTML = accounts
    .map((acc, i) => {
      const isActive = acc.id === activeAccountId;
      const initial = (acc.username || "?")[0].toUpperCase();
      const avatarContent = acc.avatarUrl
        ? `<img src="${acc.avatarUrl}" alt="">`
        : initial;
      const enterClass = isInitialRender ? "entering" : "";

      return `
      <div class="account-card ${isActive ? "active" : ""} ${enterClass}" data-id="${acc.id}" style="--i: ${i}">
        <div class="account-avatar">${avatarContent}</div>
        <div class="account-info">
          <div class="account-name">${esc(acc.username || "Unknown")}</div>
          <div class="account-display">${esc(acc.displayName ? `@${acc.displayName}` : "")}</div>
        </div>
        ${isActive ? '<span class="account-badge">Active</span>' : ""}
        <div class="account-actions">
          <button class="btn-icon btn-danger" data-action="delete" data-id="${acc.id}" title="Remove">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
              <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
            </svg>
          </button>
        </div>
      </div>`;
    })
    .join("");
}

// ── Events ────────────────────────────────────────
function bindEvents() {
  $("#addBtn").addEventListener("click", addCurrentAccount);

  $("#accountList").addEventListener("click", (e) => {
    const delBtn = e.target.closest("[data-action='delete']");
    if (delBtn) {
      e.stopPropagation();
      showDeleteConfirm(delBtn.dataset.id);
      return;
    }

    const confirmBtn = e.target.closest("[data-action='confirmDelete']");
    if (confirmBtn) {
      e.stopPropagation();
      deleteAccount(confirmBtn.dataset.id);
      return;
    }

    const cancelBtn = e.target.closest("[data-action='cancelDelete']");
    if (cancelBtn) {
      e.stopPropagation();
      render();
      return;
    }

    const card = e.target.closest(".account-card");
    if (card && !card.classList.contains("loading")) {
      switchAccount(card.dataset.id);
    }
  });
}

// ── Add Current Account ───────────────────────────
const ADD_BTN_HTML = `<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
  <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
</svg><span>Add</span>`;

async function addCurrentAccount() {
  if (adding) return;
  adding = true;

  const addBtn = $("#addBtn");
  addBtn.disabled = true;
  addBtn.innerHTML = '<div class="spinner"></div>';

  try {
    const { cookie } = await sendMessage({ action: "getCurrentCookie" });

    if (!cookie) {
      showToast("Not logged into Roblox", "error");
      return;
    }

    if (accounts.some((a) => a.cookie === cookie)) {
      showToast("Account already saved", "error");
      return;
    }

    showToast("Grabbing account info\u2026", "success");

    const userResp = await fetch("https://users.roblox.com/v1/users/authenticated", {
      credentials: "include"
    });
    const userData = await userResp.json();

    if (!userData.name) {
      showToast("Could not resolve account", "error");
      return;
    }

    let avatarUrl = null;
    if (userData.id) {
      try {
        const avatarResp = await fetch(
          `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userData.id}&size=150x150&format=Png&isCircular=true`
        );
        const avatarData = await avatarResp.json();
        if (avatarData.data?.[0]) {
          avatarUrl = avatarData.data[0].imageUrl;
        }
      } catch (e) { /* ignore avatar fetch failure */ }
    }

    const acc = {
      id: crypto.randomUUID(),
      cookie,
      username: userData.name,
      displayName: userData.displayName || userData.name,
      userId: userData.id,
      avatarUrl
    };

    accounts.push(acc);
    await saveAccounts();
    activeAccountId = acc.id;
    render();

    // Animate the newly added card
    const newCard = document.querySelector(`.account-card[data-id="${acc.id}"]`);
    if (newCard) {
      newCard.classList.add("entering");
      newCard.style.setProperty("--i", "0");
    }

    showToast(`Added ${acc.username}`, "success");

  } catch (e) {
    showToast("Failed to grab account", "error");
  } finally {
    adding = false;
    addBtn.disabled = false;
    addBtn.innerHTML = ADD_BTN_HTML;
  }
}

// ── Switch Account ────────────────────────────────
async function switchAccount(id) {
  const acc = accounts.find((a) => a.id === id);
  if (!acc || acc.id === activeAccountId) return;

  const card = document.querySelector(`.account-card[data-id="${id}"]`);
  if (card) card.classList.add("loading");

  const { success } = await sendMessage({ action: "setCookie", value: acc.cookie });

  if (success) {
    activeAccountId = id;
    render();

    // Pulse the newly active card
    const activeCard = document.querySelector(`.account-card[data-id="${id}"]`);
    if (activeCard) {
      activeCard.classList.add("pulse");
      activeCard.addEventListener("animationend", () => {
        activeCard.classList.remove("pulse");
      }, { once: true });
    }

    showToast(`Switched to ${acc.username}`, "success");

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.url?.includes("roblox.com")) {
      chrome.tabs.reload(activeTab.id);
    }
  } else {
    showToast("Failed to switch", "error");
    render();
  }
}

// ── Delete Account ────────────────────────────────
function showDeleteConfirm(id) {
  const card = document.querySelector(`.account-card[data-id="${id}"]`);
  if (!card || card.querySelector(".confirm-overlay")) return;

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <span>Remove?</span>
    <button class="btn btn-danger-solid" data-action="confirmDelete" data-id="${id}">Remove</button>
    <button class="btn btn-ghost" data-action="cancelDelete" data-id="${id}">Cancel</button>
  `;
  card.appendChild(overlay);
}

async function deleteAccount(id) {
  const card = document.querySelector(`.account-card[data-id="${id}"]`);
  const acc = accounts.find((a) => a.id === id);

  // Animate card out before removing
  if (card) {
    card.classList.add("removing");
    await new Promise((r) => setTimeout(r, 280));
  }

  accounts = accounts.filter((a) => a.id !== id);
  await saveAccounts();

  if (id === activeAccountId) activeAccountId = null;

  showToast(`Removed ${acc?.username || "account"}`, "success");
  render();
}

// ── Toast ─────────────────────────────────────────
const TOAST_ICONS = {
  success: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.78 4.97a.75.75 0 00-1.06 0L7 8.69 5.28 6.97a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25a.75.75 0 000-1.06z"/></svg>`,
  error: `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0a8 8 0 110 16A8 8 0 018 0zM5.47 5.47a.75.75 0 011.06 0L8 6.94l1.47-1.47a.75.75 0 111.06 1.06L9.06 8l1.47 1.47a.75.75 0 11-1.06 1.06L8 9.06l-1.47 1.47a.75.75 0 01-1.06-1.06L6.94 8 5.47 6.53a.75.75 0 010-1.06z"/></svg>`
};

let toastTimer;
let toastExitTimer;

function showToast(msg, type = "success") {
  const toast = $("#toast");
  const icon = toast.querySelector(".toast-icon");
  const msgEl = toast.querySelector(".toast-msg");

  icon.innerHTML = TOAST_ICONS[type] || "";
  msgEl.textContent = msg;
  toast.className = `toast ${type}`;

  clearTimeout(toastTimer);
  clearTimeout(toastExitTimer);

  toastTimer = setTimeout(() => {
    toast.classList.add("leaving");
    toastExitTimer = setTimeout(() => toast.classList.add("hidden"), 250);
  }, 2200);
}

// ── Helpers ───────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response) => {
      resolve(response || {});
    });
  });
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
