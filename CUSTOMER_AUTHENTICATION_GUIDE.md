# Travel with Hawkins - Customer Authentication & Profile Management System

## Overview

This document describes the complete **Customer Authentication and Profile Management System** for the Travel with Hawkins platform. The system extends the existing platform with enterprise-grade customer account management, supporting both guest and registered bookings with automatic linking of previous bookings.

---

## System Architecture

### Core Components

1. **Authentication Module** (`lib/customerAuth.ts`)
   - Email/password registration and login
   - Google OAuth integration
   - Password reset and change workflows
   - Email verification
   - Guest booking linking

2. **Database Schema** (`db/migrations/customer_authentication_system.sql`)
   - `customer_profiles` - Core customer information
   - `customer_preferences` - Travel and notification preferences
   - `customer_settings` - Account and privacy settings
   - `guest_booking_links` - Track linked guest bookings
   - `customer_activity_log` - Optional activity logging

3. **API Routes** (`app/api/customers/`)
   - Registration, login, profile management
   - Password management
   - Guest booking linking
   - Preferences and settings

4. **User Interface Pages** (`app/customer/`)
   - Registration (`/customer/register`)
   - Login (`/customer/login`)
   - Dashboard (`/customer/dashboard`)
   - Profile (`/customer/profile`)
   - Settings (`/customer/settings`)

5. **Middleware** (`middleware.ts`)
   - Route protection for customer pages
   - API authorization
   - Role-based access control

---

## Authentication Flows

### 1. Email/Password Registration

```
User → /customer/register → POST /api/customers/register
  ↓
  Create auth user (Supabase Auth)
  ↓
  Create customer profile with customer number
  ↓
  Create default preferences and settings
  ↓
  Auto-link any guest bookings with matching email
  ↓
  Send verification email
  ↓
  Redirect to /customer/login
```

**Implementation Files:**
- Frontend: `app/customer/register/page.tsx`
- Backend: `app/api/customers/register/route.ts`
- Logic: `lib/customerAuth.ts::registerCustomer()`

### 2. Email/Password Login

```
User → /customer/login → POST /api/customers/login
  ↓
  Validate credentials with Supabase Auth
  ↓
  Update last_login timestamp
  ↓
  Return session
  ↓
  Redirect to /customer/dashboard
```

**Implementation Files:**
- Frontend: `app/customer/login/page.tsx`
- Backend: `app/api/customers/login/route.ts`
- Logic: `lib/customerAuth.ts::loginCustomer()`

### 3. Google OAuth

```
User → /customer/login → [Sign in with Google button]
  ↓
  Redirect to Supabase OAuth provider
  ↓
  Google authentication
  ↓
  Redirect to /auth/callback
  ↓
  Create customer profile if new
  ↓
  Auto-link guest bookings
  ↓
  Redirect to /customer/dashboard
```

**Implementation Files:**
- Frontend: `app/customer/login/page.tsx` (OAuth button)
- Callback Handler: `app/auth/callback/page.tsx`
- Logic: `lib/customerAuth.ts::signInWithGoogle()`

### 4. Password Reset

```
User → /customer/login → [Forgot Password]
  ↓
  Enter email → POST /api/customers/forgot-password
  ↓
  Send reset email via Supabase Auth
  ↓
  User clicks link in email
  ↓
  Redirect to /reset-password
  ↓
  Enter new password → POST /api/customers/password
  ↓
  Update password
  ↓
  Redirect to /customer/login
```

**Implementation Files:**
- API: `app/api/customers/forgot-password/route.ts`
- API: `app/api/customers/password/route.ts`
- Logic: `lib/customerAuth.ts::requestPasswordReset()`, `resetPassword()`

---

## Guest Booking Auto-Linking

The system automatically links guest bookings to newly registered accounts:

### How It Works

1. **At Registration**: When a customer registers with an email, the system queries the `bookings` table for any guest bookings with matching email
2. **Linking Process**: All found bookings are recorded in `guest_booking_links` table
3. **Automatic Trigger**: SQL trigger `auto_link_guest_bookings_on_profile_create` fires automatically
4. **Manual Linking**: Customers can also manually trigger linking via `/api/customers/link-guest-bookings`

### Database Function

```sql
SELECT * FROM link_guest_bookings_to_customer(
  p_customer_id UUID,
  p_email TEXT
);
```

This function:
- Finds all guest bookings with matching email
- Creates a link record
- Returns the count of linked bookings

### Customer Experience

- After registration, dashboard shows notification: "We found 3 previous bookings linked to your account"
- Linked bookings become visible in "My Bookings"
- Boarding passes are accessible
- Full booking history is restored

---

## Customer Profiles

### Supported Customer Types

1. **Student** (default)
   - Profile fields: Student ID, University, Faculty, Programme, Year of Study
   - Future: Loyalty points, student discounts

