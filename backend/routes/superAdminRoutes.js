const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/superadmincontroller");

// Get Super Admin dashboard stats
router.get("/dashboard-stats", /*authMw.ensureSuperAdmin,*/ ctrl.getDashboardStats);

module.exports = router;