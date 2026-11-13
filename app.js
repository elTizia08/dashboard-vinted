const $ = id => document.getElementById(id);
const eur = n => n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
let data = null, sortKey = "views", sortDir = -1;

// Les titres viennent de Vinted : on n'utilise JAMAIS innerHTML, seulement textContent.
function el(tag, props, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, props || {});
  kids.flat().forEach(k => e.append(k));
  return e;
}

function show(t) {
  $("dash").classList.toggle("show", t === "dash");
  $("w").classList.toggle("show", t === "vinted");
  document.querySelectorAll("#bar [data-t]").forEach(b => b.classList.toggle("on", b.dataset.t === t));
}
document.querySelectorAll("#bar [data-t]").forEach(b => b.onclick = () => show(b.dataset.t));

function render() {
  const d = $("dash"); d.replaceChildren();
  if (!data) { d.append(el("p", { textContent: "Aucune donnée. Connecte-toi dans l'onglet Vinted, puis clique sur « Actualiser »." })); return; }
  const items = data.items || [];
  const active = items.filter(i => !i.sold);
  const sold = items.filter(i => i.sold);
  const unread = (data.convs || []).filter(c => c.unread).length;
  const k = (label, val) => el("div", { className: "k" }, el("span", { textContent: label }), el("b", { textContent: val }));
  d.append(el("div", { className: "kpis" },
    k("Solde disponible", eur(data.balance && data.balance.available)),
    k("En attente", eur(data.balance && data.balance.pending)),
    k("Annonces actives", String(active.length)),
    k("Vendus (visibles)", String(sold.length)),
    k("Vues totales", String(active.reduce((s, i) => s + (i.views || 0), 0))),
    k("Favoris totaux", String(active.reduce((s, i) => s + (i.favs || 0), 0))),
    k("Valeur du stock", eur(active.reduce((s, i) => s + (i.price || 0), 0))),
    k("Messages non lus", String(unread)),
    k("Avis (positifs)", data.account ? data.account.positive + " / " + data.account.feedback : "—")
  ));

  d.append(el("h3", { textContent: "Mes annonces" }));
  const rows = [...active].sort((a, b) => ((a[sortKey] ?? 0) > (b[sortKey] ?? 0) ? 1 : -1) * sortDir);
  const th = (label, key) => { const h = el("th", { textContent: label + (sortKey === key ? (sortDir > 0 ? " ▲" : " ▼") : "") }); h.onclick = () => { sortDir = sortKey === key ? -sortDir : -1; sortKey = key; render(); }; return h; };
  const t = el("table", {}, el("tr", {}, th("Titre", "title"), th("Prix", "price"), th("Vues", "views"), th("Favoris", "favs"), el("th", { textContent: "Statut" })));
  rows.forEach(i => {
    const first = el("td", {});
    if (i.photo && /^https:\/\//.test(i.photo)) first.append(el("img", { src: i.photo }));
    first.append(i.title);
    const status = el("td", {});
    if (i.reserved) status.append(el("span", { className: "tag", textContent: "réservé" }));
    if (i.hidden) status.append(el("span", { className: "tag", textContent: "masqué" }));
    t.append(el("tr", {}, first, el("td", { textContent: eur(i.price) }), el("td", { textContent: String(i.views) }), el("td", { textContent: String(i.favs) }), status));
  });
  d.append(t);

  if ((data.convs || []).some(c => c.unread)) {
    d.append(el("h3", { textContent: "Conversations non lues" }));
    data.convs.filter(c => c.unread).forEach(c => d.append(el("p", { textContent: c.who + " — " + c.about })));
  }
  $("st").textContent = "Dernière mise à jour : " + new Date(data.at).toLocaleString("fr-FR");
}

$("sync").onclick = async () => {
  $("st").textContent = "Lecture en cours…";
  const r = await window.vt.sync();
  if (r && r.error) { $("st").textContent = r.error; return; }
  data = r; render();
};
$("folder").onclick = () => window.vt.openDataFolder();

(async () => { data = await window.vt.load(); render(); show("dash"); })();
