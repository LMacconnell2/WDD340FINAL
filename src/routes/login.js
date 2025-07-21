// src/routes/login.js
import express from 'express';
import db from '../models/db.js';
import bcrypt from 'bcrypt';
import { requireLogin } from '../middleware/index.js';

const router = express.Router();

// this is part of /login 
router.get('/newaccount', (req, res) => {
    const title = "I-Reserve New Account";
    res.render('login/createAccount', { title });
});

// this is part of /login 
router.post('/newaccount', async (req, res) => {
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

// this is part of /login 
router.get('/login', (req, res) => {
    const title = "I-Reserve Login";
    res.render('login/login', { title });
});

// this is part of /login 
router.get('/logout', requireLogin, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// This is a login route 
router.post('/login', async (req, res) => {
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

export default router;