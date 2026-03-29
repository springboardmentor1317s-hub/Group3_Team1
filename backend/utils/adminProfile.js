const AdminProfileDetails = require("../models/AdminProfileDetails");
const StudentProfileDetails = require("../models/StudentProfileDetails");

function formatRoleLabel(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "college_admin") return "college_admin";
  if (normalized === "admin") return "admin";
  if (normalized === "super_admin") return "super_admin";
  return normalized || "college_admin";
}

function pickAdminField(details, legacyDetails, user, fieldName) {
  const candidates = [
    details?.[fieldName],
    legacyDetails?.[fieldName],
    user?.[fieldName]
  ];

  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }

  return "";
}

async function ensureAdminProfileDetails(user) {
  if (!user?._id) {
    return null;
  }

  const [details, legacyStudentDetails] = await Promise.all([
    AdminProfileDetails.findOne({ user: user._id }).lean(),
    StudentProfileDetails.findOne({ user: user._id }).lean()
  ]);

  const nextDoc = {
    user: user._id,
    userId: user.userId,
    email: user.email,
    phone: pickAdminField(details, legacyStudentDetails, user, "phone"),
    location: pickAdminField(details, legacyStudentDetails, user, "location"),
    department: pickAdminField(details, legacyStudentDetails, user, "department"),
    departmentOther: pickAdminField(details, legacyStudentDetails, user, "departmentOther")
  };

  const shouldUpsert =
    !details ||
    details.userId !== nextDoc.userId ||
    details.email !== nextDoc.email ||
    ["phone", "location", "department", "departmentOther"].some((field) => {
      const currentValue = String(details?.[field] || "");
      const nextValue = String(nextDoc[field] || "");
      return currentValue !== nextValue;
    });

  if (!shouldUpsert) {
    return details;
  }

  return AdminProfileDetails.findOneAndUpdate(
    { user: user._id },
    nextDoc,
    {
      returnDocument: "after",
      upsert: true,
      setDefaultsOnInsert: true,
      runValidators: true
    }
  ).lean();
}

function buildMergedAdminProfile(user, details, legacyDetails) {
  return {
    id: String(user._id),
    name: user.name,
    userId: user.userId,
    email: user.email,
    role: formatRoleLabel(user.role),
    college: user.college || "",
    phone: pickAdminField(details, legacyDetails, user, "phone"),
    location: pickAdminField(details, legacyDetails, user, "location"),
    department: pickAdminField(details, legacyDetails, user, "department"),
    departmentOther: pickAdminField(details, legacyDetails, user, "departmentOther"),
    profileImageUrl: user.profileImageUrl || "",
    createdAt: user.createdAt,
    updatedAt: details?.updatedAt || user.updatedAt
  };
}

module.exports = {
  buildMergedAdminProfile,
  ensureAdminProfileDetails
};
