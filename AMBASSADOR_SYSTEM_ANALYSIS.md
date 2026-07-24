# Travel with Hawkins - Campus Ambassador System Analysis

**Analysis Date:** 2026-07-23  
**Status:** Advanced Foundation - Ready for Application Portal & Enhanced Admin Management

---

## 📋 Executive Summary

The Travel with Hawkins platform has a **highly functional ambassador referral system** with:

✅ **Production-Ready Core Features**
- Database schema with 6+ tables, RLS policies, and triggers
- Ambassador account creation with Supabase Auth integration
- Referral code generation and validation
- Commission tracking and status management
- Role-based access control (Admin, Ambassador, Customer)
- Email notifications via Resend API
- Three ambassador dashboard pages (Dashboard, Commissions, Customers)
- Admin dashboard with referrals tab and ambassador management
- Referral program configuration page

⚠️ **Partially Implemented**
- Email notifications (welcome email only; missing commission/payment emails)
- Commission payment workflow (status tracking exists; payment methods pending)
- Admin commission management UI (created but needs visual refinement)

❌ **Missing - High Priority**
- **CRITICAL: Public Ambassador Application Portal** (`/ambassador/apply`)
- **CRITICAL: Admin Application Management Dashboard**
- **CRITICAL: Application Database Tables** (`ambassador_applications` table)
- Automatic ambassador account creation workflow (on approval)
- Supabase Storage for application profile pictures
- Application approval/rejection workflow with automated account setup

---

## 🏗️ Current Architecture

### **Technology Stack**
```
Frontend:    Next.js 16.2.9 (App Router), React 19.2.4, TypeScript, Tailwind CSS 4
Backend:     Next.js API Routes
Database:    Supabase PostgreSQL (via @supabase/supabase-js)
Auth:        Supabase Authentication
Email:       Resend API
Storage:     Supabase Storage (not yet configured)
```

### **Database Schema - Current State**

| Table | Purpose | Status |
|-------|---------|--------|
| `profiles` | User roles (admin/ambassador/customer) | ✅ Ready |
| `ambassadors` | Active ambassador profiles | ✅ Ready |
| `referrals` | Commission tracking (ambassador → booking) | ✅ Ready |
| `commission_rules` | Route-based commission rates | ✅ Ready |
| `commission_transactions` | Payment status tracking | ✅ Ready |
| `bookings` | Extended with referral fields | ✅ Ready |
| `ambassador_applications` | Student applications | ❌ **MISSING** |

---

## 🎯 What's Already Working

### **1. Ambassador Pages** (`/app/ambassador/`)
```
✅ Dashboard        - Shows stats (earnings, referrals, trips)
✅ Commissions      - Commission history table
✅ Customers        - Customers from referrals
✅ Auth Protection  - Token-based access control
```

**Current Behavior:**
- Ambassadors log in (existing Supabase auth)
- See their referrals and commission data
- View only their own data (enforced by RLS)

### **2. Admin Referral Management** (`/app/admin/page.tsx`)
```
✅ Ambassador CRUD  - Create, list, toggle status
✅ Commission Management - Approve, Mark Paid, Delete referrals
✅ Statistics      - Total ambassadors, commission generated
✅ Configuration   - Referral program settings page
```

**Current Behavior:**
- Admin can manually create ambassador accounts
- Admin can update commission statuses (pending → approved → paid)
- System generates referral codes automatically

### **3. API Endpoints**
```
✅ GET    /api/ambassadors         - List ambassadors (admin-only)
✅ POST   /api/ambassadors         - Create ambassador + send email
✅ PATCH  /api/ambassadors         - Update status
✅ GET    /api/referrals           - List referrals (role-filtered)
✅ DELETE /api/referrals           - Remove referral
✅ PATCH  /api/commissions         - Update commission status
✅ POST   /api/referrals/validate  - Validate referral code
✅ GET/POST/PATCH /api/commission-rules - Manage rates
```

### **4. Authentication Pattern**
```
Client:     authFetch() helper (auto-refresh bearer tokens)
Server:     requireAdminUser(), requireAuthenticatedUser()
Validation: Multi-source (profiles.role OR user_metadata.role OR admin email)
```

---

## ❌ What's Missing - The Application System

