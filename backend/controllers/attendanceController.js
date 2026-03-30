const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const Registration = require("../models/Registration");
const Event = require("../models/Event");
const User = require("../models/User");
const StudentProfileDetails = require("../models/StudentProfileDetails");
const AdmitCard = require("../models/AdmitCard");
const AttendanceRecord = require("../models/AttendanceRecord");
const { getCollegeScopedEventIds } = require("../utils/adminCollegeScope");

function isAdminRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "college_admin" || normalized === "admin";
}

function normalizeStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "APPROVED") return "APPROVED";
  if (normalized === "REJECTED") return "REJECTED";
  return "PENDING";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function createSecureToken({ studentId, eventId, registrationId }) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(12).toString("hex");
  const payload = `${studentId}|${eventId}|${registrationId}|${timestamp}|${nonce}`;
  const secret = String(process.env.JWT_SECRET || "attendance-secret");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return Buffer.from(`${payload}|${signature}`).toString("base64url");
}

function createCardCode(eventId, studentId, studentName = "") {
  const nameSeed = String(studentName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 3)
    .padEnd(3, "X");

  const digest = crypto
    .createHash("sha1")
    .update(`${String(eventId || "")}|${String(studentId || "")}|${String(studentName || "").toLowerCase()}`)
    .digest("hex")
    .toUpperCase();

  return `CEH-${nameSeed}-${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

async function hasAdminEventAccess({ userId, role, eventId, eventDoc = null }) {
  const normalizedRole = normalizeText(role);
  if (normalizedRole === "admin") {
    return true;
  }

  const scopedEventIds = await getCollegeScopedEventIds(userId);
  if (scopedEventIds.includes(String(eventId))) {
    return true;
  }

  const [event, adminUser] = await Promise.all([
    eventDoc ? Promise.resolve(eventDoc) : Event.findById(eventId).lean(),
    User.findById(userId).select("name email userId college").lean()
  ]);

  if (!event || !adminUser) {
    return false;
  }

  const adminCollege = normalizeText(adminUser.college);
  const eventCollege = normalizeText(event.collegeName);
  if (adminCollege && eventCollege && adminCollege === eventCollege) {
    return true;
  }

  const adminIdentifiers = new Set(
    [
      String(adminUser._id || ""),
      String(adminUser.userId || ""),
      String(adminUser.email || ""),
      String(adminUser.name || "")
    ].map(normalizeText).filter(Boolean)
  );

  const eventIdentifiers = [
    event.createdById,
    event.ownerId,
    event.adminId,
    event.userId,
    event.email,
    event.createdBy
  ].map(normalizeText).filter(Boolean);

  return eventIdentifiers.some((value) => adminIdentifiers.has(value));
}

function isSameDateAsToday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function formatDateTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value || "Not specified");
  }
  return parsed.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeScanPayload(payload) {
  if (!payload) return null;

  let parsed = payload;
  if (typeof payload === "string") {
    const trimmed = payload.trim();

    // Allow direct QR URLs as payload, so mobile camera scan can still be parsed
    // by in-app scanner and backend validation.
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        parsed = {
          studentId: String(url.searchParams.get("studentId") || "").trim(),
          eventId: String(url.searchParams.get("eventId") || "").trim(),
          token: String(url.searchParams.get("token") || "").trim()
        };
      } catch {
        return null;
      }
    } else {
      try {
        parsed = JSON.parse(payload);
      } catch {
        return null;
      }
    }
  }

  const studentId = String(parsed.studentId || "").trim();
  const eventId = String(parsed.eventId || "").trim();
  const token = String(parsed.token || "").trim();
  if (!studentId || !eventId || !token) {
    return null;
  }

  return { studentId, eventId, token };
}

function getBackendBaseUrl(req = null) {
  const configured = String(process.env.BACKEND_PUBLIC_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (req) {
    const protocol = String(req.protocol || "http");
    const host = String(req.get("host") || `localhost:${process.env.PORT || 5000}`);
    return `${protocol}://${host}`.replace(/\/+$/, "");
  }

  return `http://localhost:${process.env.PORT || 5000}`;
}

function buildQrDetailsUrl({ studentId, eventId, token, req = null }) {
  const baseUrl = getBackendBaseUrl(req);
  const params = new URLSearchParams({
    studentId: String(studentId || ""),
    eventId: String(eventId || ""),
    token: String(token || "")
  });
  return `${baseUrl}/api/attendance/qr-details?${params.toString()}`;
}

