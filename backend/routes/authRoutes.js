const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { signup, login, getMe, getStudentDashboard } = require("../controllers/authController");

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", protect, getMe);
router.get("/student/dashboard", protect, getStudentDashboard);

module.exports = router;
