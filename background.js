const ROBLOX_COOKIE_URL = "https://www.roblox.com";
const ROBLOX_COOKIE_NAME = ".ROBLOSECURITY";
const STORAGE_KEY = "roblox_accounts";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getCurrentCookie") {
    chrome.cookies.get({ url: ROBLOX_COOKIE_URL, name: ROBLOX_COOKIE_NAME }, (cookie) => {
      sendResponse({ cookie: cookie ? cookie.value : null });
    });
    return true;
  }

  if (msg.action === "setCookie") {
    chrome.cookies.set({
      url: ROBLOX_COOKIE_URL,
      name: ROBLOX_COOKIE_NAME,
      value: msg.value,
      domain: ".roblox.com",
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "no_restriction",
      expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
    }, (cookie) => {
      sendResponse({ success: !!cookie });
    });
    return true;
  }

  if (msg.action === "removeCookie") {
    chrome.cookies.remove({ url: ROBLOX_COOKIE_URL, name: ROBLOX_COOKIE_NAME }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (msg.action === "fetchUsername") {
    fetch("https://users.roblox.com/v1/users/authenticated", {
      headers: { Cookie: `${ROBLOX_COOKIE_NAME}=${msg.cookie}` },
      credentials: "include"
    })
      .then(r => r.json())
      .then(data => sendResponse({ username: data.name || null, displayName: data.displayName || null, id: data.id || null }))
      .catch(() => sendResponse({ username: null }));
    return true;
  }
});

// ── Startup validation ─────────────────────────────────────────────────────
// Runs when Chrome starts or the extension is installed/updated.
// Swaps each saved cookie in sequentially, checks the Roblox auth endpoint,
// refreshes the avatar, captures any rotated cookie, then restores the original.
chrome.runtime.onStartup.addListener(validateAllAccounts);
chrome.runtime.onInstalled.addListener(validateAllAccounts);

// ── Helpers ────────────────────────────────────────────────────────────────
function getCookie() {
  return new Promise((resolve) =>
    chrome.cookies.get({ url: ROBLOX_COOKIE_URL, name: ROBLOX_COOKIE_NAME }, resolve)
  );
}

function applyCookieValue(value) {
  return new Promise((resolve) => {
    if (!value) {
      chrome.cookies.remove({ url: ROBLOX_COOKIE_URL, name: ROBLOX_COOKIE_NAME }, resolve);
    } else {
      chrome.cookies.set({
        url: ROBLOX_COOKIE_URL,
        name: ROBLOX_COOKIE_NAME,
        value,
        domain: ".roblox.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction",
        expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
      }, resolve);
    }
  });
}

// ── Main validation function ───────────────────────────────────────────────
async function validateAllAccounts() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const accounts = data[STORAGE_KEY];
  if (!accounts || accounts.length === 0) return;

  // Save current cookie so we can restore it after validation
  const currentCookie = await getCookie();
  const originalValue = currentCookie ? currentCookie.value : null;

  let changed = false;

  for (const acc of accounts) {
    try {
      await applyCookieValue(acc.cookie);

      const resp = await fetch("https://users.roblox.com/v1/users/authenticated", {
        credentials: "include"
      });

      if (resp.ok) {
        const userData = await resp.json();

        if (userData.id && userData.id === acc.userId) {
          acc.isValid = true;

          // Capture cookie if Roblox silently rotated it during the request
          const liveCookie = await getCookie();
          if (liveCookie && liveCookie.value !== acc.cookie) {
            acc.cookie = liveCookie.value;
          }

          // Refresh the avatar headshot
          try {
            const avatarResp = await fetch(
              `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${acc.userId}&size=150x150&format=Png&isCircular=true`
            );
            const avatarData = await avatarResp.json();
            if (avatarData.data?.[0]?.imageUrl) {
              acc.avatarUrl = avatarData.data[0].imageUrl;
            }
          } catch { /* avatar refresh failure is non-fatal */ }

          changed = true;
        } else {
          // The API returned a different user — cookie is invalid or mismatched
          acc.isValid = false;
          changed = true;
        }
      } else if (resp.status === 401 || resp.status === 403) {
        // Roblox explicitly rejected the session
        acc.isValid = false;
        changed = true;
      }
      // 5xx / network-layer errors: leave isValid unchanged (server-side issue, not our cookie)

    } catch {
      // True network failure (offline, DNS, etc.) — don't mark invalid, leave state as-is
    }
  }

  // Always restore the original cookie regardless of what happened
  await applyCookieValue(originalValue);

  if (changed) {
    await chrome.storage.local.set({ [STORAGE_KEY]: accounts });
  }
}
