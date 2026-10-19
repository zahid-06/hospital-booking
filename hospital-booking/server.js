const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const DB = path.join(__dirname, "data.json"); // appointments are stored here
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const DOCTORS = [
  { id: 1, name: "Dr. Asha Rao", specialty: "General Physician", days: [1, 2, 3, 4, 5, 6], start: "09:00", end: "17:00" },
  { id: 2, name: "Dr. Imran Khan", specialty: "Cardiologist", days: [1, 3, 5], start: "10:00", end: "16:00" },
  { id: 3, name: "Dr. Meera Nair", specialty: "Dermatologist", days: [2, 4, 6], start: "09:00", end: "15:00" },
  { id: 4, name: "Dr. Rohan Das", specialty: "Pediatrician", days: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" },
  { id: 5, name: "Dr. Sana Iqbal", specialty: "Orthopedic", days: [2, 3, 5], start: "11:00", end: "17:00" },
  { id: 6, name: "Dr. Vikram Sethi", specialty: "ENT Specialist", days: [1, 4, 6], start: "09:00", end: "13:00" },
];

const load = () => { try { return JSON.parse(fs.readFileSync(DB, "utf8")); } catch { return []; } };
const save = (list) => fs.writeFileSync(DB, JSON.stringify(list, null, 2));
const pad = (n) => String(n).padStart(2, "0");
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mins = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const clock = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const digits = (s) => String(s || "").replace(/\D/g, "");

// 30-minute slots between start and end, with a lunch break 13:00-14:00
function slotTimes(doc, date) {
  const day = new Date(date + "T12:00:00").getDay();
  if (!doc.days.includes(day)) return [];
  const out = [];
  for (let m = mins(doc.start); m < mins(doc.end); m += 30) {
    if (m >= 780 && m < 840) continue;
    out.push(clock(m));
  }
  return out;
}

function dateError(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "Choose a valid date.";
  const today = isoDate(new Date());
  const max = new Date(); max.setDate(max.getDate() + 30);
  if (date < today) return "That date has passed.";
  if (date > isoDate(max)) return "Appointments open up to 30 days ahead.";
  return null;
}

function tooSoon(date, time) {
  const n = new Date();
  return date === isoDate(n) && mins(time) < n.getHours() * 60 + n.getMinutes() + 30;
}

const withDoctor = (a) => {
  const d = DOCTORS.find((x) => x.id === a.doctorId) || {};
  return { ...a, doctorName: d.name, specialty: d.specialty };
};

app.get("/api/doctors", (req, res) => res.json(DOCTORS));

app.get("/api/slots", (req, res) => {
  const doc = DOCTORS.find((d) => d.id === +req.query.doctorId);
  if (!doc) return res.status(404).json({ error: "Doctor not found." });
  const err = dateError(req.query.date);
  if (err) return res.status(400).json({ error: err });
  const booked = load().filter((a) => a.doctorId === doc.id && a.date === req.query.date && a.status === "booked").map((a) => a.time);
  res.json(slotTimes(doc, req.query.date).map((t) => ({ time: t, available: !booked.includes(t) && !tooSoon(req.query.date, t) })));
});

app.post("/api/appointments", (req, res) => {
  const { doctorId, date, time, patientName, phone, reason } = req.body || {};
  const doc = DOCTORS.find((d) => d.id === +doctorId);
  if (!doc) return res.status(400).json({ error: "Choose a doctor." });
  const err = dateError(date);
  if (err) return res.status(400).json({ error: err });
  if (!slotTimes(doc, date).includes(time)) return res.status(400).json({ error: "That time is not available for this doctor." });
  if (tooSoon(date, time)) return res.status(400).json({ error: "Book at least 30 minutes ahead." });
  if (!patientName || patientName.trim().length < 2) return res.status(400).json({ error: "Enter the patient’s full name." });
  if (digits(phone).length < 7) return res.status(400).json({ error: "Enter a phone number with at least 7 digits." });

  const list = load();
  const active = list.filter((a) => a.status === "booked" && a.date === date && a.time === time);
  if (active.some((a) => a.doctorId === doc.id)) return res.status(409).json({ error: "That slot was just taken. Pick another time." });
  if (active.some((a) => digits(a.phone) === digits(phone))) return res.status(409).json({ error: "This phone number already has an appointment at that time." });

  const appt = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ref: "HB-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
    doctorId: doc.id, date, time,
    patientName: patientName.trim(), phone: String(phone).trim(),
    reason: String(reason || "").trim().slice(0, 200),
    status: "booked", createdAt: new Date().toISOString(),
  };
  list.push(appt);
  save(list);
  res.status(201).json(withDoctor(appt));
});

// ?phone=... for a patient, ?date=YYYY-MM-DD for the staff view
app.get("/api/appointments", (req, res) => {
  const { phone, date } = req.query;
  if (!phone && !date) return res.status(400).json({ error: "Provide a phone number or a date." });
  let list = load();
  if (phone) list = list.filter((a) => digits(a.phone) === digits(phone));
  if (date) list = list.filter((a) => a.date === date);
  list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  res.json(list.map(withDoctor));
});

// Cancelling keeps the record but frees the slot
app.delete("/api/appointments/:id", (req, res) => {
  const list = load();
  const a = list.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: "Appointment not found." });
  a.status = "cancelled";
  save(list);
  res.json(withDoctor(a));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hospital booking running at http://localhost:${PORT}`));
