const User = require("../models/User");
const Event = require("../models/Event");

// ================= SUPER ADMIN DASHBOARD =================
exports.getDashboardStats = async (req, res) => {
  try {
    // Count admins (case-insensitive)
    const totalAdmins = await User.countDocuments({ role: { $regex: /^college_admin$/i } });

    // Count students (case-insensitive)
    const totalStudents = await User.countDocuments({ role: { $regex: /^student$/i } });

    // Count events
    const totalEvents = await Event.countDocuments();

    // Send response
    res.json({
      totalAdmins,
      totalEvents,
      totalStudents
    });

  } catch (error) {
    console.log("Dashboard error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};