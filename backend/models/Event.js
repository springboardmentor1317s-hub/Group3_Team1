const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dateTime: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  organizer: { type: String, default: "", trim: true },
  contact: { type: String, default: "", trim: true },
  description: { type: String, default: "", trim: true },
  category: { type: String, required: true, trim: true },
  endDate: { type: String, default: "", trim: true },
  registrationDeadline: { type: String, default: "", trim: true },
  teamSize: { type: Number, default: null },
  posterDataUrl: { type: String, default: null },
  status: { type: String, enum: ["Active", "Draft", "Past"], default: "Active" },
  registrations: { type: Number, default: 0 },
  participants: { type: Number, default: 0 },
  collegeName: { type: String, default: "", trim: true },
  createdBy: { type: String, default: "", trim: true },
  createdById: { type: String, default: "", trim: true },
  ownerId: { type: String, default: "", trim: true },
  adminId: { type: String, default: "", trim: true },
  userId: { type: String, default: "", trim: true },
  email: { type: String, default: "", trim: true },
  maxAttendees: { type: Number, default: null },
  attendeeIds: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);
