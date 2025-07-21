import express from 'express';
import db from '../models/db.js';
import { requireLogin } from '../middleware/index.js';

const router = express.Router();

// This is the home page
router.get('/', (req, res) => {
    const title = "I-Reserve Home";
    res.render('index', { title, loggedIn: req.session.userId ? true : false });
});

//this is for the map page
router.get('/map', (req, res) => {
    const title = "I-Reserve Map";
    res.render('map', { title, loggedIn: req.session.userId ? true : false });
});

//this is for the profile page
router.get('/profile', requireLogin, async (req, res) => {
  const permission_id = req.session.permission_id;
  const title = 'Your Profile';
  const i_number = req.session.userId

  try {
    const result = await db.query(
      `SELECT fname, lname, email, i_number, permission_name
       FROM users u
       JOIN permissions p ON u.permission_id = p.permission_id
       WHERE i_number = $1`,
      [i_number]
    );

    if (result.rows.length === 0) {
      req.flash('error_msg', 'User not found.')
      return res.redirect('/login');
    }

    const { fname, lname, email, permission_name } = result.rows[0];

    const reservationResult = await db.query(`
      SELECT reserve_id, room_id, event_name, date, time_start, time_end, event_desc, confirmed
      FROM reservation
      WHERE i_number = $1
      ORDER BY date DESC, time_start ASC
    `, [i_number]);

    const reservations = reservationResult.rows;

    res.render('profile', {
      title,
      fname,
      lname,
      email,
      i_number,
      permission_id,
      permission_name,
      reservations,
      loggedIn: req.session.userId ? true : false
    });

  } catch (err) {
    console.error("Error fetching user profile:", err);
    res.status(500).send("Error loading profile.");
  }
});

//this is for /availability
router.get('/availability', async (req, res) => {
  const { date, building, floor, time_start, time_end } = req.query;

  const values = [];
  let filters = [];

  // === Building Filter ===
  if (building) {
    values.push(`%${building.toUpperCase()}%`);
    filters.push(`UPPER(building_id) LIKE $${values.length}`);
  }

  // === Floor Filter ===
  if (Array.isArray(floor)) {
    const floorConditions = floor.map((_, i) => `floor_number = $${values.length + i + 1}`);
    filters.push(`(${floorConditions.join(" OR ")})`);
    values.push(...floor.map(Number));
  } else if (floor) {
    filters.push(`floor_number = $${values.length + 1}`);
    values.push(Number(floor));
  }

  // === Availability Filter: exclude reserved rooms ===
  if (date && time_start && time_end) {
    values.push(date, time_start, time_end);
    const idx = values.length;
    filters.push(`
      room_id NOT IN (
        SELECT room_id FROM reservation
        WHERE date = $${idx - 2}
          AND NOT (
            time_end <= $${idx - 1} OR
            time_start >= $${idx}
          )
      )
    `);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : '';

  try {
    const result = await db.query(`
      SELECT * FROM room
      ${whereClause}
      ORDER BY building_id, room_id;
    `, values);

    res.render('list', {
      title: "I-Reserve Availability",
      rooms: result.rows,
      date,
      time_start,
      time_end,
      building,
      loggedIn: req.session.userId ? true : false, 
      floor: Array.isArray(floor) ? floor : floor ? [floor] : []
    });
  } catch (err) {
    console.error("Error fetching availability:", err);
    res.status(500).send("Failed to load availability.");
  }
});

//this is part of the reservation page.
router.get('/reserve', requireLogin, (req, res) => {
  const { room_id, date, time_start, time_end, event_name, event_desc, people_count } = req.query;
  const title = "Create New Reservation";
  res.render('reserve', {
    title,
    room_id,
    date,
    time_start,
    time_end,
    event_name,
    event_desc,
    people_count,
    loggedIn: req.session.userId ? true : false
  });
});

//this is part of the reservation page.
router.post('/reserve/new', requireLogin, async (req, res) => {
  const { room_id, date, event_name, event_desc, time_start, time_end, people_count } = req.body;
  const i_number = req.session.userId;

  try {
    await db.query(
      `INSERT INTO reservation (i_number, room_id, date, event_name, event_desc, time_start, time_end, people_count, confirmed)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [i_number, room_id, date, event_name, event_desc, time_start, time_end, people_count, 0]
    );
    req.flash('success_msg', 'Reservation created successfully.');
    res.redirect('/profile'); // or wherever you want to take the user after
  } catch (err) {
    console.error("Error inserting reservation:", err);
    req.flash('error_msg', 'Error Creating Reservation.');
    res.redirect('/reserve');
  }
});

//this is part of the profile page.
router.post('/reservations/:id/confirm', requireLogin, async (req, res) => {
  const reserve_id = req.params.id;

  try {
    await db.query(
      'UPDATE reservation SET confirmed = 1 WHERE reserve_id = $1',
      [reserve_id]
    );
    req.flash('success_msg', 'Reservation confirmed successfully.');
    res.redirect('/profile');
  } catch (err) {
    console.error('Error confirming reservation:', err);
    req.flash('error_msg', 'Reservation not confirmed.');
    res.redirect('/profile');
  }
});

//this is part of the profile page.
router.post('/reservations/:id/cancel', requireLogin, async (req, res) => {
  const reserve_id = req.params.id;

  try {
    await db.query(
      'DELETE FROM reservation WHERE reserve_id = $1',
      [reserve_id]
    );
    req.flash('success_msg', 'Reservation cancelled successfully.');
    res.redirect('/profile');
  } catch (err) {
    console.error('Error cancelling reservation:', err);
    req.flash('error_msg', 'Failed to cancel reservation.');
    res.redirect('/profile');
  }
});

//this is a contact route
router.get('/contact', (req, res) => {
    const title = "I-Reserve Contact";
    const success = req.query.success;
    res.render('contact', { title, success, loggedIn: req.session.userId ? true : false });
})

//this is a contact route
router.post('/contact', async (req, res) => {
  const { return_email, message_title, message } = req.body;
  const i_number = req.session?.userId; // make sure session is configured

  if (!i_number) {
    req.flash('error_msg', 'You must be logged in to send a message.')
    return res.redirect('/login');
  }

  try {
    await db.query(
      `INSERT INTO message (i_number, return_email, message_title, message)
       VALUES ($1, $2, $3, $4)`,
      [i_number, return_email, message_title, message]
    );
    res.redirect('/contact?success=true');
  } catch (err) {
    console.error("Error inserting message:", err);
    req.flash('error_msg', 'Message submission failed. Please try again.')
    res.redirect('/contact');
  }
});

export default router;