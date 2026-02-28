const express = require('express');
const router = express.Router();
const User = require('../models/User');

// DEV ONLY: list users without password
router.get('/debug/users', async (req, res) => {
  try {
    const users = await User.find().select('-password -__v');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
