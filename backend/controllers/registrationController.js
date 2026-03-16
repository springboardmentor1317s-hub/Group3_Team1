

const Registration = require('../models/Registration');

// Student register
exports.createRegistration = async (req, res) => {
  try {
    // Check if student already registered for this event
    const existingRegistration = await Registration.findOne({
      eventId: req.body.eventId,
      studentId: req.body.studentId
    });

    if (existingRegistration) {
      return res.status(400).json({
        error: "You have already registered for this event",
        registration: existingRegistration
      });
    }

    const registration = new Registration({
      ...req.body,
      status: "PENDING"
    });

    await registration.save();

    res.status(201).json(registration);

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
    const registrations = await Registration.find({
      studentId: req.params.studentId
    }).sort({ createdAt: -1 });

    res.json(registrations);
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
    const { studentId, eventId } = req.params;
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

    res.json({ message: "Registration cancelled", registration: deleted });
  } catch (error) {
    console.error("❌ Cancel registration error:", error);
    res.status(500).json({
      error: "Could not cancel registration. Please try again.",
      details: error.message
    });
  }
};
