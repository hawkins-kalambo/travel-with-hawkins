# Travel with Hawkins - API Reference Guide

## 🔗 API Endpoint
```
https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec
```

---

## 📤 POST Requests

### 1. Create Booking
**Purpose**: Submit a new booking from HomePage

**Request:**
```javascript
{
  action: "createBooking",  // Optional (default)
  name: "John Doe",
  studentId: "MZ12345",
  phone: "+265989123456",
  destination: "Mzuzu → Lilongwe",
  travelDate: "2026-06-15",
  seats: 2,
  pickup: "Mzuzu University",
  location: "Campus",
  bookingType: "route"  // or "custom"
}
```

**Response (Success):**
```json
{
  "success": true,
  "bookingId": "TWH-1718429834567-8934",
  "tripId": "TRIP-LIL-001",
  "message": "Booking saved successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Missing required fields"
}
```

---

### 2. Update Status
**Purpose**: Update trip status from AdminPage

**Request:**
```javascript
{
  action: "updateStatus",
  tripId: "TRIP-LIL-001",
  status: "Confirmed"  // or "Boarding", "Departed", "Arrived", "Completed", "Cancelled"
}
```

**Response (Success):**
```json
{
  "success": true,
  "updatedCount": 3,
  "tripId": "TRIP-LIL-001",
  "status": "Confirmed"
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Missing tripId"
}
```

---

## 📥 GET Requests

### Fetch All Bookings
**Purpose**: Retrieve all bookings for AdminPage dashboard

**Request:**
```
GET https://script.google.com/macros/s/.../exec
```

**Response:**
```json
{
  "success": true,
  "totalBookings": 15,
  "bookings": [
    {
      "timestamp": "2026-06-14T10:30:00",
      "name": "John Doe",
      "studentId": "MZ12345",
      "phone": "+265989123456",
      "destination": "Mzuzu → Lilongwe",
      "travelDate": "2026-06-15",
      "seats": 2,
      "pickup": "Mzuzu University",
      "location": "Campus",
      "bookingId": "TWH-1718429834567-8934",
      "status": "Confirmed",
      "tripId": "TRIP-LIL-001",
      "bookingType": "route"
    },
    // ... more bookings
  ]
}
```

---

## 🔄 Data Flow

### Booking Creation Flow
```
HomePage (User fills form)
    ↓
User clicks "Confirm Booking"
    ↓
Frontend validates form (name, studentId, phone, destination)
    ↓
POST to Google Apps Script
    ↓
Script generates unique bookingId (timestamp + random)
    ↓
Script groups bookings by (destination + travelDate) → creates tripId
    ↓
Script saves all data to Sheet1
    ↓
Return bookingId & tripId to HomePage
    ↓
Show success modal with IDs
```

### Status Update Flow
```
AdminPage (Admin selects trip + action)
    ↓
Admin clicks "Confirm" / "Boarding" / "Departed" / etc.
    ↓
POST to Google Apps Script with tripId & new status
    ↓
Script finds ALL bookings with matching tripId
    ↓
Script updates status column for ALL matching rows
    ↓
Script saves changes to Sheet1 (persists immediately)
    ↓
Return updatedCount to frontend
    ↓
Frontend refreshes booking list
    ↓
Admin sees updated status badges
```

### Dashboard Refresh Flow
```
AdminPage loads or admin clicks "Refresh"
    ↓
Frontend makes GET request
    ↓
Script reads all rows from Sheet1
    ↓
Script groups by tripId
    ↓
Script sorts by timestamp (newest first)
    ↓
Return all bookings as array
    ↓
Frontend groups bookings by tripId in React
    ↓
Display trip cards with passenger count & status
```

---

## 📊 Sheet1 Structure

| Col | Name | Type | Notes |
|-----|------|------|-------|
| 0 | Timestamp | Date | Auto-generated |
| 1 | Name | Text | Student's full name |
| 2 | Student ID | Text | e.g., MZ12345 |
| 3 | Phone | Text | e.g., +265989123456 |
| 4 | Destination | Text | e.g., Mzuzu → Lilongwe |
| 5 | Travel Date | Text | YYYY-MM-DD format |
| 6 | Seats | Number | 1-10 |
| 7 | Pickup | Text | Always "Mzuzu University" |
| 8 | Location | Text | Always "Campus" |
| 9 | Booking ID | Text | Unique per booking (TWH-xxxxx-xxxxx) |
| 10 | Status | Text | Pending/Confirmed/Boarding/Departed/Arrived/Completed/Cancelled |
| 11 | Trip ID | Text | Groups related bookings (TRIP-XXX-001) |
| 12 | Booking Type | Text | "route" or "custom" |

