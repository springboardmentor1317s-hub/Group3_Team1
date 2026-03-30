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
    dateOfBirth: pickAdminField(details, legacyStudentDetails, user, "dateOfBirth"),
    gender: pickAdminField(details, legacyStudentDetails, user, "gender"),
    location: pickAdminField(details, legacyStudentDetails, user, "location"),
    currentState: pickAdminField(details, legacyStudentDetails, user, "currentState"),
    currentDistrict: pickAdminField(details, legacyStudentDetails, user, "currentDistrict"),
    currentCity: pickAdminField(details, legacyStudentDetails, user, "currentCity"),
    department: pickAdminField(details, legacyStudentDetails, user, "department"),
    departmentOther: pickAdminField(details, legacyStudentDetails, user, "departmentOther")
  };

  const shouldUpsert =
    !details ||
    details.userId !== nextDoc.userId ||
    details.email !== nextDoc.email ||
    ["phone", "dateOfBirth", "gender", "location", "currentState", "currentDistrict", "currentCity", "department", "departmentOther"].some((field) => {
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
  const merged = {
    id: String(user._id),
    name: user.name,
    userId: user.userId,
    email: user.email,
    role: formatRoleLabel(user.role),
    college: user.college || "",
    phone: pickAdminField(details, legacyDetails, user, "phone"),
    dateOfBirth: pickAdminField(details, legacyDetails, user, "dateOfBirth"),
    gender: pickAdminField(details, legacyDetails, user, "gender"),
    location: pickAdminField(details, legacyDetails, user, "location"),
    currentState: pickAdminField(details, legacyDetails, user, "currentState"),
    currentDistrict: pickAdminField(details, legacyDetails, user, "currentDistrict"),
    currentCity: pickAdminField(details, legacyDetails, user, "currentCity"),
    department: pickAdminField(details, legacyDetails, user, "department"),
    departmentOther: pickAdminField(details, legacyDetails, user, "departmentOther"),
    profileImageUrl: user.profileImageUrl || "",
    createdAt: user.createdAt,
    updatedAt: details?.updatedAt || user.updatedAt
  };

  return {
    ...merged,
    profileCompleted: isAdminProfileComplete(merged)
  };
}

function isAdminProfileComplete(profile) {
  const requiredFields = [
    profile?.name,
    profile?.email,
    profile?.college,
    profile?.phone,
    profile?.location,
    profile?.department,
    profile?.dateOfBirth,
    profile?.gender,
    profile?.currentState,
    profile?.currentDistrict,
    profile?.currentCity
  ];

  if (String(profile?.department || "").trim() === "Other") {
    requiredFields.push(profile?.departmentOther);
  }

  return requiredFields.every((value) => String(value || "").trim().length > 0);
}

module.exports = {
  buildMergedAdminProfile,
  ensureAdminProfileDetails,
  isAdminProfileComplete
};