2. **Public Traveler**
   - Minimal profile: Name, Phone, Email
   - Future: Regular traveler rewards

3. **Corporate** (future)
   - Company information
   - Multiple travelers per account
   - Invoice management
   - Volume discounts

### Profile Fields

#### Personal Information
- Full Name
- Email (auto-verified for OAuth, can be verified for email/password)
- Phone
- Profile Picture (URL, image upload support planned)
- Gender, Date of Birth (optional)

#### Academic Information (Students)
- Student ID
- University
- Faculty
- Programme
- Year of Study

#### Travel Information
- Preferred Route
- Preferred Pickup Point
- Accessibility Requirements
- Emergency Contact (Name, Phone, Relationship)

#### Account Information
- Customer Number (auto-generated: `CUST-20260726-ABC123`)
- Customer Type
- Email Verification Status
- Account Status (active, suspended, inactive)
- Registration Date
- Last Login

---

## Customer Preferences

Customers can configure:

- **Seat Location**: Window, Middle, Aisle, No preference
- **Dietary Restrictions**: Free text
- **Booking Preferences**: Time of day, group booking preferences
- **Notification Settings**:
  - Booking confirmations
  - Seat assignments
  - Trip reminders
  - Trip completion notifications
  - Announcements

---

## Customer Settings

### Notification Channels
- Email (primary)
- SMS (optional)
- Push notifications (optional)
- WhatsApp (optional)

### Privacy Settings
- Profile Visibility (public/private)
- Show Booking History
- Data sharing with partners

### Communication Preferences
- Newsletter subscription
- Promotional emails
- Marketing communications

### Security
- Two-factor authentication (framework ready)
- Device management
- Activity logging

---

## API Reference

### Authentication Endpoints

#### Register Customer
```
POST /api/customers/register

Request:
{
  "email": "john@example.com",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123",
  "fullName": "John Doe",
  "phone": "+265989123456",
  "customerType": "student",
  "studentId": "MZ12345",
  "university": "Mzuzu University",
  "faculty": "Engineering",
  "programme": "Computer Science",
  "yearOfStudy": 2
}

Response:
{
  "success": true,
  "userId": "uuid",
  "message": "Registration successful..."
}
```

#### Login Customer
```
POST /api/customers/login

Request:
{
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response:
{
  "success": true,
  "userId": "uuid",
  "message": "Login successful"
}
```

#### Get Profile
```
GET /api/customers/profile
Authorization: Bearer <token>

Response:
{
  "success": true,
  "profile": {
    "id": "uuid",
    "email": "john@example.com",
    "fullName": "John Doe",
    "customerNumber": "CUST-20260726-ABC123",
    "customerType": "student",
    "emailVerified": false,
    "createdAt": "2026-07-26T...",
    ...
  }
}
```

#### Update Profile
```
PUT /api/customers/profile
Authorization: Bearer <token>

Request:
{
  "fullName": "John Updated",
  "phone": "+265987654321",
  "preferredRoute": "Mzuzu → Lilongwe",
  ...
}

Response:
{
  "success": true,
  "profile": { ... updated profile ... }
}
```

#### Request Password Reset
```
POST /api/customers/forgot-password

Request:
{
  "email": "john@example.com"
}

Response:
{
  "success": true,
  "message": "Password reset link sent to your email"
}
```

#### Reset Password
```
POST /api/customers/password

Request:
{
  "mode": "reset",
  "newPassword": "NewPass123",
  "confirmPassword": "NewPass123"
}

Response:
{
  "success": true,
  "message": "Password reset successful"
}
```

#### Change Password (Requires Auth)
```
POST /api/customers/password
Authorization: Bearer <token>

Request:
{
  "mode": "change",
  "currentPassword": "OldPass123",
  "newPassword": "NewPass123",
  "confirmPassword": "NewPass123"
}

Response:
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### Get Customer Bookings
```
GET /api/customers/bookings?bookingId=<optional>
Authorization: Bearer <token>

Response:
{
  "success": true,
  "bookings": [ ... array of BookingRecord ... ],
  "booking": { ... specific booking if bookingId provided ... }
}
```

#### Link Guest Bookings
```
POST /api/customers/link-guest-bookings
Authorization: Bearer <token>