function wrapText(value, fallback = "Not specified") {
  const text = String(value || "").trim();
  return text || fallback;
}

async function loadImageBufferFromUrl(sourceUrl) {
  const urlText = String(sourceUrl || "").trim();
  if (!urlText) return null;

  if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(urlText)) {
    const base64Part = urlText.split(",")[1] || "";
    if (!base64Part) return null;
    return Buffer.from(base64Part, "base64");
  }

  if (/^https?:\/\//i.test(urlText)) {
    const client = urlText.startsWith("https://") ? https : http;
    return new Promise((resolve) => {
      const request = client.get(urlText, (response) => {
        const statusCode = Number(response.statusCode || 0);
        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          resolve(null);
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
      });
      request.setTimeout(4000, () => {
        request.destroy();
        resolve(null);
      });
      request.on("error", () => resolve(null));
    });
  }

  const possibleFilePath = path.resolve(process.cwd(), urlText);
  if (fs.existsSync(possibleFilePath)) {
    return fs.readFileSync(possibleFilePath);
  }

  return null;
}

async function resolveStudentPhotoBuffer(student, profile) {
  const sources = [
    profile?.profileImageUrl,
    student?.profileImageUrl
  ];

  for (const source of sources) {
    const imageBuffer = await loadImageBufferFromUrl(source);
    if (imageBuffer) {
      return imageBuffer;
    }
  }

  return null;
}

