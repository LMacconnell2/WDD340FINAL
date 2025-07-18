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
 
// Create an instance of an Express application
const app = express();
/**
 * Define important variables
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NODE_ENV = process.env.NODE_ENV || 'production';
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));
app.use(express.urlencoded({ extended: true }));

//setting the session configuration.
app.use(session({
  secret: '$2y$10$CuJLMZsG8PtvqqQfLcPWsOC0jblG3W/JDl5RPPESt51mpPj1FpPv2',
  resave: false,
  saveUninitialized: false
}));

// This function will require login for some pages
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// Starting with my routes here before moving them into their own refactored directories
app.get('/', (req, res) => {
    const title = "I-Reserve Home";
    res.render('index', { title });
});

app.get('/dashboard', requireLogin, (req, res) => {
  if (req.session.permission_id != 0)
  {
    res.redirect('/profile');
  }
  else
  {
    const title = "I-Reserve Dashboard";
    res.render('dashboard', { title });
  }
});

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
    return res.status(400).send(errors.join(" "));
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

app.post('/dashboard/building', async (req, res) => {
  let { building_id, building_name, time_open, time_closed } = req.body;
  console.log("POST dashboard BUILDING running");

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
    console.error("Validation errors:", errors);
    return res.status(400).send(errors.join(" "));
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
    console.error("Validation errors:", errors);
    return res.status(400).send(errors.join(" "));
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
    res.status(500).send('USers creation or update failed.');
  }
});

app.get('/map', (req, res) => {
    const title = "I-Reserve Map";
    res.render('map', { title });
});

app.get('/profile', requireLogin, (req, res) => {
  const title = 'Your Profile';
  res.render('profile', { username: req.session.username, title });
});

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
      floor: Array.isArray(floor) ? floor : floor ? [floor] : []
    });
  } catch (err) {
    console.error("Error fetching availability:", err);
    res.status(500).send("Failed to load availability.");
  }
});

app.get('/newaccount', (req, res) => {
    const title = "I-Reserve New Account";
    res.render('login/createAccount', { title });
});

app.post('/newaccount', async (req, res) => {
    const { i_number, fname, lname, password, password_confirm } = req.body;
    const email = req.body.email.toLowerCase();
  console.log("POST newaccount running");

    try {
        const userCheck = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        if (userCheck.rows.length > 0) 
        {
        return res.send('Email already registered.');
        }

        if (!email || !password || !i_number || !fname || !lname) {
            return res.status(400).send('All fields are required.');
        }
        if (password.length < 6) {
            return res.status(400).send('Password must be at least 6 characters.');
        }       
        if (password !== password_confirm) {
            return res.status(400).send('Passwords must match.');
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
    res.status(500).send('Registration failed.');
  }
});

app.get('/login', (req, res) => {
    const title = "I-Reserve Login";
    res.render('login/login', { title });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/contact', (req, res) => {
    const title = "I-Reserve Contact";
    res.render('contact', {title});
})

//here is the /login page check for password
app.post('/login', async (req, res) => {
  const  {password } = req.body;
  const email = req.body.email.toLowerCase();
  console.log("POST Login running");
  try {
    // Step 1: Look up user by email
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const test = await db.query('SELECT * FROM users');
    const testResult = test.rows[0];
    console.log(testResult);
    const user = result.rows[0];
    console.log("Email input:", email);
    console.log(user);
    // console.log("User password (hashed):", user.password);
    console.log("Password entered:", password);

    if (!user) {
      return res.status(401).send('Invalid email or password');
    }

    // Step 2: Compare passwords
    const passwordsMatch = await bcrypt.compare(password, user.password); // only if hashed

    if (!passwordsMatch) {
      return res.status(401).send('Invalid email or password');
    }

    // Step 3: Set session or redirect
    req.session.userId = user.i_number;
    req.session.permission_id = user.permission_id; 
    console.log("Logged in. Session userId:", req.session.userId);
    req.session.username = `${user.fname} ${user.lname}`;
    res.redirect('/profile');

  } catch (err) {
    console.log("POST login threw an error");
    console.error(err);
    res.status(500).send('Server error');
  }
});

// 404 Error Handler
app.use((req, res, next) => {
    const err = new Error('Page Not Found');
    err.status = 404;
    next(err); // Forward to the global error handler
});
 
// Global Error Handler
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