### **GAP 1: Public Application Portal** 
**Location:** Should be `/ambassador/apply`  
**Purpose:** Students submit applications to become ambassadors

**Missing Components:**
- Application form page (`/app/ambassador/apply/page.tsx`)
- Form validation and submission logic
- Profile picture upload handler
- Application success/confirmation message
- RLS policy allowing public submissions

**Fields Needed:**
```
Personal Information:
- Full name
- Student ID
- University email
- Phone number
- WhatsApp number
- University (dropdown: Mzuzu University, etc.)
- Faculty (text input)
- Program of study
- Year of study (dropdown: 1-6)

Ambassador Information:
- Why do you want to become ambassador? (text area)
- Previous leadership experience (text area)
- Marketing experience (text area)
- Social media influence (text area)
- Communities/groups you belong to (text area)

Upload:
- Profile picture (JPG/PNG, max 5MB)
```

### **GAP 2: Admin Application Dashboard**
**Location:** Should be `/app/admin/applications` tab  
**Purpose:** Admin reviews pending applications

**Missing Components:**
- Applications tab in admin page
- Application list with filters (Pending, Approved, Rejected)
- Application detail view with profile picture
- Approve/Reject action buttons
- Bulk actions support

**Display:**
```
- Applicant photo (thumbnail)
- Full name
- Student ID
- Program
- Phone
- Application date
- Status badge
- Quick actions: Approve | Reject | View Details
```

### **GAP 3: Ambassador Application Database Table**
**Missing:** `ambassador_applications` table

**Required Schema:**
```sql
CREATE TABLE ambassador_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    student_id TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp_number TEXT,
    university TEXT NOT NULL DEFAULT 'Mzuzu University',
    faculty TEXT,
    program TEXT NOT NULL,
    year_of_study INTEGER CHECK (year_of_study >= 1 AND year_of_study <= 6),
    profile_image_url TEXT,
    motivation TEXT NOT NULL,
    leadership_experience TEXT,
    marketing_experience TEXT,
    social_media_influence TEXT,
    communities TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_id UUID REFERENCES public.profiles(id),
    rejection_reason TEXT
);
```

### **GAP 4: Automatic Account Creation Workflow**
**Missing:** Approval workflow that creates ambassador accounts

**Current State:**
- Admin manually enters ambassador details in create form
- System creates auth user, profile, ambassador record

**Needed Workflow:**
1. Student submits application (in `/ambassador/apply`)
2. Application stored in `ambassador_applications` table
3. Admin reviews application in `/app/admin/applications`
4. Admin clicks "Approve" button
5. System AUTOMATICALLY:
   - Creates Supabase auth user
   - Generates ambassador ID (e.g., "TH-MZU-00025")
   - Creates profiles record
   - Creates ambassadors record
   - Sends welcome email with credentials
   - Updates application status to "approved"

**Missing Components:**
- Approval confirmation dialog
- Account generation logic (needs to move to API)
- Webhook or API endpoint for approval action
- Email template with generated credentials

### **GAP 5: Supabase Storage Configuration**
**Missing:** Storage bucket for profile pictures

**Needed:**
```
Bucket:        ambassador-profiles
Path:          /applicants/{applicationId}/{filename}
Access:        Public read (for admin view), secure upload
Constraints:   Max 5MB, JPG/PNG only
```

---

## 📊 Current Implementation Status by Requirement

### **From Original Brief**

| Requirement | Status | Notes |
|-------------|--------|-------|
| Student apply online | ❌ Missing | Need `/ambassador/apply` form |
| Admin review applications | ❌ Missing | Need `/app/admin/applications` page |
| Admin approve/reject | ❌ Missing | Need workflow & confirmation |
| Auto-create ambassador | ⚠️ Partial | Exists but not in approval flow |
| Generate ambassador ID | ✅ Exists | Format: "TH-MZU-00001" |
| Generate login credentials | ✅ Exists | Temporary password system ready |
| Ambassador login | ✅ Works | Supabase auth integrated |
| Unique referral link | ✅ Works | Generated on creation |
| Track bookings by ambassador | ✅ Works | RLS enforced |
| Calculate commission auto | ✅ Works | Rules engine ready |
| Admin manage performance | ✅ Works | Commission tracking ready |

---

## 🎨 UI/UX Component Inventory

