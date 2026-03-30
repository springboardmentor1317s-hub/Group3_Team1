const express = require("express");
const protect = require("../middleware/authMiddleware");
const attendanceController = require("../controllers/attendanceController");

const router = express.Router();

router.get("/qr-details", attendanceController.getQrDetailsFromToken);
router.get("/my-approved-events", protect, attendanceController.getMyApprovedEvents);
router.get("/admit-card/:eventId", protect, attendanceController.downloadMyAdmitCard);
router.get("/events/:eventId/admit-card-preview", protect, attendanceController.previewAdmitCardForEvent);
router.get("/events/:eventId/students/:studentId/admit-card-preview", protect, attendanceController.previewAdmitCardForStudent);

router.post("/events/:eventId/generate-admit-cards", protect, attendanceController.generateAdmitCardsForEvent);
router.post("/events/:eventId/distribute-admit-cards", protect, attendanceController.distributeAdmitCardsForEvent);
router.get("/events/today", protect, attendanceController.getTodayEventsForAttendance);
router.get("/events/:eventId/roster", protect, attendanceController.getEventAttendanceRoster);
router.post("/scan", protect, attendanceController.scanAttendance);

module.exports = router;
