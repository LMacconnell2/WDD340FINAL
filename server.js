import express from 'express'; // Import the Express code.
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import 'dotenv/config';
dotenv.config();
console.log("DB URL is:", process.env.DB_URL);
import db from './src/models/db.js'; // Import the DB connection
import { setupDatabase, testConnection } from './src/models/setup.js'; // Import the DB setup
import bcrypt from 'bcrypt';
import session from 'express-session';
import flash from 'connect-flash';
 
// Create an instance of an Express application
const app = express();
/**
 * Define important variables
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 3000;
const HASH = process.env.HASH || "hashed";

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.urlencoded({ extended: true }));
app.use(flash());

//setting the session configuration. - refactor to index.js
app.use(session({
  secret: HASH,
  resave: false,
  saveUninitialized: false
}));

//Flash messages - refactor to index.js
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

// This function will require login for some pages - refactor to index.js
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.flash('error_msg', 'You must be logged in to access this page.');
    return res.redirect('/login');
  }
  next();
}

// This is the home page - refactor to general.js
app.get('/', (req, res) => {
    const title = "I-Reserve Home";
    res.render('index', { title, loggedIn: req.session.userId ? true : false });
});

//this is for the dashboard - refactor to dashboard.js
app.get('/dashboard', requireLogin, (req, res) => {
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

//this is for the dashboard - refactor to dashboard.js
app.post('/dashboard/room', async (req, res) => {
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

//this is for the dashboard - refactor to dashboard.js
app.post('/dashboard/building', async (req, res) => {
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

//this is for the dashboard - refactor to dashboard.js
app.post('/dashboard/users', async (req, res) => {
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

//this is for the map page - refactor to general.js
app.get('/map', (req, res) => {
    const title = "I-Reserve Map";
    res.render('map', { title, loggedIn: req.session.userId ? true : false });
});

//this is for the profile page - refactor to general.js
app.get('/profile', requireLogin, async (req, res) => {
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

//this is for /availability - refactor to general.js
app.get('/availability', async (req, res) => {
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

// this is for /messages. - refactor to dashboard.js
app.get('/messages', async (req, res) => {
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

// this is part of /login - refactor to login.js
app.get('/newaccount', (req, res) => {
    const title = "I-Reserve New Account";
    res.render('login/createAccount', { title });
});

// this is part of /login - refactor to login.js
app.post('/newaccount', async (req, res) => {
    const { i_number, fname, lname, password, password_confirm } = req.body;
    const email = req.body.email.toLowerCase();
  console.log("POST newaccount running");

    try {
        const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) 
        {
          req.flash('error_msg', 'Email Already Registered');
          return res.redirect('/newaccount');
        
        }

        if (!email || !password || !i_number || !fname || !lname) {
          req.flash('error_msg', 'All Fields Are Required');
          return res.redirect('/newaccount');
        }
        if (password.length < 6) {
          req.flash('error_msg', 'Password Must Be 6 Characters or More');
          return res.redirect('/newaccount');
        }       
        if (password !== password_confirm) {
          req.flash('error_msg', 'Passwords Must Match');
          return res.redirect('/newaccount');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await db.query(
            'INSERT INTO users (i_number, fname, lname, password, email, permission_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [i_number, fname, lname, hashedPassword, email, 5]
        );

        const newUser = result.rows[0];

    req.session.userId = newUser.i_number;
    req.session.username = `${newUser.fname} ${newUser.lname}`;
    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Registration failed');
    res.redirect('/newaccount');
  }
});

// this is part of /login - refactor to login.js
app.get('/login', (req, res) => {
    const title = "I-Reserve Login";
    res.render('login/login', { title });
});

// this is part of /login - refactor to login.js
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

//this is part of the reservation page. - refactor to general.js
app.get('/reserve', requireLogin, (req, res) => {
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
    loggedIn: req.session.i_number ? true : false
  });
});

//this is part of the reservation page. - refactor to general.js
app.post('/reserve/new', async (req, res) => {
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

//this is part of the profile page. - refactor to general.js
app.post('/reservations/:id/confirm', requireLogin, async (req, res) => {
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

//this is part of the profile page. - refactor to general.js
app.post('/reservations/:id/cancel', requireLogin, async (req, res) => {
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

//this is a contact route - refactor to general.js
app.get('/contact', (req, res) => {
    const title = "I-Reserve Contact";
    const success = req.query.success;
    res.render('contact', { title, success, loggedIn: req.session.userId ? true : false });
})

//this is a contact route - refactor to general.js
app.post('/contact', async (req, res) => {
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
    req.flash('error_msg', 'Message submission failed. Please try agian.')
    res.redirect('/contact');
  }
});

// This is a login route - refactor to login.js
app.post('/login', async (req, res) => {
  const  {password } = req.body;
  const email = req.body.email.toLowerCase();
  console.log("POST Login running");
  try {
    // Step 1: Look up user by email
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      req.flash('error_msg', '*Invalid email or password*');
      return res.redirect('/login');
    }

    const passwordsMatch = await bcrypt.compare(password, user.password); // only if hashed

    if (!passwordsMatch) {
      req.flash('error_msg', '*Invalid password, please try again*');
      return res.redirect('/login');
    }

    // Step 3: Set session or redirect
    req.session.userId = user.i_number;
    req.session.permission_id = user.permission_id; 
    req.session.username = `${user.fname} ${user.lname}`;
    res.redirect('/profile');

  } catch (err) {
    console.log("POST login threw an error");
    console.error(err);
    res.status(500).send('Server error');
  }
});

// 404 Error Handler - leave in server.js
app.use((req, res, next) => {
    const err = new Error('Page Not Found');
    err.status = 404;
    next(err); // Forward to the global error handler
});
 
// Global Error Handler - leave in server.js
app.use((err, req, res, next) => {
    // Log the error for debugging
    console.error(err.stack);
 
    // Set default status and determine error type
    const status = err.status || 500;
    const context = {
        title: status === 404 ? 'Page Not Found' : 'Internal Server Error',
        error: err.message,
        stack: err.stack
    };
 
    // Render the appropriate template based on status code
    res.status(status).render(`errors/${status === 404 ? '404' : '500'}`, context);
});
 
// Start the Express server on the specified port
app.listen(PORT, async () => {
    try {
        await testConnection();
        await setupDatabase();
    } catch (error) {
        console.error('Database setup failed:', error);
        process.exit(1);
    }
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
});