---

## 🎯 Status Values

### Valid Status Values:
- `Pending` - Initial status after booking
- `Confirmed` - Admin confirmed the trip
- `Boarding` - Passengers are boarding
- `Departed` - Vehicle has left
- `Arrived` - Arrived at destination
- `Completed` - Trip finished
- `Cancelled` - Trip cancelled

**Status Flow:** Pending → Confirmed → Boarding → Departed → Arrived → Completed

**OR:** Any status → Cancelled (at any point)

---

## 🛡️ Error Handling

### Frontend Errors (HomePage)
- Empty form fields → "Please fill all fields"
- Empty destination (custom) → "Please enter your destination"
- Network error → "Network error. Please check your connection."
- API error → Display error from backend

### Frontend Errors (AdminPage)
- Failed status update → Show alert dialog
- API error → Auto-retry on refresh
- Network error → Auto-retry on refresh

### Backend Errors (Code.gs)
- Missing tripId → `{ success: false, error: "Missing tripId" }`
- Invalid JSON → `{ success: false, error: "Invalid JSON" }`
- Sheet not found → `{ success: false, error: "Sheet1 not found" }`
- Parse error → `{ success: false, error: "..." }`

---

## 🔐 Trip ID Generation Logic

**Format:** `TRIP-{ROUTE_CODE}-{NUMBER}`

**Examples:**
- `TRIP-LIL-001` (First Lilongwe trip on a date)
- `TRIP-LIL-002` (Second Lilongwe trip on same date)
- `TRIP-BLA-001` (First Blantyre trip)

**Logic:**
1. Extract destination: "Mzuzu → Lilongwe"
2. Get route code: "LIL" (first 3 chars after "Mzuzu → ")
3. Count existing bookings with same destination + travel date
4. Increment counter
5. Format: `TRIP-LIL-{counter}`

**Result:** Multiple bookings on the same date for the same route are grouped together

---

## 📱 Integration Notes

### HomePage → Backend
- Always includes all 8 required fields
- Generates travelDate as today (can be modified)
- Sets pickup/location as constants
- Receives bookingId & tripId

### AdminPage → Backend
- POST only sends tripId & new status
- Receives count of updated bookings
- Auto-refreshes on success

### Backend → Sheet1
- Appends new row for each booking (create)
- Updates column 10 (status) for matching tripIds (update)
- No deletes (soft-delete via status)

---

## ✅ Testing Commands

### Test Create Booking (via curl):
```bash
curl -X POST "https://script.google.com/macros/s/.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "studentId": "MZ99999",
    "phone": "+265123456789",
    "destination": "Mzuzu → Lilongwe",
    "travelDate": "2026-06-15",
    "seats": 1,
    "pickup": "Mzuzu University",
    "location": "Campus",
    "bookingType": "route"
  }'
```

### Test Get Bookings:
```bash
curl -X GET "https://script.google.com/macros/s/.../exec"
```

### Test Update Status:
```bash
curl -X POST "https://script.google.com/macros/s/.../exec" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "updateStatus",
    "tripId": "TRIP-LIL-001",
    "status": "Confirmed"
  }'
```

---

## 🚀 Production Checklist

- [ ] Google Apps Script is deployed
- [ ] API URL is correct in both files
- [ ] Sheet1 exists and is properly named
- [ ] Column headers are set (if needed)
- [ ] Test create booking and verify Sheet1 population
- [ ] Test admin status update and verify Sheet1 update
- [ ] Test fetch bookings and verify admin dashboard loads
- [ ] Verify all error cases are handled
- [ ] Test mobile responsiveness
- [ ] Test with multiple concurrent bookings

---

## 📞 Support Contact

**Phone:** +265989127308 / 0886470843  
**Email:** hgkalambo@gmail.com  
**WhatsApp:** https://wa.me/265989127308
