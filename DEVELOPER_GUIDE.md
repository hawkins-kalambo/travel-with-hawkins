# 🚀 Travel with Hawkins - Developer Quick Start Guide

## 📋 Project Overview

**Travel with Hawkins** is a student transport booking platform for Mzuzu University. It allows students to book verified routes or custom destinations across Malawi, with an admin dashboard for trip management.

### Tech Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Google Apps Script (deployed)
- **Database:** Google Sheets (Sheet1)
- **Hosting:** Vercel (recommended)

---

## 🏃 Getting Started

### Prerequisites
```bash
Node.js 18+
npm or yarn
Git
```

### Installation
```bash
# Clone repository
git clone <repo-url>
cd travel-with-hawkins

# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
http://localhost:3000
```

---

## 📁 Project Structure

```
travel-with-hawkins/
├── app/
│   ├── page.tsx              # HomePage (booking interface)
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles
│   ├── admin/
│   │   └── page.tsx          # AdminPage (dashboard)
│   └── login/
│       └── page.tsx          # LoginPage
├── public/
│   ├── logo.png              # Branding logo
│   └── hero.png              # Hero image
├── Code.gs                   # Google Apps Script backend
├── package.json              # Dependencies
├── next.config.ts            # Next.js config
├── tsconfig.json             # TypeScript config
├── tailwind.config.ts        # Tailwind config
├── postcss.config.mjs        # PostCSS config
└── README.md                 # Project README
```

---

## 🔌 API Integration

### Backend URL
```javascript
const API_URL = "https://script.google.com/macros/s/AKfycby17HHcmR3G_8GhP7wdb3pvkcZpnAy6R0mtH8W7qrkcRuu5JiEQy4FIRkEDQ81KFk_L/exec";
```

### Update API URL
To change the backend URL, search for `API_URL` in:
- `app/page.tsx` (line ~67)
- `app/admin/page.tsx` (line ~37)

---

## 🔑 Admin Credentials

Default login:
```
Username: admin
Password: 1234
```

⚠️ Change these in production!

---

## 📝 Key Features

### HomePage (app/page.tsx)
- ✅ Route booking selection
- ✅ Custom destination booking
- ✅ Seats selector (1-10)
- ✅ Form validation
- ✅ Error handling
- ✅ Success modal with booking details
- ✅ Trust metrics section
- ✅ How it works guide
- ✅ Call-to-action footer

### AdminPage (app/admin/page.tsx)
- ✅ Dashboard with statistics
- ✅ Real-time booking management
- ✅ Trip card interface
- ✅ 6 status management buttons
- ✅ Advanced search/filter
- ✅ Trip detail modal
- ✅ Passenger list view
- ✅ Logout functionality

### LoginPage (app/login/page.tsx)
- ✅ Simple admin authentication
- ✅ LocalStorage-based session
- ✅ Desktop and mobile UI

---

## 🔄 Data Flow

### Booking Creation
```
User → HomePage Form → Validation → POST to Code.gs
         ↓
    Code.gs generates bookingId & tripId
         ↓
    Saves to Google Sheet
         ↓
    Returns IDs to Frontend
         ↓
    Show Success Modal
```

### Status Update
```
Admin → AdminPage → Select Trip → Choose Status Action → POST to Code.gs
         ↓
    Code.gs finds all bookings with tripId
         ↓
    Updates status for all matching bookings
         ↓
    Saves to Google Sheet
         ↓
    Returns updatedCount to Frontend
         ↓
    Frontend refreshes list
```

---

## 🛠️ Development Tasks

### Add New Route
1. Edit `app/page.tsx` → Find "Available Routes" section
2. Add new route to array:
```typescript
["Mzuzu → New City", "X–Y Hours"],
```

### Change Admin Password
1. Edit `app/login/page.tsx` → Find `handleLogin` function
2. Change condition:
```typescript
if (username === "admin" && password === "NEW_PASSWORD") {
```

### Modify Status Colors
1. Edit `app/admin/page.tsx` → Find `statusColors` object
2. Update color classes for any status

### Change API Endpoint
1. Find `API_URL` constant in both files
2. Replace with new Google Apps Script deployment URL

