const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/superadmincontroller");

// Get Super Admin dashboard stats
router.get("/dashboard-stats", /*authMw.ensureSuperAdmin,*/ ctrl.getDashboardStats);
router.get("/admin-requests", /*authMw.ensureSuperAdmin,*/ ctrl.getAdminApprovalRequests);
router.patch("/admin-requests/:id/approve", /*authMw.ensureSuperAdmin,*/ ctrl.approveAdminRequest);
router.patch("/admin-requests/:id/reject", /*authMw.ensureSuperAdmin,*/ ctrl.rejectAdminRequest);

module.exports = router;
