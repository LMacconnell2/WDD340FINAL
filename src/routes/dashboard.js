import express from 'express';
import db from '../models/db.js';
import bcrypt from 'bcrypt';
import { requireLogin } from '../middleware/index.js';

const router = express.Router();

//this is for the dashboard
router.get('/dashboard', requireLogin, (req, res) => {
  if (req.session.permission_id != 0)
  {
    res.redirect('/profile');
  }
  else
  {
    const title = "I-Reserve Dashboard";
    res.render('dashboard/dashboard', { title, loggedIn: req.session.userId ? true : false });
  }
});

//this is for the dashboard 
router.post('/dashboard/room', async (req, res) => {
  const { room_id, building_id, floor_number, max_occupancy, room_desc, permission_id } = req.body;
  console.log("POST dashboard ROOM running");

  // === VALIDATION ===
  const errors = [];

  // room_id: must be non-empty string, 10 chars max
  if (!room_id || typeof room_id !== 'string' || room_id.length > 10) {
    errors.push("Room ID must be a non-empty string up to 10 characters.");
  }

  // building_id: must be non-empty string, 3 chars max
  if (!building_id || typeof building_id !== 'string' || building_id.length > 3) {
    errors.push("Building ID must be a non-empty string up to 3 characters.");
  }

  // floor_number: must be an integer (0 or positive)
  if (!Number.isInteger(Number(floor_number)) || Number(floor_number) < 0) {
    errors.push("Floor number must be a non-negative integer.");
  }

  // max_occupancy: must be a positive integer
  if (!Number.isInteger(Number(max_occupancy)) || Number(max_occupancy) <= 0) {
    errors.push("Max occupancy must be a positive integer.");
  }

  // room_desc: optional, but must be a string if present
  if (room_desc && typeof room_desc !== 'string') {
    errors.push("Room description must be text.");
  }

  // permission_id: must be a positive integer
  if (!Number.isInteger(Number(permission_id)) || Number(permission_id) < 0 || Number(permission_id) > 5) {
    errors.push("Permission ID must be a positive integer less than 5.");
  }

  if (errors.length > 0) {
    console.error("Validation failed:", errors);
    req.flash('error_msg', errors.join(" "));
    return res.redirect('/dashboard');
  }

  try {
    await db.query(`
      INSERT INTO room (room_id, building_id, floor_number, max_occupancy, room_desc, permission_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (room_id) DO UPDATE
      SET building_id = EXCLUDED.building_id,
          floor_number = EXCLUDED.floor_number,
          max_occupancy = EXCLUDED.max_occupancy,
          room_desc = EXCLUDED.room_desc,
          permission_id = EXCLUDED.permission_id;
    `, [room_id, building_id, floor_number, max_occupancy, room_desc, permission_id]);

    res.redirect('/dashboard');
  } catch (err) {
    console.error("DB insert/update error:", err);
    res.status(500).send('Room creation or update failed.');
  }
});

//this is for the dashboard 
router.post('/dashboard/building', async (req, res) => {
  let { building_id, building_name, time_open, time_closed } = req.body;

  // Convert to uppercase and trim whitespace for consistency
  building_id = building_id?.trim().toUpperCase();
  building_name = building_name?.trim();
  time_open = time_open?.trim();
  time_closed = time_closed?.trim();

  // Validation
  const errors = [];

  if (!building_id || building_id.length !== 3) {
    errors.push("Building ID must be exactly 3 characters.");
  }

  if (!building_name || building_name.length === 0 || building_name.length > 45) {
    errors.push("Building name is required and must be 1–45 characters long.");
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/; // Matches HH:MM or HH:MM:SS

  if (!timeRegex.test(time_open)) {
    errors.push("Opening time must be a valid 24-hour format (HH:MM or HH:MM:SS).");
  }

  if (!timeRegex.test(time_closed)) {
    errors.push("Closing time must be a valid 24-hour format (HH:MM or HH:MM:SS).");
  }

  if (errors.length > 0) {
    req.flash('error_msg', errors.join(" "));
    return res.redirect('/dashboard');
  }

  try {
    await db.query(`
      INSERT INTO building (building_id, building_name, time_open, time_closed)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (building_id) DO UPDATE
      SET building_name = EXCLUDED.building_name,
          time_open = EXCLUDED.time_open,
          time_closed = EXCLUDED.time_closed;
    `, [building_id, building_name, time_open, time_closed]);

    res.redirect('/dashboard');
  } catch (err) {
    console.error("DB insert/update error:", err);
    res.status(500).send('Building creation or update failed.');
  }
});

//this is for the dashboard 
router.post('/dashboard/users', async (req, res) => {
  let { i_number, fname, lname, password, email, permission_id } = req.body;
  console.log("POST dashboard USERS running");

    // Trim and normalize inputs
  i_number = i_number?.trim();
  fname = fname?.trim();
  lname = lname?.trim();
  email = email?.trim().toLowerCase();

  const errors = [];

  // Validation
  if (!i_number || isNaN(i_number) || i_number.length !== 9) {
    errors.push("I-Number must be a 9-digit number.");
  }

  if (!fname || fname.length > 45) {
    errors.push("First name is required and must be ≤ 45 characters.");
  }

  if (!lname || lname.length > 45) {
    errors.push("Last name is required and must be ≤ 45 characters.");
  }

  if (!email || email.length > 45 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("A valid email is required and must be ≤ 45 characters.");
  }

  if (!password || password.length < 6) {
    errors.push("Password must be at least 6 characters long.");
  }

  if (!permission_id || isNaN(permission_id)) {
    errors.push("Permission ID must be a valid number.");
  }

  // If validation fails
  if (errors.length > 0) {
    req.flash('error_msg', errors.join(" "));
    return res.redirect('/dashboard');
  }

  const hashedPassword = await bcrypt.hash(password, 10); //Hash the entered password before saving to DB

  try {
    await db.query(`
      INSERT INTO users (i_number, fname, lname, password, email, permission_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (i_number) DO UPDATE
      SET fname = EXCLUDED.fname,
          lname = EXCLUDED.lname,
          password = EXCLUDED.password,
          email = EXCLUDED.email,
          permission_id = EXCLUDED.permission_id;
    `, [i_number, fname, lname, hashedPassword, email, permission_id]);

    res.redirect('/dashboard');
  } catch (err) {
    console.error("DB insert/update error:", err);
    res.status(500).send('Users creation or update failed.');
  }
});

// this is for /messages. 
router.get('/messages', async (req, res) => {
  try {
    // Ensure only admins can access this, if needed
    if (req.session.permission_id !== 0) {
      req.flash('error_msg', 'Only administrators may view this page.')
      return res.redirect('/profile');
    }

    const result = await db.query(`
      SELECT message_title, return_email, message 
      FROM message 
      ORDER BY message_title;
    `);

    res.render('dashboard/messages', {
      title: "I-Reserve Messages",
      messages: result.rows,
      loggedIn: req.session.userId ? true : false
    });
  } catch (err) {
    console.error("Error fetching messages:", err);
    req.flash('error_msg', 'Failed to load messages.')
    return res.redirect('/profile');
  }
});


export default router;