function buildQrDetailsHtml({ event, registration, student, profile, admitCard, markedAt }) {
  const safe = (value, fallback = "Not specified") => wrapText(value, fallback)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const statusText = markedAt ? "Present" : "Approved";
  const statusColor = markedAt ? "#16a34a" : "#2563eb";
  const statusBg = markedAt ? "rgba(22,163,74,0.12)" : "rgba(37,99,235,0.12)";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Student Attendance QR Details</title>
  <style>
    :root {
      color-scheme: light;
      --text: #0f172a;
      --muted: #64748b;
      --line: #dbe2f0;
      --card: #ffffff;
      --bg: linear-gradient(160deg, #eff6ff 0%, #f8fafc 45%, #e0f2fe 100%);
    }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Inter", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 24px;
      box-sizing: border-box;
    }
    .card {
      width: min(760px, 100%);
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
      overflow: hidden;
    }
    .head {
      padding: 20px 24px;
      background: linear-gradient(120deg, #1d4ed8, #0369a1);
      color: #fff;
    }
    .head h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.3px;
    }
    .head p {
      margin: 6px 0 0;
      opacity: 0.9;
      font-size: 14px;
    }
    .body {
      padding: 22px 24px 26px;
      display: grid;
      gap: 16px;
    }
    .status {
      justify-self: start;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      background: ${statusBg};
      color: ${statusColor};
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px 16px;
    }
    .cell {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .k { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
    .v { margin-top: 4px; font-size: 15px; font-weight: 700; color: var(--text); }
  </style>
</head>
<body>
  <section class="card">
    <header class="head">
      <h1>Campus Event Hub - QR Student Details</h1>
      <p>Verified attendee information from secured admit card token</p>
    </header>
    <div class="body">
      <div class="status">${statusText}</div>
      <div class="grid">
        <article class="cell"><div class="k">Student Name</div><div class="v">${safe(registration?.studentName || student?.name)}</div></article>
        <article class="cell"><div class="k">Student ID</div><div class="v">${safe(student?.userId || registration?.studentId)}</div></article>
        <article class="cell"><div class="k">Card Code</div><div class="v">${safe(admitCard?.cardCode)}</div></article>
        <article class="cell"><div class="k">College</div><div class="v">${safe(registration?.college || student?.college)}</div></article>
        <article class="cell"><div class="k">Event Name</div><div class="v">${safe(registration?.eventName || event?.name)}</div></article>
        <article class="cell"><div class="k">Event Date & Time</div><div class="v">${safe(formatDateTime(event?.dateTime))}</div></article>
        <article class="cell"><div class="k">Location</div><div class="v">${safe(event?.location)}</div></article>
        <article class="cell"><div class="k">Gender</div><div class="v">${safe(profile?.gender || student?.gender)}</div></article>
        <article class="cell"><div class="k">Mobile</div><div class="v">${safe(profile?.phone || student?.phone)}</div></article>
        <article class="cell"><div class="k">DOB</div><div class="v">${safe(profile?.dateOfBirth || student?.dateOfBirth)}</div></article>
      </div>
    </div>
  </section>
</body>
</html>`;
}

async function buildAdmitCardPdfBuffer({
  student,
  profile,
  registration,
  event,
  qrPayload,
  admitCard
}) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 36
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const endPromise = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const baseX = 52;
  const frontY = 70;
  const cardW = 220;
  const cardH = 340;
  const gap = 30;
  const backX = baseX + cardW + gap;
  const backY = frontY;

  doc.save();
  doc.roundedRect(baseX, frontY, cardW, cardH, 16).clip();
  const frontGradient = doc.linearGradient(baseX, frontY, baseX, frontY + cardH);
  frontGradient.stop(0, "#2d7fe6").stop(0.52, "#174a9b").stop(1, "#121f40");
  doc.rect(baseX, frontY, cardW, cardH).fill(frontGradient);
  doc.restore();

  doc.save();
  doc.roundedRect(backX, backY, cardW, cardH, 16).clip();
  const backGradient = doc.linearGradient(backX, backY, backX, backY + cardH);
  backGradient.stop(0, "#ffffff").stop(1, "#dff5ff");
  doc.rect(backX, backY, cardW, cardH).fill(backGradient);
  doc.restore();

  doc.roundedRect(baseX, frontY, cardW, cardH, 16).lineWidth(1).stroke("#bfd7ff");
  doc.roundedRect(backX, backY, cardW, cardH, 16).lineWidth(1).stroke("#bfd7ff");

  const logoPathCandidates = [
    path.resolve(__dirname, "../../public/favicon-ceh.png"),
    path.resolve(__dirname, "../../public/icon2.png")
  ];
  const logoPath = logoPathCandidates.find((candidate) => fs.existsSync(candidate));

  if (logoPath) {
    doc.image(logoPath, baseX + 14, frontY + 16, { width: 36, height: 36 });
    doc.image(logoPath, backX + 14, backY + 16, { width: 30, height: 30 });
  }

  doc.font("Helvetica-Bold").fillColor("#ffffff").fontSize(16).text("EVENT ID CARD", baseX + 60, frontY + 24);
  doc.font("Helvetica").fillColor("#dbeafe").fontSize(9).text("Campus Event Hub", baseX + 60, frontY + 45);

  const safeProfile = profile || {};
  const studentName = wrapText(student?.name || registration.studentName || "Student");
  const eventName = wrapText(event?.name || registration.eventName || "Campus Event");
  const dob = wrapText(safeProfile.dateOfBirth || student?.dateOfBirth);
  const mobile = wrapText(safeProfile.phone || student?.phone);
  const email = wrapText(student?.email || registration.email);
  const cardCode = wrapText(admitCard?.cardCode || createCardCode(registration.eventId, registration.studentId, registration.studentName));
  const studentDbIdText = wrapText(registration.studentId);
  const studentPortalIdText = wrapText(student?.userId);

  const photoFrameX = baseX + 66;
  const photoFrameY = frontY + 78;
  const photoSize = 88;
  doc.roundedRect(photoFrameX - 2, photoFrameY - 2, photoSize + 4, photoSize + 4, 18).fill("#ffffff");
  doc.roundedRect(photoFrameX, photoFrameY, photoSize, photoSize, 16).fill("#0b1730");

  const studentPhotoBuffer = await resolveStudentPhotoBuffer(student, safeProfile);
  if (studentPhotoBuffer) {
    doc.save();
    doc.roundedRect(photoFrameX, photoFrameY, photoSize, photoSize, 16).clip();
    doc.image(studentPhotoBuffer, photoFrameX, photoFrameY, {
      fit: [photoSize, photoSize],
      align: "center",
      valign: "center"
    });
    doc.restore();
  } else {
    doc.font("Helvetica-Bold").fillColor("#93c5fd").fontSize(30).text(studentName.charAt(0).toUpperCase() || "S", photoFrameX + 34, photoFrameY + 28);
  }

  doc.font("Helvetica-Bold").fillColor("#e0f2fe").fontSize(17).text(studentName, baseX + 18, frontY + 182, {
    width: cardW - 36,
    align: "center"
  });
  doc.font("Helvetica").fillColor("#bfdbfe").fontSize(10).text(eventName, baseX + 18, frontY + 205, {
    width: cardW - 36,
    align: "center"
  });

  const studentFields = [
    ["ID NUMBER", cardCode],
    ["STUDENT DB ID", studentDbIdText],
    ["PORTAL ID", studentPortalIdText],
    ["DATE OF BIRTH", dob],
    ["PHONE", mobile]
  ];

  let y = frontY + 236;
  for (const [label, value] of studentFields) {
    doc.font("Helvetica-Bold").fillColor("#cbd5e1").fontSize(7.5).text(label, baseX + 18, y);
    doc.font("Helvetica").fillColor("#ffffff").fontSize(9.5).text(value, baseX + 18, y + 10, {
      width: cardW - 36,
      ellipsis: true
    });
    y += 20;
  }

  doc.font("Helvetica-Bold").fillColor("#111827").fontSize(15).text("EVENT ID CARD", backX + 52, backY + 22);
  doc.font("Helvetica").fillColor("#475569").fontSize(9).text("Terms and Entry Details", backX + 14, backY + 64);
  doc.font("Helvetica").fillColor("#334155").fontSize(8).text(
    "Carry this card with a valid college ID. QR code is mandatory for attendance marking.",
    backX + 14,
    backY + 80,
    { width: cardW - 28 }
  );

  const eventFields = [
    ["Student Name", studentName],
    ["College", wrapText(student?.college || registration.college)],
    ["Gender", wrapText(safeProfile.gender || student?.gender)],
    ["Event Name", eventName],
    ["Event Date & Time", formatDateTime(event?.dateTime)],
    ["Location", wrapText(event?.location)],
    ["Email", email]
  ];

  y = backY + 120;
  for (const [label, value] of eventFields) {
    doc.font("Helvetica-Bold").fillColor("#1e3a8a").fontSize(7.5).text(label, backX + 14, y);
    doc.font("Helvetica").fillColor("#0f172a").fontSize(8.8).text(String(value || "Not specified"), backX + 14, y + 9, {
      width: cardW - 28,
      ellipsis: true
    });
    y += 24;
  }

  const qrContent = String(qrPayload?.detailsUrl || "");
  const qrDataUrl = await QRCode.toDataURL(qrContent, {
    width: 280,
    margin: 1
  });

  doc.image(qrDataUrl, backX + 14, backY + 266, { width: 70, height: 70 });
  doc.font("Helvetica-Bold").fillColor("#0f172a").fontSize(9).text("Scan QR for Verified Student Details", backX + 88, backY + 272, {
    width: 120
  });
  doc.font("Helvetica").fillColor("#64748b").fontSize(6.8).text("Secure link contains: studentId, eventId and token hash mapping.", backX + 88, backY + 290, {
    width: 115
  });
  doc.font("Helvetica-Bold").fillColor("#1d4ed8").fontSize(8.5).text(cardCode, backX + 88, backY + 312, {
    width: 120,
    ellipsis: true
  });

  doc.font("Helvetica").fillColor("#64748b").fontSize(8).text("Generated by Campus Event Hub", 36, 782, {
    width: 540,
    align: "center"
  });

  doc.end();
  return endPromise;
}

exports.getMyApprovedEvents = async (req, res) => {
  try {
    const studentId = String(req.user?.id || "").trim();
    if (!studentId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const approvedRegistrations = await Registration.find({
      studentId,
      status: { $regex: /^APPROVED$/i }
    }).sort({ updatedAt: -1 });

    const eventIds = approvedRegistrations.map((registration) => String(registration.eventId));
    const [events, admitCards] = await Promise.all([
      Event.find({ _id: { $in: eventIds } }),
      AdmitCard.find({ eventId: { $in: eventIds }, studentId })
    ]);

    const eventMap = new Map(events.map((event) => [String(event._id), event]));
    const admitCardMap = new Map(admitCards.map((card) => [String(card.eventId), card]));

    const items = approvedRegistrations.map((registration) => {
      const event = eventMap.get(String(registration.eventId));
      const card = admitCardMap.get(String(registration.eventId));

      return {
        registrationId: String(registration._id),
        eventId: registration.eventId,
        eventName: registration.eventName,
        eventDateTime: event?.dateTime || "",
        eventLocation: event?.location || "",
        eventCategory: event?.category || "",
        college: registration.college || "",
        admitCardGenerated: !!card,
        admitCardGeneratedAt: card?.generatedAt || null,
        canDownloadAdmitCard: !!card
      };
    });

    return res.json(items);
  } catch (error) {
    return res.status(500).json({ message: "Failed to fetch approved events." });
  }
};

exports.generateAdmitCardsForEvent = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can generate admit cards." });
    }

    const eventId = String(req.params?.eventId || "").trim();
    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    const [event, approvedRegistrations] = await Promise.all([
      Event.findById(eventId),
      Registration.find({
        eventId,
        status: { $regex: /^APPROVED$/i }
      })
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!approvedRegistrations.length) {
      return res.status(400).json({ message: "No approved students found for this event." });
    }

    const now = new Date();
    const generatedBy = String(req.user?.id || "");

    const results = await Promise.allSettled(
      approvedRegistrations.map(async (registration) => {
        const normalizedEventId = String(registration.eventId || eventId);
        const normalizedStudentId = String(registration.studentId || "");
        const registrationId = String(registration._id || "");
        if (!normalizedStudentId) {
          throw new Error("Missing studentId in approved registration.");
        }

        const token = createSecureToken({
          studentId: normalizedStudentId,
          eventId: normalizedEventId,
          registrationId
        });
        const tokenHash = hashToken(token);

        const outcome = await AdmitCard.updateOne(
          {
            eventId: normalizedEventId,
            studentId: normalizedStudentId
          },
          {
            $set: {
              eventId: normalizedEventId,
              studentId: normalizedStudentId,
              registrationId,
              tokenHash,
              cardCode: createCardCode(normalizedEventId, normalizedStudentId, registration.studentName),
              generatedBy,
              generatedAt: now
            },
            $setOnInsert: {
              lastDownloadedAt: null
            }
          },
          { upsert: true }
        );

        return {
          created: Number(outcome.upsertedCount || 0),
          updated: Number(outcome.matchedCount || 0)
        };
      })
    );

    let createdCount = 0;
    let updatedCount = 0;
    let failedCount = 0;

    for (const item of results) {
      if (item.status === "fulfilled") {
        createdCount += Number(item.value.created || 0);
        updatedCount += Number(item.value.updated || 0);
      } else {
        failedCount += 1;
      }
    }

    if (createdCount === 0 && updatedCount === 0) {
      return res.status(500).json({
        message: "Admit card generation failed. No student record could be processed.",
        totalApproved: approvedRegistrations.length,
        created: 0,
        refreshed: 0,
        failed: failedCount
      });
    }

    return res.json({
      message: "Admit cards generated successfully.",
      totalApproved: approvedRegistrations.length,
      created: createdCount,
      refreshed: updatedCount,
      failed: failedCount
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to generate admit cards.",
      details: String(error?.message || "")
    });
  }
};

exports.downloadMyAdmitCard = async (req, res) => {
  try {
    const requesterId = String(req.user?.id || "").trim();
    const eventId = String(req.params?.eventId || "").trim();
    const adminPreviewMode = String(req.query?.adminPreview || "").toLowerCase() === "true";
    const requestedStudentId = String(req.query?.studentId || "").trim();

    if (!requesterId || !eventId) {
      return res.status(400).json({ message: "Invalid student or event." });
    }

    let studentId = requesterId;
    let registration = null;

    if (adminPreviewMode) {
      if (!isAdminRole(req.user?.role)) {
        return res.status(403).json({ message: "Only admins can preview admit card." });
      }

      registration = await Registration.findOne({
        eventId,
        ...(requestedStudentId ? { studentId: requestedStudentId } : {}),
        status: { $regex: /^APPROVED$/i }
      }).sort({ studentName: 1 });

      if (!registration) {
        return res.status(400).json({ message: "No approved students found for this event." });
      }

      studentId = String(registration.studentId || "").trim();
    }

    const [event, student, profile] = await Promise.all([
      Event.findById(eventId),
      User.findById(studentId).select("-password"),
      StudentProfileDetails.findOne({ user: studentId }).lean()
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!registration) {
      registration = await Registration.findOne({
        studentId,
        eventId,
        status: { $regex: /^APPROVED$/i }
      });
    }

    if (!registration) {
      return res.status(403).json({ message: "Only approved students can download admit card." });
    }

    let admitCard = await AdmitCard.findOne({ studentId, eventId });
    if (!admitCard) {
      return res.status(403).json({
        message: "Admit card is not generated by admin for this event yet."
      });
    }

    const token = createSecureToken({
      studentId,
      eventId,
      registrationId: String(registration._id)
    });
    if (!admitCard.cardCode) {
      admitCard.cardCode = createCardCode(eventId, studentId, registration.studentName);
    }
    admitCard.tokenHash = hashToken(token);
    admitCard.lastDownloadedAt = new Date();
    await admitCard.save();

    const qrPayload = {
      studentId,
      eventId,
      token,
      cardCode: admitCard.cardCode,
      detailsUrl: buildQrDetailsUrl({ studentId, eventId, token, req })
    };

    const pdfBuffer = await buildAdmitCardPdfBuffer({
      student,
      profile,
      registration,
      event,
      qrPayload,
      admitCard
    });

    const fileSafeEventName = String(registration.eventName || "event").replace(/[^a-z0-9]+/gi, "_");
    const fileName = `admit_card_${fileSafeEventName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${adminPreviewMode ? "inline" : "attachment"}; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to download admit card." });
  }
};

exports.previewAdmitCardForEvent = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can preview admit cards." });
    }

    const eventId = String(req.params?.eventId || "").trim();
    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    const [event, registration] = await Promise.all([
      Event.findById(eventId),
      Registration.findOne({
        eventId,
        status: { $regex: /^APPROVED$/i }
      }).sort({ studentName: 1 })
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!registration) {
      return res.status(400).json({ message: "No approved students found for this event." });
    }

    const [student, profile] = await Promise.all([
      User.findById(registration.studentId).select("-password"),
      StudentProfileDetails.findOne({ user: registration.studentId }).lean()
    ]);

    const token = createSecureToken({
      studentId: registration.studentId,
      eventId,
      registrationId: String(registration._id)
    });

    const admitCard = await AdmitCard.findOne({
      eventId,
      studentId: registration.studentId
    });

    if (!admitCard) {
      return res.status(404).json({
        message: "No generated admit card found. Please generate admit cards first for this event."
      });
    }

    admitCard.registrationId = String(registration._id);
    admitCard.tokenHash = hashToken(token);
    if (!admitCard.cardCode) {
      admitCard.cardCode = createCardCode(eventId, registration.studentId, registration.studentName);
    }
    admitCard.lastDownloadedAt = new Date();
    await admitCard.save();

    const qrPayload = {
      studentId: registration.studentId,
      eventId,
      token,
      cardCode: admitCard.cardCode,
      detailsUrl: buildQrDetailsUrl({ studentId: registration.studentId, eventId, token, req })
    };

    const pdfBuffer = await buildAdmitCardPdfBuffer({
      student,
      profile,
      registration,
      event,
      qrPayload,
      admitCard
    });

    const fileSafeEventName = String(event.name || "event").replace(/[^a-z0-9]+/gi, "_");
    const fileName = `preview_id_card_${fileSafeEventName}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to preview admit card." });
  }
};

exports.previewAdmitCardForStudent = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can preview admit cards." });
    }

    const eventId = String(req.params?.eventId || "").trim();
    const studentId = String(req.params?.studentId || "").trim();
    if (!eventId || !studentId) {
      return res.status(400).json({ message: "eventId and studentId are required." });
    }

    const [event, registration] = await Promise.all([
      Event.findById(eventId),
      Registration.findOne({
        eventId,
        studentId,
        status: { $regex: /^APPROVED$/i }
      })
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (!registration) {
      return res.status(404).json({ message: "Approved registration not found for this student." });
    }

    const [student, profile] = await Promise.all([
      User.findById(studentId).select("-password"),
      StudentProfileDetails.findOne({ user: studentId }).lean()
    ]);

    const token = createSecureToken({
      studentId,
      eventId,
      registrationId: String(registration._id)
    });

    const admitCard = await AdmitCard.findOne({ eventId, studentId });
    if (!admitCard) {
      return res.status(404).json({
        message: "No generated admit card found for this student. Please generate admit cards first."
      });
    }

    admitCard.registrationId = String(registration._id);
    admitCard.tokenHash = hashToken(token);
    if (!admitCard.cardCode) {
      admitCard.cardCode = createCardCode(eventId, studentId, registration.studentName);
    }
    admitCard.lastDownloadedAt = new Date();
    await admitCard.save();

    const qrPayload = {
      studentId,
      eventId,
      token,
      cardCode: admitCard.cardCode,
      detailsUrl: buildQrDetailsUrl({ studentId, eventId, token, req })
    };

    const pdfBuffer = await buildAdmitCardPdfBuffer({
      student,
      profile,
      registration,
      event,
      qrPayload,
      admitCard
    });

    const fileSafeEventName = String(event.name || "event").replace(/[^a-z0-9]+/gi, "_");
    const fileName = `preview_id_card_${fileSafeEventName}_${studentId}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: "Failed to preview student admit card." });
  }
};