### **Existing Components**
```
✅ Stats Cards          - Display numbers with labels
✅ Data Tables          - Sortable lists with actions
✅ Status Badges        - Color-coded status display
✅ Form Inputs          - Text, select, number, textarea
✅ Action Buttons       - Approve, Reject, Delete, etc.
✅ Modal Dialogs        - Confirmations
✅ Loading States       - Spinners and placeholders
✅ Error Messages       - Alert boxes
✅ Profile Cards        - User info display
```

### **Needed New Components**
```
❌ File Upload Input    - For profile picture
❌ Image Preview        - Show uploaded photo
❌ Multi-step Form      - Application form
❌ Application Card     - Applicant summary
❌ Application Filters  - Status filter UI
```

---

## 🔐 Security Considerations

### **What's Already Protected**
```
✅ RLS Policies        - Row-level security by role
✅ Admin Requirements  - requireAdminUser() checks on all admin endpoints
✅ Role Validation     - Multi-source role checking
✅ Token Refresh       - authFetch() auto-refreshes tokens
✅ Auth Requirement    - All API endpoints check authentication
```

### **Needs Addition**
```
❌ Rate Limiting       - On application submission
❌ File Upload Validation - Size, type, content scanning
❌ CSRF Protection     - Form submission protection
❌ Duplicate Prevention - Same student applying multiple times
```

---

## 📋 Implementation Roadmap

### **Phase 1: Database & Storage Setup** ⏭️ NEXT
1. Add `ambassador_applications` table to migration SQL
2. Configure Supabase Storage bucket
3. Add RLS policies for applications

### **Phase 2: Application Portal** 
1. Create `/app/ambassador/apply/page.tsx`
2. Build multi-step form with validation
3. Implement file upload to Supabase Storage
4. Add duplicate application checking
5. Success confirmation message

### **Phase 3: Admin Application Dashboard**
1. Add "Applications" tab to admin page
2. Create applications list with status filter
3. Implement approve/reject buttons
4. Create approval workflow API endpoint
5. Add confirmation dialog before approval

### **Phase 4: Automated Account Creation**
1. Create approval endpoint that:
   - Creates Supabase auth user
   - Creates profiles record
   - Creates ambassadors record
   - Sends welcome email
2. Handle errors gracefully
3. Add logging for audit trail

### **Phase 5: Testing & Refinement**
1. End-to-end testing: Apply → Approve → Login → See Dashboard
2. Test file uploads (various sizes, formats)
3. Test email delivery
4. Test mobile responsiveness
5. Test error scenarios

---

## 📂 Files That Need Creation

```
/app/ambassador/apply/page.tsx           ← Application form
/app/admin/applications.tsx              ← Admin applications tab
/app/api/applications/route.ts           ← Application endpoints
/app/api/applications/approve/route.ts   ← Approval workflow
/db/ambassador_applications_migration.sql ← Database migration
```

---

## ✅ Quick Verification Checklist

**Current System Health:**
- [x] Database schema exists and complete
- [x] Authentication working (Supabase)
- [x] Ambassador dashboard functional
- [x] Commission tracking working
- [x] Admin referral management working
- [x] Email integration (Resend) ready
- [ ] Application portal ready
- [ ] Admin applications dashboard ready
- [ ] Application storage (Supabase Storage) configured
- [ ] Auto-account-creation workflow ready

---

## 🚀 Next Steps

1. ✅ **COMPLETED:** Analyzed existing system
2. ⏭️ **NEXT:** Create application database migration
3. ➡️ Create Supabase Storage bucket configuration
4. ➡️ Build public application form (`/ambassador/apply`)
5. ➡️ Build admin applications dashboard
6. ➡️ Implement approval workflow with auto-account-creation
7. ➡️ End-to-end testing
8. ➡️ Deploy and monitor

---

**Architecture Notes:**
- System follows Next.js App Router patterns
- All database changes use SQL migrations in `referral_system_migration.sql`
- Authentication uses Supabase (no custom auth)
- Email via Resend API (production-ready)
- Storage via Supabase (scalable, secure)
- Frontend uses React hooks + Tailwind CSS (no UI framework dependency)

**Production Readiness:**
- RLS policies configured for each table
- Proper error handling throughout
- Logging/debugging support in place
- Scalable database design
- API rate-limiting not yet implemented (should add for public forms)

