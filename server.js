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

app.get('/dashboard', (req, res) => {
  const title = "I-Reserve Dashboard";
  res.render('dashboard', { title });
});

app.post('/dashboard/room', async (req, res) => {
    const { room_id, building_id, floor_number, max_occupancy, room_desc, permission_id } = req.body;
    const email = req.body.email.toLowerCase();
  console.log("POST dashboard ROOM running");

    try {
    await db.query(`
      INSERT INTO users (room_id, building_id, floor_number, max_occupancy, room_desc, permission_id)
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
    console.error(err);
    res.status(500).send('Newaccount creation failed.');
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

app.get('/availability', (req, res) => {
    const title = "I-Reserve Availability";
    res.render('list', { title });
});

app.get('/newaccount', (req, res) => {
    const title = "I-Reserve New Account";
    res.render('login/createAccount', { title });
});

app.post('/newaccount', async (req, res) => {
    const { i_number, fname, lname, password, password_confirm } = req.body;
    const email = req.body.email.toLowerCase();
  console.log("POST newaccount running");
  console.log("Request body:", req.body);

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