const ROBLOX_COOKIE_URL = "https://www.roblox.com";
const ROBLOX_COOKIE_NAME = ".ROBLOSECURITY";

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
