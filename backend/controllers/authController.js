const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Event = require("../models/Event");



exports.toggleRegistration = async (req, res) => {
  try {
    const { eventId } = req.params;
    // IMPORTANT: Make sure this matches the ID type stored in your frontend studentId
    const studentIdentifier = req.user.userId || req.user.id; 

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const isRegistered = event.attendeeIds.includes(studentIdentifier);

    if (isRegistered) {
      // Unregister: Filter out the ID
      event.attendeeIds = event.attendeeIds.filter(id => id !== studentIdentifier);
    } else {
      // Register: Check if full, then push
      if (event.maxAttendees && event.attendeeIds.length >= event.maxAttendees) {
        return res.status(400).json({ message: "Event is full" });
      }
      event.attendeeIds.push(studentIdentifier);
    }

    // Keep the numeric count in sync with the array length
    event.registrations = event.attendeeIds.length;

    await event.save();
    res.json({ 
      message: isRegistered ? "Unregistered" : "Registered", 
      registered: !isRegistered,
      count: event.registrations 
    });

  } catch (error) {
    console.error("Toggle Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

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
    const normalizedRole = (role || "").toLowerCase();
    const isCollegeAdmin = normalizedRole === "college_admin" || normalizedRole === "admin";

    const user = await User.create({
      name,
      userId,
      email,
      college,
      password: hashedPassword,
      role,
      adminApprovalStatus: isCollegeAdmin ? "pending" : "approved",
      adminRejectionReason: "",
      adminReviewedAt: null
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
    const { identifier, password } = req.body;

    // identifier can be email OR userId
    const user = await User.findOne({
      $or: [{ email: identifier }, { userId: identifier }]
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const normalizedRole = (user.role || "").toLowerCase();
    const isCollegeAdmin = normalizedRole === "college_admin" || normalizedRole === "admin";
    const approvalStatus = user.adminApprovalStatus || "pending";

    if (isCollegeAdmin && approvalStatus === "pending") {
      return res.status(403).json({
        message: "Your account is pending Super Admin approval. Please try again later.",
        approvalStatus: "pending"
      });
    }

    if (isCollegeAdmin && approvalStatus === "rejected") {
      return res.status(403).json({
        message: "Your college admin request was rejected by Super Admin.",
        approvalStatus: "rejected",
        rejectionReason: user.adminRejectionReason || "No reason provided."
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      role: user.role,
      name: user.name,
      userId: user.userId,
      email: user.email,
      college: user.college,
      adminApprovalStatus: user.adminApprovalStatus || "approved",
      adminRejectionReason: user.adminRejectionReason || ""
    });

  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
