const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/superadmincontroller");

// Existing routes
router.get("/dashboard-stats", ctrl.getDashboardStats);
router.get("/admin-requests", ctrl.getAdminApprovalRequests);
router.patch("/admin-requests/:id/approve", ctrl.approveAdminRequest);
router.patch("/admin-requests/:id/reject", ctrl.rejectAdminRequest);
router.get("/students", ctrl.getAllStudents);
router.get("/students/:studentId/events", ctrl.getStudentRegisteredEvents);
router.get("/admins/:adminId/events", ctrl.getAdminCreatedEvents);
router.patch('/users/:id/block', ctrl.updateUserBlockStatus);

// NEW: Admin Activity Report
// GET /api/super-admin/admin-activity
router.get("/admin-activity", ctrl.getAdminActivityReport);

module.exports = router;