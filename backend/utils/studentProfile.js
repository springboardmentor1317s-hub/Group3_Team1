function normalizeText(value) {
  return String(value || "").trim();
}

function buildMergedStudentProfile(user, details) {
  const merged = {
    id: String(user._id),
    name: user.name,
    userId: user.userId,
    email: user.email,
    role: user.role,
    college: user.college || "",
    profileImageUrl: user.profileImageUrl || "",
    gender: details?.gender || "",
    dateOfBirth: details?.dateOfBirth || "",
    phone: details?.phone || "",
    parentPhone: details?.parentPhone || "",
    department: details?.department || "",
    departmentOther: details?.departmentOther || "",
    currentClass: details?.currentClass || "",
    semester: details?.semester || "",
    currentCgpa: details?.currentCgpa || "",
    currentState: details?.currentState || "",
    currentDistrict: details?.currentDistrict || "",
    currentCity: details?.currentCity || "",
    currentPincode: details?.currentPincode || "",
    currentAddressLine: details?.currentAddressLine || "",
    permanentState: details?.permanentState || "",
    permanentDistrict: details?.permanentDistrict || "",
    permanentCity: details?.permanentCity || "",
    permanentPincode: details?.permanentPincode || "",
    permanentAddressLine: details?.permanentAddressLine || "",
    adminApprovalStatus: user.adminApprovalStatus || "approved",
    adminRejectionReason: user.adminRejectionReason || "",
    createdAt: user.createdAt,
    updatedAt: details?.updatedAt || user.updatedAt
  };

  return {
    ...merged,
    profileCompleted: isStudentProfileComplete(merged)
  };
}

function isStudentProfileComplete(profile) {
  if (!profile) {
    return false;
  }

  const department = normalizeText(profile.department);
  const departmentOther = normalizeText(profile.departmentOther);

  const requiredValues = [
    profile.name,
    profile.email,
    profile.college,
    profile.gender,
    profile.dateOfBirth,
    profile.phone,
    profile.currentClass,
    profile.semester,
    profile.currentCgpa,
    profile.currentState,
    profile.currentDistrict,
    profile.currentCity,
    profile.currentPincode,
    profile.currentAddressLine,
    profile.permanentState,
    profile.permanentDistrict,
    profile.permanentCity,
    profile.permanentPincode,
    profile.permanentAddressLine
  ];

  if (requiredValues.some((value) => !normalizeText(value))) {
    return false;
  }

  if (!department) {
    return false;
  }

  if (department === "Other" && !departmentOther) {
    return false;
  }

  return true;
}

module.exports = {
  buildMergedStudentProfile,
  isStudentProfileComplete
};
