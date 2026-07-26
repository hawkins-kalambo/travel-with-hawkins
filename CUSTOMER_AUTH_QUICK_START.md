# Customer Authentication System - Quick Start Guide

## For Developers

### Quick Reference: Core Functions

#### Registration
```typescript
import { registerCustomer } from '@/lib/customerAuth';

const result = await registerCustomer({
  email: 'user@example.com',
  password: 'SecurePass123',
  confirmPassword: 'SecurePass123',
  fullName: 'John Doe',
  phone: '+265989123456',
  customerType: 'student',
  studentId: 'MZ12345',
  university: 'Mzuzu University',
  faculty: 'Engineering',
  programme: 'Computer Science',
  yearOfStudy: 2
});

// Returns: { success: true, userId: 'uuid' } or error
```

#### Login
```typescript
import { loginCustomer } from '@/lib/customerAuth';

const result = await loginCustomer({
  email: 'user@example.com',
  password: 'SecurePass123'
});

// Returns: { success: true, userId: 'uuid' } or error
```

#### Get Profile
```typescript
import { getCustomerProfile } from '@/lib/customerAuth';
import { supabaseServer } from '@/lib/supabaseServer';

const session = await supabaseServer().auth.getSession();
const profile = await getCustomerProfile(session.data.session.user.id);

// Returns: CustomerProfile object
```

#### Update Profile
```typescript
import { updateCustomerProfile } from '@/lib/customerAuth';

const updated = await updateCustomerProfile(userId, {
  fullName: 'Jane Doe',
  phone: '+265987654321',
  preferredRoute: 'Mzuzu → Lilongwe'
});

// Returns: Updated CustomerProfile
```

#### Link Guest Bookings
```typescript
import { linkGuestBookings } from '@/lib/customerAuth';

const result = await linkGuestBookings(customerId, email);

// Returns: { success: true, linkedCount: 3 }
```

### Common Use Cases

#### 1. Add Login to Component
```typescript
'use client';

import { loginCustomer } from '@/lib/customerAuth';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const result = await loginCustomer({
        email: e.currentTarget.email.value,
        password: e.currentTarget.password.value
      });
      
      if (result.success) {
        router.push('/customer/dashboard');
      } else {
        setError(result.message || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" placeholder="Email" required />
      <input name="password" type="password" placeholder="Password" required />
      {error && <div className="text-red-500">{error}</div>}
      <button disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
    </form>
  );
}
```

#### 2. Protect Route with Middleware
```typescript
// middleware.ts
import { type NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Protect customer routes
  if (pathname.startsWith('/customer/')) {
    const supabase = supabaseServer();
    const session = await supabase.auth.getSession();
    
    if (!session.data.session) {
      // Redirect to login
      return NextResponse.redirect(new URL('/customer/login', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/customer/:path*', '/api/customers/:path*']
};
```

#### 3. Create API Route
```typescript
// app/api/customers/profile/route.ts
import { supabaseServer } from '@/lib/supabaseServer';
import { getCustomerProfile, updateCustomerProfile } from '@/lib/customerAuth';
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = supabaseServer();
    const session = await supabase.auth.getSession();
    
    if (!session.data.session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const profile = await getCustomerProfile(session.data.session.user.id);
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = supabaseServer();
    const session = await supabase.auth.getSession();
    
    if (!session.data.session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await request.json();
    const profile = await updateCustomerProfile(session.data.session.user.id, body);
    
    return NextResponse.json({ success: true, profile });
  } catch (error) {
    return NextResponse.json({ success: false, message: 'Error' }, { status: 500 });
  }
}
```

#### 4. Create Page with Profile
```typescript
// app/customer/profile/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { type CustomerProfile } from '@/lib/customerAuth';

export default function ProfilePage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/customers/profile');
        const data = await res.json();
        
        if (data.success) {
          setProfile(data.profile);
        } else {
          setError(data.message || 'Failed to load profile');
        }
      } catch (err) {
        setError('An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">{error}</div>;
  if (!profile) return <div>Profile not found</div>;

  return (
    <div>
      <h1>{profile.fullName}</h1>
      <p>Email: {profile.email}</p>
      <p>Phone: {profile.phone}</p>
      <p>Customer ID: {profile.customerNumber}</p>
      {/* Edit form here */}
    </div>
  );
}
```

### Database Access Patterns

#### Get Customer's Bookings
```typescript
import { supabaseServer } from '@/lib/supabaseServer';

const supabase = supabaseServer();
const { data, error } = await supabase
  .from('bookings')
  .select('*')
  .eq('customer_id', customerId)
  .order('date', { ascending: false });
```

#### Get Guest Bookings Links
```typescript
const { data, error } = await supabase
  .from('guest_booking_links')
  .select('*')
  .eq('customer_id', customerId);
```

#### Get Customer Preferences
```typescript
const { data, error } = await supabase
  .from('customer_preferences')
  .select('*')
  .eq('customer_id', customerId)
  .single();
```

### Type Definitions

```typescript
interface CustomerRegistrationData {
  email: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  phone: string;
  customerType: 'student' | 'public_traveler' | 'corporate';
  // Student fields (optional)
  studentId?: string;
  university?: string;
  faculty?: string;
  programme?: string;
  yearOfStudy?: number;
}

interface CustomerLoginData {
  email: string;
  password: string;
}

interface CustomerProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  profilePictureUrl?: string;
  gender?: string;
  dateOfBirth?: string;
  // Student fields
  studentId?: string;
  university?: string;
  faculty?: string;
  programme?: string;
  yearOfStudy?: number;
  // Travel info
  preferredRoute?: string;
  preferredPickupPoint?: string;
  accessibilityRequirements?: string;
  // Emergency contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelationship?: string;
  // Account info
  customerNumber: string;
  customerType: string;
  emailVerified: boolean;
  accountStatus: string;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}
```

### Environment Setup

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Testing Locally

```bash
# 1. Start development server
npm run dev

# 2. Test registration
curl -X POST http://localhost:3000/api/customers/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123",
    "confirmPassword": "TestPass123",
    "fullName": "Test User",
    "phone": "+265989123456",
    "customerType": "student"
  }'

# 3. Test login
curl -X POST http://localhost:3000/api/customers/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPass123"
  }'

# 4. Test in browser
# Visit: http://localhost:3000/customer/register
# Visit: http://localhost:3000/customer/login
# Visit: http://localhost:3000/customer/dashboard (after login)
```

### Troubleshooting

#### "Unauthorized" Error
- Check if user is authenticated
- Verify session is set
- Check middleware config

#### "Email already in use"
- Email already registered
- Try password reset instead

#### "Guest bookings not linking"
- Verify email matches exactly
- Check guest_booking_links table
- Check database logs

#### "RLS policy error"
- Verify user ID matches
- Check profiles.role is set to 'customer'
- Verify auth context is set

### Best Practices

1. **Always check for errors** in API responses
2. **Use loading states** during async operations
3. **Validate input** before sending to API
4. **Handle edge cases** (no profile, no bookings, etc.)
5. **Use TypeScript** for type safety
6. **Protect sensitive** operations with auth checks
7. **Log errors** for debugging
8. **Test** all flows locally first

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Blank dashboard | Run `/api/customers/link-guest-bookings` |
| Can't login | Verify email/password are correct |
| RLS errors | Check user.id is UUID and matches profile.id |
| CORS errors | Verify Supabase URL in environment |
| Email not sent | Check email provider in Supabase |

### Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

**Last Updated**: July 26, 2026  
**Version**: 1.0.0