exports.getQrDetailsFromToken = async (req, res) => {
  try {
    const studentId = String(req.query?.studentId || "").trim();
    const eventId = String(req.query?.eventId || "").trim();
    const token = String(req.query?.token || "").trim();

    if (!studentId || !eventId || !token) {
      return res.status(400).send("Invalid QR details request.");
    }

    const admitCard = await AdmitCard.findOne({
      studentId,
      eventId,
      tokenHash: hashToken(token)
    });

    if (!admitCard) {
      return res.status(400).send("Invalid or expired QR token.");
    }

    const [registration, event, student, profile, attendance] = await Promise.all([
      Registration.findOne({
        _id: admitCard.registrationId,
        studentId,
        eventId
      }),
      Event.findById(eventId),
      User.findById(studentId).select("-password"),
      StudentProfileDetails.findOne({ user: studentId }).lean(),
      AttendanceRecord.findOne({ studentId, eventId }).lean()
    ]);

    if (!registration || normalizeStatus(registration.status) !== "APPROVED") {
      return res.status(400).send("Student is not approved for this event.");
    }

    const html = buildQrDetailsHtml({
      event,
      registration,
      student,
      profile,
      admitCard,
      markedAt: attendance?.markedAt || null
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    return res.status(500).send("Failed to load QR student details.");
  }
};

exports.getTodayEventsForAttendance = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can view attendance events." });
    }

    const scopedEventIds = await getCollegeScopedEventIds(req.user?.id);
    if (!scopedEventIds.length) {
      return res.json([]);
    }

    const events = await Event.find({
      _id: { $in: scopedEventIds }
    }).sort({ dateTime: 1 });

    const todayEvents = events.filter((event) => isSameDateAsToday(event.dateTime));
    const eventIds = todayEvents.map((event) => String(event._id));

    const [approvedCounts, presentCounts] = await Promise.all([
      Registration.aggregate([
        {
          $match: {
            eventId: { $in: eventIds },
            status: { $regex: /^APPROVED$/i }
          }
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } }
      ]),
      AttendanceRecord.aggregate([
        {
          $match: {
            eventId: { $in: eventIds }
          }
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } }
      ])
    ]);

    const approvedMap = new Map(approvedCounts.map((item) => [String(item._id), Number(item.count || 0)]));
    const presentMap = new Map(presentCounts.map((item) => [String(item._id), Number(item.count || 0)]));

    const payload = todayEvents.map((event) => ({
      eventId: String(event._id),
      eventName: event.name,
      eventDateTime: event.dateTime,
      eventLocation: event.location,
      category: event.category || "Campus Event",
      approvedCount: approvedMap.get(String(event._id)) || 0,
      presentCount: presentMap.get(String(event._id)) || 0
    }));

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load attendance events." });
  }
};

