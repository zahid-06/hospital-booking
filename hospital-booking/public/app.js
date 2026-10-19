const $ = (s) => document.querySelector(s);
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
const nice = (d) => new Date(d + "T12:00:00").toLocaleDateString(undefined, {weekday:"short", day:"numeric", month:"short"});

async function api(path, opts = {}) {
  const r = await fetch("/api" + path, { headers: {"Content-Type": "application/json"}, ...opts });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}

let docs = [], S = { doc: null, time: "" };

/* Tabs */
document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("on", x === b));
  ["book","mine","staff"].forEach((t) => $("#" + t).hidden = t !== b.dataset.tab);
});

/* Doctors */
function drawDocs() {
  const spec = $("#spec").value;
  $("#docs").innerHTML = docs.filter((d) => !spec || d.specialty === spec).map((d) =>
    `<button type="button" class="doc${S.doc && S.doc.id === d.id ? " on" : ""}" data-id="${d.id}">${esc(d.name)}<small>${esc(d.specialty)}. ${d.days.map((n) => DAYS[n]).join(", ")}, ${d.start} to ${d.end}</small></button>`).join("");
}
$("#spec").onchange = drawDocs;
$("#docs").onclick = (e) => {
  const b = e.target.closest("[data-id]"); if (!b) return;
  S.doc = docs.find((d) => d.id === +b.dataset.id); S.time = "";
  drawDocs(); loadSlots();
};

/* Slots */
async function loadSlots() {
  const box = $("#slots"), date = $("#date").value;
  if (!S.doc || !date) { box.innerHTML = '<p class="msg">Choose a doctor and a date to see times.</p>'; return; }
  try {
    const slots = await api(`/slots?doctorId=${S.doc.id}&date=${date}`);
    if (!slots.length) { box.innerHTML = `<p class="msg">${esc(S.doc.name)} doesn’t see patients on this day. Available: ${S.doc.days.map((n) => DAYS[n]).join(", ")}.</p>`; return; }
    if (S.time && !slots.some((s) => s.time === S.time && s.available)) S.time = "";
    box.innerHTML = '<div class="grid">' + slots.map((s) => `<button type="button" class="slot${S.time === s.time ? " on" : ""}" data-t="${s.time}"${s.available ? "" : " disabled"}>${s.time}</button>`).join("") + "</div>";
  } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}
$("#date").onchange = () => { S.time = ""; loadSlots(); };
$("#slots").onclick = (e) => {
  const b = e.target.closest("[data-t]"); if (!b || b.disabled) return;
  S.time = b.dataset.t; loadSlots();
};

/* Book */
$("#f").onsubmit = async (e) => {
  e.preventDefault(); $("#err").textContent = "";
  if (!S.doc) return $("#err").textContent = "Choose a doctor.";
  if (!$("#date").value) return $("#err").textContent = "Choose a date.";
  if (!S.time) return $("#err").textContent = "Choose a time.";
  try {
    const a = await api("/appointments", { method: "POST", body: JSON.stringify({
      doctorId: S.doc.id, date: $("#date").value, time: S.time,
      patientName: $("#name").value, phone: $("#phone").value, reason: $("#reason").value }) });
    $("#done").hidden = false;
    $("#done").innerHTML = `<strong>Appointment booked</strong><br>${esc(a.patientName)} with ${esc(a.doctorName)} (${esc(a.specialty)}) on ${nice(a.date)} at ${a.time}.<br>Reference: <strong>${a.ref}</strong>. Look up or cancel it under My appointments using your phone number.`;
    S.time = ""; $("#f").reset(); loadSlots(); $("#done").scrollIntoView({behavior:"smooth"});
  } catch (e) { $("#err").textContent = e.message; loadSlots(); }
};

/* Lists (patient + staff) */
function draw(el, list) {
  el.innerHTML = list.length ? list.map((a) => `<li class="${a.status === "cancelled" ? "cx" : ""}"><div><strong>${nice(a.date)}, ${a.time}</strong><small>${esc(a.doctorName)}, ${esc(a.specialty)}</small><small>${esc(a.patientName)}, ${esc(a.phone)}${a.reason ? ". " + esc(a.reason) : ""}</small><small>${a.ref}${a.status === "cancelled" ? " (cancelled)" : ""}</small></div>${a.status === "booked" ? `<div><button class="btn sm" data-cancel="${a.id}">Cancel</button></div>` : ""}</li>`).join("") : '<li class="msg">No appointments found.</li>';
}
async function lookup(kind) {
  const el = kind === "mine" ? $("#mlist") : $("#slist");
  const q = kind === "mine" ? "phone=" + encodeURIComponent($("#mphone").value) : "date=" + $("#sdate").value;
  try { draw(el, await api("/appointments?" + q)); } catch (e) { el.innerHTML = `<li class="err">${esc(e.message)}</li>`; }
}
$("#mgo").onclick = () => lookup("mine");
$("#sgo").onclick = () => lookup("staff");
[["#mlist","mine"],["#slist","staff"]].forEach(([sel, kind]) => $(sel).onclick = async (e) => {
  const id = e.target.dataset.cancel; if (!id || !confirm("Cancel this appointment?")) return;
  try { await api("/appointments/" + id, { method: "DELETE" }); lookup(kind); loadSlots(); } catch (err) { alert(err.message); }
});

/* Init */
(async () => {
  const now = new Date(), max = new Date(); max.setDate(max.getDate() + 30);
  $("#date").min = $("#sdate").min = iso(now); $("#date").max = iso(max);
  $("#sdate").min = ""; $("#sdate").value = iso(now);
  docs = await api("/doctors");
  [...new Set(docs.map((d) => d.specialty))].forEach((s) => $("#spec").insertAdjacentHTML("beforeend", `<option>${esc(s)}</option>`));
  drawDocs();
})();
