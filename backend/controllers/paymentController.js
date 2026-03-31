const crypto = require('crypto');
const Event = require('../models/Event');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Registration = require('../models/Registration');
const { getCollegeScopedEventIds } = require('../utils/adminCollegeScope');
const { buildPaymentReceiptPdf } = require('../utils/paymentPdf');

let RazorpayPackage = null;
try {
  RazorpayPackage = require('razorpay');
} catch {
  RazorpayPackage = null;
}

function getConfigValue(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function getRazorpayClient() {
  const keyId = getConfigValue('RAZORPAY_KEY_ID');
  const keySecret = getConfigValue('RAZORPAY_KEY_SECRET');

  if (!keyId || !keySecret) {
    return {
      error: 'Razorpay keys are not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to your .env file.'
    };
  }

  if (!RazorpayPackage) {
    return {
      error: 'Razorpay SDK is not installed in the backend yet. Run npm install in the backend folder to enable payment orders.'
    };
  }

  return {
    client: new RazorpayPackage({
      key_id: keyId,
      key_secret: keySecret
    }),
    keyId,
    keySecret
  };
}

function buildSignature(orderId, paymentId, keySecret) {
  return crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

async function getStudentAndEvent(req) {
  const userId = String(req.user?.id || '').trim();
  const eventId = String(req.body?.eventId || req.params?.eventId || '').trim();

  if (!userId || !eventId) {
    return { error: 'eventId is required.' };
  }

  const [student, event] = await Promise.all([
    User.findById(userId).select('-password'),
    Event.findById(eventId)
  ]);

  if (!student) {
    return { error: 'Student not found.', status: 404 };
  }

  if (!event) {
    return { error: 'Event not found.', status: 404 };
  }

  if (!event.isPaid || Number(event.amount || 0) <= 0) {
    return { error: 'This event does not require payment.', status: 400 };
  }

  return { student, event };
}

exports.createOrder = async (req, res) => {
  try {
    const { student, event, error, status } = await getStudentAndEvent(req);
    if (error) {
      return res.status(status || 400).json({ error });
    }

    const razorpay = getRazorpayClient();
    if (razorpay.error) {
      return res.status(500).json({ error: razorpay.error });
    }

    const amount = Number(event.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Paid event amount is invalid.' });
    }

    const existingSuccess = await Payment.findOne({
      userId: String(student._id),
      eventId: String(event._id),
      status: 'success',
      verified: true
    }).sort({ createdAt: -1 });

    if (existingSuccess) {
      return res.status(200).json({
        alreadyPaid: true,
        orderId: existingSuccess.orderId,
        amount: existingSuccess.amount,
        currency: existingSuccess.currency,
        paymentId: existingSuccess.paymentId
      });
    }

    const order = await razorpay.client.orders.create({
      amount: Math.round(amount * 100),
      currency: String(event.currency || 'INR').trim() || 'INR',
      receipt: `evt_${String(event._id).slice(-8)}_${Date.now()}`,
      notes: {
        eventId: String(event._id),
        userId: String(student._id),
        eventName: String(event.name || ''),
        studentEmail: String(student.email || '')
      }
    });

    await Payment.findOneAndUpdate(
      { orderId: order.id },
      {
        paymentId: `pending-${order.id}`,
        orderId: order.id,
        signature: '',
        userId: String(student._id),
        userName: student.name,
        userEmail: student.email,
        eventId: String(event._id),
        eventName: event.name,
        collegeName: event.collegeName || student.college || '',
        adminId: event.adminId || event.createdById || '',
        amount,
        currency: String(order.currency || event.currency || 'INR'),
        status: 'created',
        verified: false,
        receiptReference: String(order.receipt || '')
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      orderId: order.id,
      amount,
      currency: String(order.currency || event.currency || 'INR'),
      keyId: razorpay.keyId,
      eventId: String(event._id),
      eventName: event.name,
      studentName: student.name,
      studentEmail: student.email
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create payment order.', details: error.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const eventId = String(req.body?.eventId || '').trim();
    const orderId = String(req.body?.orderId || req.body?.razorpay_order_id || '').trim();
    const paymentId = String(req.body?.paymentId || req.body?.razorpay_payment_id || '').trim();
    const signature = String(req.body?.signature || req.body?.razorpay_signature || '').trim();

    if (!userId || !eventId || !orderId || !paymentId || !signature) {
      return res.status(400).json({ error: 'eventId, orderId, paymentId, and signature are required.' });
    }

    const [student, event] = await Promise.all([
      User.findById(userId).select('-password'),
      Event.findById(eventId)
    ]);

    if (!student || !event) {
      return res.status(404).json({ error: 'Student or event not found.' });
    }

    const keySecret = getConfigValue('RAZORPAY_KEY_SECRET');
    if (!keySecret) {
      return res.status(500).json({ error: 'RAZORPAY_KEY_SECRET is not configured.' });
    }

    const expectedSignature = buildSignature(orderId, paymentId, keySecret);
    if (expectedSignature !== signature) {
      await Payment.findOneAndUpdate(
        { orderId },
        {
          paymentId,
          signature,
          userId,
          userName: student.name,
          userEmail: student.email,
          eventId: String(event._id),
          eventName: event.name,
          collegeName: event.collegeName || student.college || '',
          adminId: event.adminId || event.createdById || '',
          amount: Number(event.amount || 0),
          currency: String(event.currency || 'INR'),
          status: 'failed',
          verified: false
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.status(400).json({ error: 'Payment signature validation failed.' });
    }

    const payment = await Payment.findOneAndUpdate(
      { orderId },
      {
        paymentId,
        signature,
        userId,
        userName: student.name,
        userEmail: student.email,
        eventId: String(event._id),
        eventName: event.name,
        collegeName: event.collegeName || student.college || '',
        adminId: event.adminId || event.createdById || '',
        amount: Number(event.amount || 0),
        currency: String(event.currency || 'INR'),
        status: 'success',
        verified: true,
        verifiedAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Registration.findOneAndUpdate(
      { eventId: String(event._id), studentId: userId },
      {
        paymentRequired: true,
        paymentStatus: 'SUCCESS',
        paymentVerified: true,
        paymentId,
        orderId
      }
    );

    return res.json({
      success: true,
      verified: true,
      payment: {
        id: String(payment._id),
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        eventId: payment.eventId,
        eventName: payment.eventName,
        amount: payment.amount,
        currency: payment.currency,
        status: 'SUCCESS',
        verifiedAt: payment.verifiedAt,
        userName: payment.userName
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Payment verification failed.', details: error.message });
  }
};

exports.savePayment = async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const eventId = String(req.body?.eventId || '').trim();
    const paymentId = String(req.body?.paymentId || '').trim();
    const orderId = String(req.body?.orderId || '').trim();

    if (!userId || !eventId || !paymentId || !orderId) {
      return res.status(400).json({ error: 'eventId, paymentId, and orderId are required.' });
    }

    const payment = await Payment.findOne({
      userId,
      eventId,
      paymentId,
      orderId,
      status: 'success',
      verified: true
    });

    if (!payment) {
      return res.status(404).json({ error: 'Verified payment record not found.' });
    }

    return res.status(200).json({
      success: true,
      payment: {
        id: String(payment._id),
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        status: 'SUCCESS',
        verifiedAt: payment.verifiedAt
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to save payment details.', details: error.message });
  }
};

exports.getPaymentStatus = async (req, res) => {
  try {
    const requesterId = String(req.user?.id || '').trim();
    const userId = String(req.params?.userId === 'me' ? requesterId : req.params?.userId || '').trim();
    const eventId = String(req.params?.eventId || '').trim();

    if (!userId || !eventId) {
      return res.status(400).json({ error: 'userId and eventId are required.' });
    }

    if (userId !== requesterId) {
      return res.status(403).json({ error: 'You can only view your own payment status.' });
    }

    const payment = await Payment.findOne({
      userId,
      eventId
    }).sort({ updatedAt: -1, createdAt: -1 });

    if (!payment) {
      return res.json({
        paymentRequired: false,
        status: 'NOT_FOUND',
        verified: false
      });
    }

    return res.json({
      id: String(payment._id),
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      eventId: payment.eventId,
      eventName: payment.eventName,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status === 'success' ? 'SUCCESS' : payment.status === 'failed' ? 'FAILED' : 'PENDING',
      verified: Boolean(payment.verified),
      verifiedAt: payment.verifiedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      paymentRequired: true
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch payment status.', details: error.message });
  }
};

exports.getAdminEventPayments = async (req, res) => {
  try {
    const eventId = String(req.params?.eventId || '').trim();
    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required.' });
    }

    const scopedEventIds = await getCollegeScopedEventIds(req.user?.id);
    if (!scopedEventIds.includes(eventId)) {
      return res.status(403).json({ error: 'You can access payment data only for your college events.' });
    }

    const payments = await Payment.find({
      eventId
    }).sort({ createdAt: -1 });

    return res.json(payments.map((payment) => ({
      id: String(payment._id),
      paymentId: payment.paymentId,
      orderId: payment.orderId,
      userId: payment.userId,
      userName: payment.userName,
      userEmail: payment.userEmail,
      eventId: payment.eventId,
      eventName: payment.eventName,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      verified: payment.verified,
      verifiedAt: payment.verifiedAt,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt
    })));
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch event payment details.', details: error.message });
  }
};

exports.downloadReceipt = async (req, res) => {
  try {
    const paymentId = String(req.params?.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({ error: 'paymentId is required.' });
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    if (String(payment.userId) !== String(req.user?.id || '').trim()) {
      return res.status(403).json({ error: 'You can only download your own receipt.' });
    }

    if (!payment.verified || payment.status !== 'success') {
      return res.status(400).json({ error: 'Receipt is available only for verified successful payments.' });
    }

    const pdfBuffer = buildPaymentReceiptPdf({
      payment,
      studentName: payment.userName,
      eventName: payment.eventName
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${payment.paymentId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to generate payment receipt.', details: error.message });
  }
};