exports.getEventAttendanceRoster = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can access attendance roster." });
    }

    const eventId = String(req.params?.eventId || "").trim();
    if (!eventId) {
      return res.status(400).json({ message: "eventId is required." });
    }

    const [event, registrations, attendanceRecords, admitCards] = await Promise.all([
      Event.findById(eventId),
      Registration.find({
        eventId,
        status: { $regex: /^APPROVED$/i }
      }).sort({ studentName: 1 }),
      AttendanceRecord.find({ eventId }),
      AdmitCard.find({ eventId })
    ]);

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    const presentMap = new Map(attendanceRecords.map((record) => [String(record.studentId), record]));
    const admitMap = new Map(admitCards.map((card) => [String(card.studentId), card]));

    const students = registrations.map((registration) => {
      const attendance = presentMap.get(String(registration.studentId));
      const admitCard = admitMap.get(String(registration.studentId));
      return {
        registrationId: String(registration._id),
        studentId: registration.studentId,
        studentName: registration.studentName,
        email: registration.email,
        college: registration.college,
        status: attendance ? "PRESENT" : "PENDING",
        markedAt: attendance?.markedAt || null,
        admitCardGenerated: !!admitCard,
        cardCode: admitCard?.cardCode || createCardCode(eventId, registration.studentId, registration.studentName)
      };
    });

    return res.json({
      event: {
        eventId: String(event._id),
        eventName: event.name,
        eventDateTime: event.dateTime,
        eventLocation: event.location
      },
      presentCount: attendanceRecords.length,
      totalApproved: registrations.length,
      students
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load attendance roster." });
  }
};

