// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs'); // optional for login comparison

// =======================
// POST /register
// =======================
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, college, role, password, confirmPassword } = req.body;

    // 1️⃣ Validate required fields
    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // 2️⃣ Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    // 3️⃣ Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // 4️⃣ Create new user
    const user = new User({
      fullName,
      email,
      college,
      role: role?.toLowerCase() || 'student',
      password // ✅ password will be hashed automatically in pre-save hook
    });

    await user.save(); // triggers hashing in User.js pre-save hook

    // 5️⃣ Return success response
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        college: user.college
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    // Handle duplicate key error for unique email
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    res.status(500).json({ success: false, message: error.message });
  }
});

// =======================
// POST /login
// =======================
router.post('/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Email does not exist' });
    }

    // Optional: check role
    if (role && user.role !== role.toLowerCase()) {
      return res.status(400).json({ success: false, message: 'Invalid role selected' });
    }

    // Compare password using bcrypt
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }

    // Login success
    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        college: user.college
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
