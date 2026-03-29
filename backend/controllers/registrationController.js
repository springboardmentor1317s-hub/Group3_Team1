const Registration = require('../models/Registration');
const Event = require('../models/Event');
const User = require('../models/User');
const StudentProfileDetails = require('../models/StudentProfileDetails');
const { getCollegeScopedEventIds } = require('../utils/adminCollegeScope');
const { buildMergedStudentProfile } = require('../utils/studentProfile');

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
      maxAttendees: event.maxAttendees ?? null,
      dateLabel: eventDate && !Number.isNaN(eventDate.getTime())
        ? eventDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : event?.dateTime || ''
    } : null
  };
}

async function attachReviewProfiles(registrations) {
  if (!registrations.length) {
    return [];
  }

  const studentIds = Array.from(new Set(registrations.map((registration) => String(registration.studentId)).filter(Boolean)));
  const users = await User.find({ _id: { $in: studentIds } }).select('-password -__v').lean();
  const userMap = new Map(users.map((user) => [String(user._id), user]));

  const detailUserIds = users.map((user) => user._id);
  const details = await StudentProfileDetails.find({ user: { $in: detailUserIds } }).lean();
  const detailsMap = new Map(details.map((detail) => [String(detail.user), detail]));

  return registrations.map((registration) => {
    const student = userMap.get(String(registration.studentId));
    const detail = student ? detailsMap.get(String(student._id)) : null;

    return {
      ...registration.toObject(),
      id: String(registration._id),
      reviewProfile: student ? buildMergedStudentProfile(student, detail) : null
    };
  });
}

async function getScopedRegistrationContext(adminUserId, registrationId) {
  const eventIds = await getCollegeScopedEventIds(adminUserId);
  if (!eventIds.length) {
    return { registration: null, event: null };
  }

  const registration = await Registration.findById(registrationId);
  if (!registration || !eventIds.includes(String(registration.eventId))) {
    return { registration: null, event: null };
  }

  const event = await Event.findById(registration.eventId);
  return { registration, event };
}

async function syncEventRegistrationCount(eventId) {
  const activeRegistrationCount = await Registration.countDocuments({
    eventId: String(eventId),
    status: { $ne: 'REJECTED' }
  });

  await Event.findByIdAndUpdate(eventId, { registrations: activeRegistrationCount });
}

exports.createRegistration = async (req, res) => {
  try {
    const eventId = String(req.body?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' });
    }

    const [student, event] = await Promise.all([
      User.findById(req.user.id).select('-password'),
      Event.findById(eventId)
    ]);

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const existingRegistration = await Registration.findOne({
      eventId,
      studentId: String(student._id)
    });

    if (existingRegistration) {
      if (existingRegistration.status === 'REJECTED') {
        existingRegistration.studentName = student.name;
        existingRegistration.email = student.email;
        existingRegistration.college = student.college || 'Not Provided';
        existingRegistration.status = 'PENDING';
        existingRegistration.rejectionReason = '';
        existingRegistration.rejectedAt = null;
        existingRegistration.approvedAt = null;
        await existingRegistration.save();
        await syncEventRegistrationCount(eventId);
        const latestEvent = await Event.findById(eventId);

        return res.status(200).json(serializeRegistration(existingRegistration, latestEvent || event));
      }

      return res.status(400).json({
        error: existingRegistration.status === 'APPROVED'
          ? 'You are already approved for this event'
          : 'Your registration is already pending admin review',
        registration: existingRegistration
      });
    }

    const activeRegistrationCount = await Registration.countDocuments({
      eventId,
      status: { $ne: 'REJECTED' }
    });

    const maxAttendees = event.maxAttendees ?? null;
    if (typeof maxAttendees === 'number' && maxAttendees > 0 && activeRegistrationCount >= maxAttendees) {
      return res.status(400).json({ error: 'Event is full' });
    }

    const registration = new Registration({
      eventId,
      eventName: event.name,
      studentId: String(student._id),
      studentName: student.name,
      email: student.email,
      college: student.college || 'Not Provided',
      status: 'PENDING'
    });

    await registration.save();
    await syncEventRegistrationCount(eventId);
    const latestEvent = await Event.findById(eventId);

    res.status(201).json(serializeRegistration(registration, latestEvent || event));
  } catch (error) {
    if (error?.code === 11000) {
      try {
        const duplicateRegistration = await Registration.findOne({
          eventId: String(req.body?.eventId || '').trim(),
          studentId: String(req.user?.id || '')
        });

        if (duplicateRegistration) {
          const duplicateEvent = await Event.findById(duplicateRegistration.eventId);
          return res.status(200).json(serializeRegistration(duplicateRegistration, duplicateEvent));
        }
      } catch (_duplicateLookupError) {
        // Fall through to the generic error response.
      }
    }

    res.status(500).json({ message: 'Failed to create registration' });
  }
};

