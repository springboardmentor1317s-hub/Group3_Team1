const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  dateTime: { type: String, required: true, trim: true },
  location: { type: String, required: true, trim: true },
  organizer: { type: String, default: "", trim: true },
  contact: { type: String, default: "", trim: true },
  description: { type: String, default: "", trim: true },
  category: { type: String, required: true, trim: true },
  posterDataUrl: { type: String, default: null },
  status: { type: String, enum: ["Active", "Draft", "Past"], default: "Active" },
  registrations: { type: Number, default: 0 },
  participants: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  attendeeIds: [{ type: String }],
  // collegeName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);
