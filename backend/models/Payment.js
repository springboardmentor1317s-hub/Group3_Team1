const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    trim: true
  },
  orderId: {
    type: String,
    required: true,
    trim: true
  },
  signature: {
    type: String,
    default: '',
    trim: true
  },
  userId: {
    type: String,
    required: true,
    trim: true
  },
  userName: {
    type: String,
    default: '',
    trim: true
  },
  userEmail: {
    type: String,
    default: '',
    trim: true
  },
  eventId: {
    type: String,
    required: true,
    trim: true
  },
  eventName: {
    type: String,
    default: '',
    trim: true
  },
  collegeName: {
    type: String,
    default: '',
    trim: true
  },
  adminId: {
    type: String,
    default: '',
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },
  status: {
    type: String,
    enum: ['created', 'success', 'failed'],
    default: 'created'
  },
  paymentMethod: {
    type: String,
    default: '',
    trim: true
  },
  verified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date,
    default: null
  },
  receiptReference: {
    type: String,
    default: '',
    trim: true
  }
}, {
  timestamps: true
});

paymentSchema.index({ orderId: 1 }, { unique: true });
paymentSchema.index({ paymentId: 1 }, { unique: true });
paymentSchema.index({ userId: 1, eventId: 1, status: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
