import express from 'express'; // Import the Express code.
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
console.log("DB URL is:", process.env.DB_URL);
// import db from './src/models/db.js'; // Import the DB connection
// import { setupDatabase, testConnection } from './src/models/setup.js'; // Import the DB setup
 
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

// Starting with my routes here before moving them into their own refactored directories
app.get('/', (req, res) => {
    const title = "I-Reserve Home";
    res.render('index', { title });
});

app.get('/map', (req, res) => {
    const title = "I-Reserve Map";
    res.render('map', { title });
});

app.get('/profile', (req, res) => {
    const title = "My I-Reserve Profile";
    res.render('profile', { title });
});

app.get('/availability', (req, res) => {
    const title = "I-Reserve Availability";
    res.render('list', { title });
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
    // try {
    //     await testConnection();
    //     await setupDatabase();
    // } catch (error) {
    //     console.error('Database setup failed:', error);
    //     process.exit(1);
    // }
    console.log(`Server is running on http://127.0.0.1:${PORT}`);
});