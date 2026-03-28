const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { getMyProfile, updateMyProfile, changeMyPassword } = require("../controllers/profileController");

router.get("/me", protect, getMyProfile);
router.put("/me", protect, updateMyProfile);
router.patch("/me/change-password", protect, changeMyPassword);

module.exports = router;
