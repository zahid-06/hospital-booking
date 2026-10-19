# CityCare Hospital: Appointment Booking

Plain HTML/CSS/JS frontend + a small Node.js/Express backend. Appointments are saved in `data.json`.

## Run
1. Install Node.js (v18+)
2. `npm install`
3. `npm start`
4. Open http://localhost:3000

## Features
- Pick a specialty and doctor, then a date and a 30-minute slot (lunch break 13:00-14:00 is skipped)
- Slots already booked, past, or within 30 minutes are disabled
- Booking validates on the server; double-booking a slot returns 409
- Patients look up and cancel appointments by phone number
- Staff view lists all appointments for a day and can cancel them

## API
- GET    /api/doctors
- GET    /api/slots?doctorId=1&date=YYYY-MM-DD
- POST   /api/appointments   { doctorId, date, time, patientName, phone, reason }
- GET    /api/appointments?phone=...   or   ?date=YYYY-MM-DD
- DELETE /api/appointments/:id   (marks as cancelled, frees the slot)

## Files
- server.js: routes, validation, JSON-file storage
- public/index.html: page structure (HTML)
- public/style.css: all styling
- public/app.js: all frontend logic (fetch calls to the API)

## Ideas to extend
Staff login, doctor leave days, email/SMS reminders, a database (SQLite) instead of data.json.
