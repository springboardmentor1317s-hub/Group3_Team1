const User = require("../models/User");
const StudentProfileDetails = require("../models/StudentProfileDetails");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Event = require("../models/Event");
const Registration = require("../models/Registration");
const { buildMergedStudentProfile } = require("../utils/studentProfile");

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidUserId(value) {
  return /^(?=.{3,40}$)[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(String(value || "").trim());
}

function toNotificationDate(value) {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0).toISOString();
  }

  return parsed.toISOString();
}

function buildNotification(id, title, message, tone, createdAt, icon, category) {
  return {
    id,
    title,
    message,
    tone,
    createdAt: toNotificationDate(createdAt),
    icon,
    category
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

function buildStudentNotifications(user, registrations, events, eventMap, approvedCount, pendingCount) {
  const notifications = [];
  const userCollege = normalizeText(user.college);
  const now = Date.now();

  notifications.push(
    buildNotification(
      "registrations-overview",
      "Your dashboard is live",
      `You have ${registrations.length} registrations, ${approvedCount} approvals, and ${pendingCount} pending requests.`,
      approvedCount > 0 ? "success" : "info",
      new Date(),
      "insights",
      "overview"
    )
  );

  registrations.forEach((registration) => {
    const event = eventMap.get(String(registration.eventId));
    const eventName = registration.eventName || event?.name || "your event";

    if (registration.status === "APPROVED") {
      notifications.push(
        buildNotification(
          `registration-approved-${registration._id}`,
          "Registration approved",
          `${eventName} has been approved by the admin. You're all set for the event.`,
          "success",
          registration.approvedAt || registration.updatedAt,
          "verified",
          "approval"
        )
      );
      return;
    }

    if (registration.status === "REJECTED") {
      notifications.push(
        buildNotification(
          `registration-rejected-${registration._id}`,
          "Registration update",
          registration.rejectionReason
            ? `${eventName} was declined. Reason: ${registration.rejectionReason}`
            : `${eventName} was declined by the admin.`,
          "warning",
          registration.rejectedAt || registration.updatedAt,
          "report_problem",
          "approval"
        )
      );
      return;
    }

    if (now - new Date(registration.createdAt).getTime() <= 1000 * 60 * 60 * 24 * 14) {
      notifications.push(
        buildNotification(
          `registration-pending-${registration._id}`,
          "Registration received",
          `Your request for ${eventName} has been submitted and is waiting for admin approval.`,
          "info",
          registration.createdAt,
          "hourglass_top",
          "registration"
        )
      );
    }
  });

  events
    .filter((event) => event.status !== "Past")
    .filter((event) => {
      if (!userCollege) {
        return true;
      }

      const collegeName = normalizeText(event.collegeName);
      const organizer = normalizeText(event.organizer);
      return collegeName === userCollege || organizer.includes(userCollege);
    })
    .slice(0, 6)
    .forEach((event) => {
      notifications.push(
        buildNotification(
          `event-live-${event._id}`,
          userCollege ? "New event from your college" : "Fresh campus event",
          `${event.name} is now live${event.location ? ` at ${event.location}` : ""}. Check details and reserve your seat early.`,
          "info",
          event.createdAt || event.dateTime,
          "campaign",
          "event"
        )
      );
    });

  return notifications
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}

async function buildStudentDashboardPayload(userId) {
  const [user, details, events, registrations] = await Promise.all([
    User.findById(userId).select("-password"),
    StudentProfileDetails.findOne({ user: userId }).lean(),
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

  const notifications = buildStudentNotifications(user, registrations, enrichedEvents, eventMap, approvedCount, pendingCount);

  return {
    profile: buildMergedStudentProfile(user, details),
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
    const { name, password, role, college } = req.body;
    const email = normalizeText(req.body.email);
    const normalizedRole = normalizeText(role || "student");
    const normalizedUserId = email;

    console.log("Signup request:", { name, userId: normalizedUserId, email, role: normalizedRole, college });

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters long" });
    }

    // Check if userId already exists
    const existingUserId = await User.findOne({ userId: normalizedUserId });
    if (existingUserId) {
      return res.status(400).json({ message: "UserId already taken" });
    }

    // Check if email exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const isCollegeAdmin = normalizedRole === "college_admin" || normalizedRole === "admin";

    const user = await User.create({
      name: String(name).trim(),
      userId: normalizedUserId,
      email,
      college,
      password: hashedPassword,
      role: normalizedRole,
      adminApprovalStatus: isCollegeAdmin ? "pending" : "approved",
      adminRejectionReason: "",
      adminReviewedAt: null
    });

    if (normalizedRole === "student") {
      await StudentProfileDetails.create({
        user: user._id,
        userId: user.userId,
        email: user.email
      });
    }

    res.status(201).json({ message: "User registered successfully" });

  } catch (error) {
    res.status(500).json({ message: "Failed to signup" });
  }
};


// ================= LOGIN =================
exports.login = async (req, res) => {
  try {
    const { password } = req.body;
    const identifier = String(req.body.identifier || "").trim();
    const normalizedIdentifier = normalizeText(identifier);

    if (!identifier) {
      return res.status(400).json({ message: "Email or user ID is required" });
    }

    if (!isValidEmail(identifier)) {
      return res.status(400).json({ message: "Please provide a valid email address" });
    }

    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }

    const user = await User.findOne({ email: normalizedIdentifier });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    if (user.isBlocked) {
      return res.status(403).json({
        message: "Your Account is Blocked",
        accountStatus: "blocked"
      });
    }

    const normalizedRole = (user.role || "").toLowerCase();
    const isCollegeAdmin = normalizedRole === "college_admin" || normalizedRole === "admin";
    const approvalStatus = user.adminApprovalStatus || "pending";
    const details = normalizedRole === "student"
      ? await StudentProfileDetails.findOne({ user: user._id }).lean()
      : null;
    const mergedProfile = buildMergedStudentProfile(user, details);

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
      profileImageUrl: user.profileImageUrl || "",
      profileCompleted: normalizedRole === "student" ? mergedProfile.profileCompleted : true,
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
    const details = await StudentProfileDetails.findOne({ user: req.user.id }).lean();

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(buildMergedStudentProfile(user, details));
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
