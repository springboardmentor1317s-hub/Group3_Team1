const User = require("../models/User");
const Event = require("../models/Event");
const Registration = require("../models/Registration");

// ================= SUPER ADMIN DASHBOARD =================
exports.getDashboardStats = async (req, res) => {
  try {
    const totalAdmins = await User.countDocuments({
      role: { $in: ["college_admin", "admin"] },
      adminApprovalStatus: "approved"
    });

    const totalStudents = await User.countDocuments({ role: { $regex: /^student$/i } });

    const totalEvents = await Event.countDocuments();

    res.json({ totalAdmins, totalEvents, totalStudents });
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard stats" });
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
    res.status(500).json({ message: "Failed to load admin requests" });
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

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Admin request approved", user });
  } catch (error) {
    res.status(500).json({ message: "Failed to approve admin" });
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

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "Admin request rejected", user });
  } catch (error) {
    console.log("Reject admin error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ================= NEW: ADMIN ACTIVITY REPORTS =================
// GET /api/super-admin/admin-activity
//
// For each approved college admin:
//   - name, college, department
//   - eventsCreated: count of events matching their collegeName
//   - lastActive: most recent of updatedAt / adminReviewedAt
//   - activityLevel: High (>=5 events), Medium (2-4), Low (0-1)
// ────────────────────────────────────────────────────────────────
exports.getAdminActivityReport = async (req, res) => {
  try {
    // 1️⃣ Fetch all approved college admins
    const admins = await User.find({
      role: { $in: ["college_admin", "admin"] },
      adminApprovalStatus: "approved"
    }).select("name college department updatedAt adminReviewedAt createdAt");

    if (admins.length === 0) {
      return res.json([]);
    }

    // 2️⃣ Get all college names to batch-query events
    const collegeNames = admins
      .map(a => a.college)
      .filter(Boolean);

    // 3️⃣ Aggregate event counts grouped by collegeName
    const eventCounts = await Event.aggregate([
      {
        $match: {
          collegeName: { $in: collegeNames }
        }
      },
      {
        $group: {
          _id: "$collegeName",
          count: { $sum: 1 }
        }
      }
    ]);

    // Build a map: collegeName → event count
    const eventCountMap = {};
    eventCounts.forEach(ec => {
      eventCountMap[ec._id] = ec.count;
    });

    // 4️⃣ Build response for each admin
    const now = Date.now();

    const result = admins.map(admin => {
      const eventsCreated = eventCountMap[admin.college] || 0;

      // Last active = most recent of updatedAt and adminReviewedAt
      const timestamps = [admin.updatedAt, admin.adminReviewedAt, admin.createdAt]
        .filter(Boolean)
        .map(t => new Date(t).getTime());
      const lastActiveMs = Math.max(...timestamps);

      // Human-readable last active label
      const diffMs = now - lastActiveMs;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let lastActiveLabel;
      if (diffMins < 1) {
        lastActiveLabel = "Just now";
      } else if (diffMins < 60) {
        lastActiveLabel = `${diffMins}m ago`;
      } else if (diffHours < 24) {
        lastActiveLabel = `${diffHours}h ago`;
      } else {
        lastActiveLabel = `${diffDays}d ago`;
      }

      // Activity level based on events created
      let activityLevel;
      if (eventsCreated >= 5) {
        activityLevel = "High";
      } else if (eventsCreated >= 2) {
        activityLevel = "Medium";
      } else {
        activityLevel = "Low";
      }

      return {
        name: admin.name,
        college: admin.college || "N/A",
        department: admin.department || "",
        eventsCreated,
        lastActiveLabel,
        activityLevel
      };
    });

    // Sort by eventsCreated descending (most active first)
    result.sort((a, b) => b.eventsCreated - a.eventsCreated);

    res.json(result);
  } catch (error) {
    console.error("Admin activity report error:", error);
    res.status(500).json({ message: "Failed to load admin activity report" });
  }
};

// ================= STUDENTS LIST (ALL COLLEGES) =================
// GET /api/superadmin/students
exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.find({
      role: { $regex: /^student$/i }
    })
      .select("name userId email college role department phone currentAddressLine permanentAddressLine profileImageUrl isBlocked createdAt")
      .sort({ name: 1, createdAt: -1 });

    res.json(students);
  } catch (error) {
    console.error("Get all students error:", error);
    res.status(500).json({ message: "Failed to load students" });
  }
};

// ================= STUDENT REGISTERED EVENTS =================
// GET /api/superadmin/students/:studentId/events
exports.getStudentRegisteredEvents = async (req, res) => {
  try {
    const { studentId } = req.params;
    const normalizedStudentId = String(studentId || '').trim();

    if (!normalizedStudentId) {
      return res.status(400).json({ message: 'studentId is required' });
    }

    const registrations = await Registration.find({ studentId: normalizedStudentId })
      .select('eventId eventName status createdAt')
      .sort({ createdAt: -1 });

    const payload = registrations.map((item) => ({
      id: String(item._id),
      eventId: item.eventId,
      eventName: item.eventName,
      status: item.status,
      createdAt: item.createdAt
    }));

    res.json(payload);
  } catch (error) {
    console.error('Get student registered events error:', error);
    res.status(500).json({ message: 'Failed to load registered events' });
  }
};