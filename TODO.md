# Student Profile Enhancement - Complete Implementation Plan

## Previous Save Fix ✅
- API endpoint fixed
- Toast notifications added  
- Validation + localStorage sync + change detection implemented

## New Requirements from User Feedback
**Editable fields:** name, college, current_address, permanent_address, department, course, year, semester, heard_from
**Non-editable:** userId, email, role, joinedAt 
**New forms:**
- Current/Permanent address: line1/line2, pincode, country (India default + all countries), conditional state/district/town
- Academic: department/course dropdowns (CSE/IT/BTech/etc + 'Other' textbox)
- Year/semester dropdowns
- How heard about us dropdown

**Backend:** Add all new fields to User model + profileController

## Implementation Steps:
- [ ] 1. Backend: Update User model (add address/academic fields)
- [ ] 2. Backend: Update profileController.updateMyProfile (handle new fields)
- [ ] 3. Frontend: Extend StudentProfile interface in service
- [x] 4. Frontend: Enhanced profile form HTML/TS (conditional forms, dropdowns, checkbox copy address)
- [ ] 5. Frontend: Update validation/save logic for new fields
- [ ] 6. Test: Save new fields, verify DB/backend sync, form UX

**Current progress:** Starting backend model/controller updates (step 1)

