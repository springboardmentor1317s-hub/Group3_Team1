
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const User = require('../models/User');

function serializeRegistration(registration, event) {
  const eventDate = event?.dateTime ? new Date(event.dateTime) : null;

  return {
    id: registration.id || String(registration._id),
    eventId: registration.eventId,
    eventName: registration.eventName,
    studentId: registration.studentId,
    studentName: registration.studentName,
    email: registration.email,
    college: registration.college,
    status: registration.status,
    rejectionReason: registration.rejectionReason || '',
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
        ? eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event?.dateTime || ''
    } : null
  };
}

// Student register
exports.createRegistration = async (req, res) => {
  try {
    const eventId = String(req.body?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({
        error: "eventId is required"
      });
    }

    const [student, event] = await Promise.all([
      User.findById(req.user.id).select('-password'),
      Event.findById(eventId)
    ]);

    if (!student) {
      return res.status(404).json({
        error: "Student not found"
      });
    }

    if (!event) {
      return res.status(404).json({
        error: "Event not found"
      });
    }

    const existingRegistration = await Registration.findOne({
      eventId,
      studentId: String(student._id)
    });

    if (existingRegistration) {
      return res.status(400).json({
        error: "You have already registered for this event",
        registration: existingRegistration
      });
    }

    const activeRegistrationCount = await Registration.countDocuments({
      eventId,
      status: { $ne: 'REJECTED' }
    });

    const maxAttendees = event.maxAttendees || event.participants || 100;
    if (activeRegistrationCount >= maxAttendees) {
      return res.status(400).json({
        error: "Event is full"
      });
    }

    const registration = new Registration({
      eventId,
      eventName: event.name,
      studentId: String(student._id),
      studentName: student.name,
      email: student.email,
      college: student.college || 'Not Provided',
      status: "PENDING"
    });

    await registration.save();
    event.registrations = activeRegistrationCount + 1;
    await event.save({ validateBeforeSave: false });

    res.status(201).json(serializeRegistration(registration, event));

  } catch (error) {
    res.status(500).json({ message: "Failed to create registration" });
  }
};

  // Admin get all registrations
  exports.getAllRegistrations = async (req, res) => {
    try {
      const registrations = await Registration.find().sort({ createdAt: -1 });
      res.json(registrations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch registrations" });
    }
  };

// Student view registrations
exports.getStudentRegistrations = async (req, res) => {
  try {
    const isOwnProfileRequest = req.params.studentId === 'me' && req.user?.id;
    const studentId = isOwnProfileRequest ? String(req.user.id) : String(req.params.studentId);

    const registrations = await Registration.find({
      studentId
    }).sort({ createdAt: -1 });

    const eventIds = registrations.map((registration) => registration.eventId);
    const events = await Event.find({ _id: { $in: eventIds } });
    const eventMap = new Map(events.map((event) => [String(event._id), event]));

    res.json(registrations.map((registration) => serializeRegistration(registration, eventMap.get(String(registration.eventId)))));
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch student registrations" });
  }
};

  // Admin approve - FIXED VERSION
  exports.approveRegistration = async (req, res) => {
    try {
      // Validate MongoDB ObjectId format
      if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({
          error: "Invalid registration ID format"
        });
      }

      const registration = await Registration.findByIdAndUpdate(
        req.params.id,
        { 
          status: "APPROVED",
          approvedAt: new Date()
        },
        { new: true }
      );

      if (!registration) {
        return res.status(404).json({
          error: "Registration not found"
        });
      }

      res.json(registration);

    } catch (error) {
      res.status(500).json({
        error: "Failed to approve registration"
      });
    }
  };

// Admin reject - FIXED VERSION
exports.rejectRegistration = async (req, res) => {
  try {
    console.log("📝 Rejecting registration ID:", req.params.id);

    // Validate MongoDB ObjectId format
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: "Invalid registration ID format"
      });
    }

    // Validate rejection reason
    if (!req.body.reason || req.body.reason.trim().length === 0) {
      return res.status(400).json({
        error: "Rejection reason is required"
      });
    }

    const registration = await Registration.findByIdAndUpdate(
      req.params.id,
      {
        status: "REJECTED",
        rejectionReason: req.body.reason,
        rejectedAt: new Date()
      },
      { new: true }
    );

    if (!registration) {
      console.error("❌ Registration not found:", req.params.id);
      return res.status(404).json({
        error: "Registration not found"
      });
    }

    console.log("✅ Registration rejected:", registration._id);
    res.json(registration);

  } catch (error) {
    console.error("❌ Rejection error:", error);
    res.status(500).json({
      error: "Could not reject registration. Please try again.",
      details: error.message
    });
  }
};

// Student cancel registration
exports.cancelRegistration = async (req, res) => {
  try {
    const isOwnProfileRequest = req.params.studentId === 'me' && req.user?.id;
    const studentId = isOwnProfileRequest ? String(req.user.id) : String(req.params.studentId);
    const { eventId } = req.params;
    if (!studentId || !eventId) {
      return res.status(400).json({
        error: "studentId and eventId are required"
      });
    }

    const deleted = await Registration.findOneAndDelete({
      studentId: String(studentId),
      eventId: String(eventId)
    });

    if (!deleted) {
      return res.status(404).json({
        error: "Registration not found"
      });
    }

    const activeRegistrationCount = await Registration.countDocuments({
      eventId: String(eventId),
      status: { $ne: 'REJECTED' }
    });
    await Event.findByIdAndUpdate(eventId, { registrations: activeRegistrationCount });

    res.json({ message: "Registration cancelled", registration: deleted });
  } catch (error) {
    console.error("❌ Cancel registration error:", error);
    res.status(500).json({
      error: "Could not cancel registration. Please try again.",
      details: error.message
    });
  }
};