exports.getAllRegistrations = async (_req, res) => {
  try {
    const registrations = await Registration.find().sort({ createdAt: -1 });
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch registrations' });
  }
};

exports.getCollegeRegistrations = async (req, res) => {
  try {
    const eventIds = await getCollegeScopedEventIds(req.user?.id);
    if (!eventIds.length) {
      return res.json([]);
    }

    const registrations = await Registration.find({
      eventId: { $in: eventIds }
    }).sort({ createdAt: -1 });

    res.json(await attachReviewProfiles(registrations));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch college registrations' });
  }
};

exports.getCollegeRegistrationReview = async (req, res) => {
  try {
    const registrationId = String(req.params.id || '').trim();
    if (!registrationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid registration ID format' });
    }

    const { registration, event } = await getScopedRegistrationContext(req.user?.id, registrationId);
    if (!registration) {
      return res.status(404).json({ message: 'Registration not found' });
    }

    const student = await User.findById(registration.studentId).select('-password -__v');
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const details = await StudentProfileDetails.findOne({ user: student._id }).lean();
    res.json({
      registration: serializeRegistration(registration, event),
      profile: buildMergedStudentProfile(student, details)
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch registration review details' });
  }
};

exports.getStudentRegistrations = async (req, res) => {
  try {
    const isOwnProfileRequest = req.params.studentId === 'me' && req.user?.id;
    const studentId = isOwnProfileRequest ? String(req.user.id) : String(req.params.studentId);

    const registrations = await Registration.find({ studentId }).sort({ createdAt: -1 });
    const eventIds = registrations.map((registration) => registration.eventId);
    const events = await Event.find({ _id: { $in: eventIds } });
    const eventMap = new Map(events.map((event) => [String(event._id), event]));

    res.json(registrations.map((registration) => serializeRegistration(registration, eventMap.get(String(registration.eventId)))));
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch student registrations' });
  }
};

exports.approveRegistration = async (req, res) => {
  try {
    const registrationId = String(req.params.id || '').trim();
    if (!registrationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }

    const { registration, event } = await getScopedRegistrationContext(req.user?.id, registrationId);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    registration.status = 'APPROVED';
    registration.rejectionReason = '';
    registration.approvedAt = new Date();
    registration.rejectedAt = null;
    await registration.save();
    await syncEventRegistrationCount(registration.eventId);

    res.json(serializeRegistration(registration, event));
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve registration' });
  }
};

exports.rejectRegistration = async (req, res) => {
  try {
    const registrationId = String(req.params.id || '').trim();
    if (!registrationId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: 'Invalid registration ID format' });
    }

    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const { registration, event } = await getScopedRegistrationContext(req.user?.id, registrationId);
    if (!registration) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    registration.status = 'REJECTED';
    registration.rejectionReason = reason;
    registration.rejectedAt = new Date();
    registration.approvedAt = null;
    await registration.save();
    await syncEventRegistrationCount(registration.eventId);

    res.json(serializeRegistration(registration, event));
  } catch (error) {
    res.status(500).json({
      error: 'Could not reject registration. Please try again.',
      details: error.message
    });
  }
};

exports.cancelRegistration = async (req, res) => {
  try {
    const isOwnProfileRequest = req.params.studentId === 'me' && req.user?.id;
    const studentId = isOwnProfileRequest ? String(req.user.id) : String(req.params.studentId);
    const { eventId } = req.params;
    if (!studentId || !eventId) {
      return res.status(400).json({ error: 'studentId and eventId are required' });
    }

    const deleted = await Registration.findOneAndDelete({
      studentId: String(studentId),
      eventId: String(eventId)
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Registration not found' });
    }

    await syncEventRegistrationCount(eventId);
    res.json({ message: 'Registration cancelled', registration: deleted });
  } catch (error) {
    res.status(500).json({
      error: 'Could not cancel registration. Please try again.',
      details: error.message
    });
  }
};
