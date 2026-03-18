const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const Registration = require("../models/Registration");

function formatProfile(user) {
  return {
    id: String(user._id),
    name: user.name,
    userId: user.userId,
    email: user.email,
    role: user.role,
    college: user.college || "",
    adminApprovalStatus: user.adminApprovalStatus || "approved",
    adminRejectionReason: user.adminRejectionReason || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function determineEventStatus(event, isRegistered) {
  const maxAttendees = event.maxAttendees || event.participants || 100;
  const registrations = event.registrations || 0;

  if (event.status === "Past") return "Closed";
  if (isRegistered) return "Registered";
  if (registrations >= maxAttendees) return "Full";
  return "Open";
}

function mapDashboardEvent(event, registeredSet) {
  const eventDate = event.dateTime ? new Date(event.dateTime) : null;
  const isRegistered = registeredSet.has(String(event._id));

  return {
    id: String(event._id),
    title: event.name,
    description: event.description || "Explore this campus experience and secure your seat before registrations close.",
    category: event.category || "Campus Event",
    location: event.location || "Campus Venue",
    dateTime: event.dateTime,
    dateLabel: eventDate && !Number.isNaN(eventDate.getTime())
      ? eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : event.dateTime,
    timeLabel: eventDate && !Number.isNaN(eventDate.getTime())
      ? eventDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
      : "Time TBA",
    imageUrl: event.posterDataUrl || null,
    organizer: event.organizer || "Campus Event Hub",
    contact: event.contact || "Contact admin",
    status: determineEventStatus(event, isRegistered),
    registrations: event.registrations || 0,
    maxAttendees: event.maxAttendees || event.participants || 100,
    collegeName: event.collegeName || "Campus Event Hub"
  };
}

function mapRegistration(registration, event) {
  const eventDate = event?.dateTime ? new Date(event.dateTime) : null;

  return {
    id: String(registration._id),
    eventId: registration.eventId,
    eventName: registration.eventName,
    studentId: registration.studentId,
    studentName: registration.studentName,
    email: registration.email,
    college: registration.college,
    status: registration.status,
    rejectionReason: registration.rejectionReason || "",
    approvedAt: registration.approvedAt || null,
    rejectedAt: registration.rejectedAt || null,
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
    event: event ? {
      id: String(event._id),
      name: event.name,
      dateTime: event.dateTime,
      location: event.location,
      organizer: event.organizer,
      contact: event.contact,
      description: event.description,
      category: event.category,
      posterDataUrl: event.posterDataUrl || null,
      status: event.status,
      registrations: event.registrations || 0,
      maxAttendees: event.maxAttendees || event.participants || 100,
      dateLabel: eventDate && !Number.isNaN(eventDate.getTime())
        ? eventDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : event?.dateTime || ""
    } : null
  };
}

async function buildStudentDashboardPayload(userId) {
  const [user, events, registrations] = await Promise.all([
    User.findById(userId).select("-password"),
    Event.find().sort({ createdAt: -1 }),
    Registration.find({ studentId: String(userId) }).sort({ createdAt: -1 })
  ]);

  if (!user) {
    return null;
  }

  const eventIds = registrations.map((registration) => registration.eventId);
  const registrationCounts = await Registration.aggregate([
    {
      $match: {
        eventId: { $in: events.map((event) => String(event._id)) },
        status: { $ne: "REJECTED" }
      }
    },
    {
      $group: {
        _id: "$eventId",
        count: { $sum: 1 }
      }
    }
  ]);

  const countMap = new Map(registrationCounts.map((row) => [String(row._id), row.count]));
  const enrichedEvents = events.map((event) => {
    event.registrations = countMap.get(String(event._id)) || 0;
    return event;
  });

  const eventMap = new Map(enrichedEvents.map((event) => [String(event._id), event]));
  const registeredSet = new Set(registrations.filter((item) => item.status !== "REJECTED").map((item) => String(item.eventId)));

  const dashboardEvents = enrichedEvents.map((event) => mapDashboardEvent(event, registeredSet));
  const dashboardRegistrations = registrations.map((registration) => mapRegistration(registration, eventMap.get(String(registration.eventId))));
  const approvedCount = registrations.filter((item) => item.status === "APPROVED").length;
  const pendingCount = registrations.filter((item) => item.status === "PENDING").length;

  const notifications = [
    {
      id: "registrations-count",
      title: "Registration overview",
      message: `You have ${registrations.length} registrations and ${approvedCount} approved entries.`,
      tone: approvedCount > 0 ? "success" : "info"
    },
    {
      id: "pending-approvals",
      title: "Pending approvals",
      message: pendingCount > 0
        ? `${pendingCount} registrations are waiting for approval.`
        : "No registrations are pending right now.",
      tone: pendingCount > 0 ? "warning" : "success"
    }
  ];

  return {
    profile: formatProfile(user),
    events: dashboardEvents,
    registrations: dashboardRegistrations,
    stats: {
      upcomingEvents: dashboardEvents.filter((item) => item.status !== "Closed").length,
      myRegistrations: registrations.length,
      approvedEntries: approvedCount
    },
    notifications
  };
}



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
    res.status(500).json({ message: "Failed to toggle registration" });
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
    res.status(500).json({ message: "Failed to signup" });
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

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(formatProfile(user));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
};

exports.getStudentDashboard = async (req, res) => {
  try {
    const payload = await buildStudentDashboardPayload(req.user.id);

    if (!payload) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch student dashboard" });
  }
};