Response:
{
  "success": true,
  "linkedCount": 3,
  "message": "Successfully linked 3 previous booking(s)"
}
```

---

## Database Schema

### customer_profiles Table

```sql
CREATE TABLE customer_profiles (
  id UUID PRIMARY KEY REFERENCES profiles(id),
  profile_picture_url TEXT,
  full_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  gender TEXT CHECK (gender IN ('Male', 'Female', 'Other', ...)),
  date_of_birth DATE,
  
  -- Student fields
  student_id TEXT,
  university TEXT,
  faculty TEXT,
  programme TEXT,
  year_of_study INTEGER,
  
  -- Travel preferences
  preferred_route TEXT,
  preferred_pickup_point TEXT,
  accessibility_requirements TEXT,
  
  -- Emergency contact
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relationship TEXT,
  
  -- Account info
  customer_type TEXT NOT NULL DEFAULT 'student',
  customer_number TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  account_status TEXT DEFAULT 'active',
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);
```

### guest_booking_links Table

```sql
CREATE TABLE guest_booking_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_email TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customer_profiles(id),
  booking_ids TEXT[] NOT NULL DEFAULT '{}',
  linked_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Role-Based Access Control

### Role Definitions

```typescript
type AppRole = "super_admin" | "admin" | "viewer" | "ambassador" | "customer" | "unknown";
```

### Customer Permissions

```typescript
customer: [
  "viewProfile",           // View own profile
  "bookTrips",            // Create bookings
  "manageOwnBookings",    // View, manage own bookings
  "manageOwnProfile"      // Update own profile
]
```

### Route Protection

- **Protected**: `/customer/*` (except public routes)
  - Requires authentication
  - Redirects to `/customer/login` if not authenticated
  - Redirects to appropriate dashboard for admin/ambassador roles

- **Public**: 
  - `/customer/register`
  - `/customer/login`
  - `/customer/forgot-password`
  - `/auth/callback`

- **Guest Bookings**: 
  - Remain accessible via `/api/bookings?trackingId=<id>`
  - Can be linked to account after registration

---

## Row-Level Security (RLS) Policies

All customer tables have RLS enabled:

### customer_profiles
- Users can view/update their own profile
- Admins can view/manage all profiles

### customer_preferences
- Users can view/update their own preferences
- Admins can manage all preferences

### customer_settings
- Users can view/update their own settings
- Admins can manage all settings

### guest_booking_links
- Users can view their own links
- Admins can view all links

### customer_activity_log
- Users can view their own activity
- Admins can view all activity

---

## Integration with Existing Systems

### Bookings System
- Guest bookings work as before (no customer_id required)
- Registered customers' bookings automatically linked via email
- Booking API filters by `customer_id` OR `email` for authenticated customers

### Communication Center
- Customers receive notifications for:
  - Booking confirmations
  - Seat assignments
  - Trip reminders
  - Trip completions
  - Feedback requests
- Notification preferences respected

### Referral System
- Ambassador referral codes work with customer bookings
- Commission tracking integrates seamlessly

---

## Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_APP_URL=https://travel-with-hawkins.vercel.app
```

---

## Deployment Checklist

- [ ] Run SQL migration in Supabase
- [ ] Configure Google OAuth in Supabase Authentication
- [ ] Set OAuth redirect URLs: `https://yourdomain/auth/callback`
- [ ] Configure email provider in Supabase
- [ ] Test registration flow
- [ ] Test login flow
- [ ] Test Google OAuth
- [ ] Test password reset
- [ ] Test guest booking linking
- [ ] Test profile management
- [ ] Verify middleware protections
- [ ] Check RLS policies
- [ ] Load test authentication flows
- [ ] Test on mobile devices

---

## Future Enhancements

1. **Multi-University Support**
   - University selection during registration
   - Per-university settings and branding
   - University-specific student discounts

2. **Payments & Loyalty**
   - In-app payment processing
   - Loyalty points program
   - Referral rewards

3. **Travel Points**
   - Earn points per booking
   - Redeem for discounts
   - Tier-based benefits

4. **Profile Enhancements**
   - Profile picture upload to Supabase Storage
   - Document verification (student ID, etc.)
   - Social login options (Facebook, Apple)

5. **Advanced Security**
   - Two-factor authentication
   - Biometric login
   - Session management dashboard

6. **Mobile App**
   - Native iOS/Android apps
   - Offline booking support
   - Push notifications

7. **Support Integration**
   - In-app chat support
   - Ticket system
   - FAQs and knowledge base

8. **Analytics**
   - Customer journey tracking
   - Booking patterns
   - Churn analysis

---

## Troubleshooting

### Issue: "Email already in use"
- User already registered
- Verify account email
- Use password reset if forgotten

### Issue: "Invalid referral code"
- Ensure ambassador is active
- Check code is uppercase
- Verify ambassador hasn't been suspended

### Issue: Guest bookings not linking
- Ensure email matches exactly
- Check `guest_booking_links` table
- Manually trigger `/api/customers/link-guest-bookings`

### Issue: RLS policy errors
- Verify user is authenticated
- Check `profiles.role` is set to 'customer'
- Ensure `auth.uid()` matches profile id

---

## Support & Questions

For technical support or questions regarding the Customer Authentication System, please contact the development team or refer to the main README.md in the project root.

---

**Last Updated**: 2026-07-26  
**Status**: Production Ready  
**Version**: 1.0.0