exports.scanAttendance = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: "Only admins can mark attendance." });
    }

    const scanPayload = normalizeScanPayload(req.body?.payload ?? req.body?.qrData ?? req.body);
    if (!scanPayload) {
      return res.status(400).json({ message: "Invalid QR payload.", code: "INVALID_QR" });
    }

    const { studentId, eventId, token } = scanPayload;
    const isManualOverride = token === "MANUAL_OVERRIDE";
    let normalizedStudentId = studentId;

    let admitCard = null;
    let registration = null;

    if (isManualOverride) {
      registration = await Registration.findOne({
        studentId: normalizedStudentId,
        eventId,
        status: { $regex: /^APPROVED$/i }
      });
      if (!registration) {
        const userByPortalId = await User.findOne({ userId: normalizedStudentId }).select("_id");
        if (userByPortalId?._id) {
          normalizedStudentId = String(userByPortalId._id);
          registration = await Registration.findOne({
            studentId: normalizedStudentId,
            eventId,
            status: { $regex: /^APPROVED$/i }
          });
        }
      }
      if (!registration) {
        return res.status(400).json({ message: "Student is not approved for this event.", code: "NOT_APPROVED" });
      }
      admitCard = await AdmitCard.findOne({ studentId: normalizedStudentId, eventId });
    } else {
      admitCard = await AdmitCard.findOne({
        studentId: normalizedStudentId,
        eventId,
        tokenHash: hashToken(token)
      });

      if (!admitCard) {
        return res.status(400).json({ message: "Invalid QR.", code: "INVALID_QR" });
      }

      registration = await Registration.findOne({
        _id: admitCard.registrationId,
        studentId: normalizedStudentId,
        eventId
      });
    }

    if (!registration || normalizeStatus(registration.status) !== "APPROVED") {
      return res.status(400).json({ message: "Student is not approved for this event.", code: "NOT_APPROVED" });
    }

    const [studentDoc, profileDoc, existingRecord] = await Promise.all([
      User.findById(normalizedStudentId).select("name userId email college"),
      StudentProfileDetails.findOne({ user: normalizedStudentId }).lean(),
      AttendanceRecord.findOne({
        eventId,
        studentId: normalizedStudentId
      })
    ]);

    const scannedStudent = {
      id: normalizedStudentId,
      name: registration.studentName || studentDoc?.name || "Student",
      portalId: studentDoc?.userId || "",
      email: registration.email || studentDoc?.email || "",
      college: registration.college || studentDoc?.college || "",
      cardCode: admitCard?.cardCode || "",
      phone: profileDoc?.phone || studentDoc?.phone || "",
      gender: profileDoc?.gender || studentDoc?.gender || "",
      dateOfBirth: profileDoc?.dateOfBirth || studentDoc?.dateOfBirth || ""
    };

    if (existingRecord) {
      return res.status(409).json({
        message: "Attendance already marked.",
        code: "ALREADY_MARKED",
        markedAt: existingRecord.markedAt,
        student: scannedStudent
      });
    }

    const attendance = await AttendanceRecord.create({
      eventId,
      studentId: normalizedStudentId,
      registrationId: String(registration._id || admitCard?.registrationId || ""),
      markedBy: String(req.user?.id || ""),
      markedAt: new Date(),
      source: isManualOverride ? "MANUAL_ADMIN_MARK" : "QR_SCAN"
    });

    const [presentCount, totalApproved] = await Promise.all([
      AttendanceRecord.countDocuments({ eventId }),
      Registration.countDocuments({
        eventId,
        status: { $regex: /^APPROVED$/i }
      })
    ]);

    return res.json({
      message: "Attendance marked successfully.",
      code: "MARKED",
      attendanceId: String(attendance._id),
      studentId: normalizedStudentId,
      eventId,
      markedAt: attendance.markedAt,
      presentCount,
      totalApproved,
      student: scannedStudent
    });
  } catch (error) {
    if (Number(error?.code || 0) === 11000) {
      return res.status(409).json({
        message: "Attendance already marked.",
        code: "ALREADY_MARKED"
      });
    }
    return res.status(500).json({ message: "Failed to mark attendance." });
  }
};