---

## 🐛 Debugging

### Console Errors
```typescript
// Check browser console for errors (F12)
// Network tab to verify API calls
// Look for CORS issues if API not responding
```

### Google Sheets Issues
```
// Verify Sheet1 exists and has data
// Check column mappings in Code.gs
// Ensure Google Apps Script is deployed
```

### Auth Issues
```typescript
// Check localStorage has 'auth' key
// Verify login page was used
// Clear localStorage if stuck: localStorage.clear()
```

---

## 📦 Building for Production

```bash
# Build
npm run build

# Start production server
npm start

# Or deploy to Vercel
vercel deploy
```

---

## ✅ Testing

### Manual Testing Checklist
- [ ] Book a route with 1 seat
- [ ] Book a route with 5 seats
- [ ] Book custom destination
- [ ] Verify booking shows in admin
- [ ] Admin: Confirm trip
- [ ] Admin: Update to Boarding
- [ ] Admin: Update to Departed
- [ ] Admin: Cancel trip
- [ ] Search by student name
- [ ] Search by booking ID
- [ ] Mobile: Test responsive design

### Automated Testing (Setup)
```bash
# Create tests directory if needed
mkdir -p __tests__

# Run tests
npm test
```

---

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables if needed
vercel env add API_URL
```

### Traditional Server
```bash
# Build
npm run build

# Run on server
npm start
```

---

## 📱 Mobile Testing

```bash
# Test on mobile devices
npm run dev

# Access from mobile on same network
http://<your-ip>:3000
```

---

## 🔐 Security Notes

1. **Change Admin Password** before production
2. **Secure Google Apps Script** with proper authentication
3. **Enable HTTPS** on all deployments
4. **Never commit** sensitive credentials
5. **Use environment variables** for API URLs
6. **Validate all inputs** on backend

---

## 🐛 Common Issues

### Issue: API not responding
**Solution:** Check if Google Apps Script is deployed and URL is correct

### Issue: Bookings not showing in admin
**Solution:** Verify Google Sheet has data, refresh admin page

### Issue: Authentication keeps redirecting
**Solution:** Clear browser storage: `localStorage.clear()`

### Issue: Images not loading
**Solution:** Verify public/logo.png and public/hero.png exist

### Issue: Tailwind styles not applying
**Solution:** Run `npm run dev` and restart the dev server

---

## 📚 Additional Resources

### Files to Read
- `SYSTEM_UPDATES.md` - Complete change log
- `API_REFERENCE.md` - API documentation
- `DEPLOYMENT_REPORT.md` - Deployment info

### Official Docs
- [Next.js Docs](https://nextjs.org/docs)
- [React Docs](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com)
- [Google Apps Script](https://developers.google.com/apps-script)

---

## 🤝 Contributing

### Code Style
- Use TypeScript for type safety
- Follow ESLint rules
- Use Tailwind classes over custom CSS
- Keep components focused and reusable

### Git Workflow
```bash
git checkout -b feature/your-feature
# Make changes
git commit -m "Add your feature"
git push origin feature/your-feature
# Create pull request
```

---

## 📞 Support

For issues or questions:
- Email: hgkalambo@gmail.com
- Phone: +265989127308
- WhatsApp: https://wa.me/265989127308

---

## 📄 License

This project is proprietary. All rights reserved.

---

## 🎉 Ready to Code!

You now have a complete understanding of the project structure and can start developing. Happy coding! 🚀

---

## Quick Command Reference

```bash
# Development
npm run dev              # Start dev server
npm run build            # Build for production
npm start                # Start production server
npm run lint             # Run ESLint

# Useful scripts to add (optional)
npm run format           # Format code with Prettier
npm run type-check       # Check TypeScript types
npm test                 # Run tests
```

---

## Environment Variables (Optional)

Create `.env.local`:
```
NEXT_PUBLIC_API_URL=https://script.google.com/macros/s/.../exec
NEXT_PUBLIC_APP_NAME=Travel with Hawkins
```

Use in code:
```typescript
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

---

Happy developing! 🚀
