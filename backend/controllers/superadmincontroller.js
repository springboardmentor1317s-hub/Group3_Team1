const User = require("../models/User");
const Event = require("../models/Event");

// ================= SUPER ADMIN DASHBOARD =================
exports.getDashboardStats = async (req, res) => {
  try {
    // Count only approved college admins (exclude pending/rejected).
    const totalAdmins = await User.countDocuments({
      role: { $in: ["college_admin", "admin"] },
      adminApprovalStatus: "approved"
    });

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

// ================= COLLEGE ADMIN APPROVAL REQUESTS =================
exports.getAdminApprovalRequests = async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ["college_admin", "admin"] }
    })
      .select(
        "name userId email college role adminApprovalStatus adminRejectionReason adminReviewedAt createdAt"
      )
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.log("Admin requests error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.approveAdminRequest = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByIdAndUpdate(
      id,
      {
        adminApprovalStatus: "approved",
        adminRejectionReason: "",
        adminReviewedAt: new Date(),
        role: "college_admin"
      },
      { new: true }
    ).select(
      "name userId email college role adminApprovalStatus adminRejectionReason adminReviewedAt createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Admin request approved", user });
  } catch (error) {
    console.log("Approve admin error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.rejectAdminRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body.reason || "").trim();

    if (!reason) {
      return res.status(400).json({ message: "Rejection reason is required" });
    }

    const user = await User.findByIdAndUpdate(
      id,
      {
        adminApprovalStatus: "rejected",
        adminRejectionReason: reason,
        adminReviewedAt: new Date()
      },
      { new: true }
    ).select(
      "name userId email college role adminApprovalStatus adminRejectionReason adminReviewedAt createdAt"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Admin request rejected", user });
  } catch (error) {
    console.log("Reject admin error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
