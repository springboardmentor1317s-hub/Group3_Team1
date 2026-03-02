const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  dateTime: { type: String, required: true },
  location: { type: String, required: true },
  organizer: { type: String, default: "" },
  contact: { type: String, default: "" },
  description: { type: String, default: "" },
  posterDataUrl: { type: String, default: null },
  status: { type: String, enum: ["Active", "Draft", "Past"], default: "Active" },
  registrations: { type: Number, default: 0 },
  participants: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);
