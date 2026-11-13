// Dashboard Vinted LOCAL : aucune donnée ne quitte ton PC, aucun serveur distant, aucun envoi.
// Seules requêtes réseau : celles de la page Vinted elle-même (webview) + lectures GET faites depuis cette page.
const { app, BrowserWindow, ipcMain, webContents, shell } = require("electron");
const fs = require("fs"), path = require("path");

const DATA = () => path.join(app.getPath("userData"), "data.json");
const isVinted = u => /^https:\/\/([a-z0-9-]+\.)*vinted\.[a-z.]+(\/|$)/i.test(String(u));
let win;

// --- Sécurité : le webview ne peut aller que sur Vinted, sans preload ni accès Node ---
app.on("web-contents-created", (_, wc) => {
  wc.on("will-attach-webview", (e, wp, params) => {
    delete wp.preload;
    wp.nodeIntegration = false;
    wp.contextIsolation = true;
    wp.sandbox = true;
    if (!isVinted(params.src)) e.preventDefault();
  });
  if (wc.getType() === "webview") {
    wc.on("will-navigate", (e, url) => { if (!isVinted(url)) e.preventDefault(); });
    wc.on("will-redirect", (e, url) => { if (!isVinted(url)) e.preventDefault(); });
    wc.setWindowOpenHandler(({ url }) => { if (isVinted(url)) wc.loadURL(url); return { action: "deny" }; });
  }
});

// --- Script exécuté DANS la page Vinted : uniquement des GET (lecture seule) ---
const SYNC = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = { accept: "application/json" };
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta && meta.content) H["x-csrf-token"] = meta.content;
  const num = p => p == null ? null : (typeof p === "object" ? Number(p.amount) : Number(p));
  const diag = []; let authFail = false;
  const get = async u => {
    try {
      const r = await fetch(u, { credentials: "include", headers: H });
      diag.push(u.split("?")[0] + " -> " + r.status);
      if (r.status === 401 || r.status === 403) authFail = true;
      return r.ok ? await r.json() : null;
    } catch (e) { diag.push(u.split("?")[0] + " erreur"); return null; }
  };
  const me = await get("/api/v2/users/current");
  const u = me && me.user;
  if (!u) return { error: authFail ? "Pas connecté : connecte-toi dans l'onglet Vinted." : "Lecture impossible.", diag };
  await sleep(600);
  let items = [];
  for (let pg = 1; pg <= 3; pg++) {
    const w = await get("/api/v2/wardrobe/" + u.id + "/items?page=" + pg + "&per_page=96&order=relevance");
    const l = (w && (w.items || w.wardrobe_items)) || [];
    items = items.concat(l);
    if (l.length < 96) break;
    await sleep(700);
  }
  items = items.map(i => ({
    id: String(i.id), title: i.title || "", price: num(i.price ?? i.price_numeric),
    views: i.view_count ?? 0, favs: i.favourite_count ?? 0,
    sold: i.is_closed === true, reserved: !!i.is_reserved, hidden: !!i.is_hidden,
    photo: (i.photo && i.photo.url) || "", url: i.url ? (i.url.startsWith("http") ? i.url : location.origin + i.url) : ""
  }));
  await sleep(600);
  const ib = await get("/api/v2/inbox?page=1&per_page=40");
  const convs = ((ib && (ib.conversations || ib.inbox)) || []).map(c => ({
    id: String(c.id), who: (c.opposite_user && c.opposite_user.login) || "?", unread: !!c.unread, about: c.description || c.subtitle || ""
  }));
  await sleep(600);
  const b = await get("/api/v2/users/" + u.id + "/balance");
  const ub = b && b.user_balance;
  return {
    at: Date.now(), items, convs,
    balance: ub ? { available: num(ub.available_amount), pending: num(ub.escrow_amount) } : null,
    account: { login: u.login, feedback: u.feedback_count, positive: u.positive_feedback_count, negative: u.negative_feedback_count, followers: u.followers_count },
    diag
  };
})()`;

ipcMain.handle("load", () => { try { return JSON.parse(fs.readFileSync(DATA(), "utf8")); } catch { return null; } });

ipcMain.handle("sync", async () => {
  const wc = webContents.getAllWebContents().find(w => w.getType() === "webview" && isVinted(w.getURL()));
  if (!wc) return { error: "Ouvre l'onglet Vinted et connecte-toi d'abord." };
  try {
    const r = await Promise.race([
      wc.executeJavaScript(SYNC),
      new Promise(res => setTimeout(() => res({ error: "Vinted ne répond pas, réessaie." }), 60000))
    ]);
    if (r && !r.error) {
      fs.mkdirSync(path.dirname(DATA()), { recursive: true });
      fs.writeFileSync(DATA() + ".tmp", JSON.stringify(r));
      fs.renameSync(DATA() + ".tmp", DATA());
    }
    return r;
  } catch (e) { return { error: "Lecture impossible : " + e.message }; }
});

ipcMain.handle("open-data-folder", () => shell.showItemInFolder(DATA()));

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1400, height: 900, title: "Dashboard Vinted", backgroundColor: "#12151c",
    webPreferences: { preload: path.join(__dirname, "preload.js"), webviewTag: true, contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", e => e.preventDefault());
  win.loadFile(path.join(__dirname, "index.html"));
});
app.on("window-all-closed", () => app.quit());
