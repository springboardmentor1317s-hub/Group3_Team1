const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


// ================= SIGNUP =================
exports.signup = async (req, res) => {
  try {
    const { name, userId, email, password, role, college } = req.body;

    console.log("Signup request:", { name, userId, email, role, college });

    // Check if userId already exists
    const existingUserId = await User.findOne({ userId });
    if (existingUserId) {
      return res.status(400).json({ message: "UserId already taken" });
    }

    // Check if email exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      userId,
      email,
      college,
      password: hashedPassword,
      role
    });

    res.status(201).json({ message: "User registered successfully" });

  } catch (error) {
    console.log("Signup Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { identifier, password, role: requestedRole } = req.body;

    // identifier can be email OR userId
    const user = await User.findOne({
      $or: [{ email: identifier }, { userId: identifier }]
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // if client provided a role, enforce it
    if (requestedRole && user.role !== requestedRole) {
      return res.status(403).json({ message: "Role mismatch" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      role: user.role,
      name: user.name
    });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
