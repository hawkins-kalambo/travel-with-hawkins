# PowerShell script to reproduce booking create -> confirm -> fetch flow
# Update $base, $adminToken and $email as needed, then run in PowerShell.

$base = 'http://localhost:3000' # change to your app URL
$adminToken = '<ADMIN_BEARER_TOKEN>' # replace with Supabase session token for admin

# 1) Create a booking
$body = @{
  name = 'Test User'
  phone = '0123456789'
  destination = 'Mzuzu → Lilongwe'
  travelDate = '2026-07-20'
  studentId = 'S-TEST-1'
  seats = 1
} | ConvertTo-Json

$create = Invoke-RestMethod -Uri "$base/api/bookings" -Method Post -Body $body -ContentType 'application/json'
$create | ConvertTo-Json -Depth 5

$bookingId = $create.bookingId
Write-Host "Created bookingId: $bookingId"

# 2) Confirm payment (admin)
$confirmBody = @{ bookingId = $bookingId } | ConvertTo-Json
$headers = @{ Authorization = "Bearer $adminToken" }
$confirm = Invoke-RestMethod -Uri "$base/api/payments/confirm" -Method Post -Body $confirmBody -ContentType 'application/json' -Headers $headers
$confirm | ConvertTo-Json -Depth 5

# 3) Fetch booking
$fetch = Invoke-RestMethod -Uri "$base/api/bookings?trackingId=$bookingId" -Method Get
$fetch | ConvertTo-Json -Depth 5

# 4) Output fare field
Write-Host "Fare in API response:" ($fetch.booking.fare)
