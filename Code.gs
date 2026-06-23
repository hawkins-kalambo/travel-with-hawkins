/**
 * Google Apps Script - Travel with Hawkins
 *
 * Sheet1 columns (0-indexed in row arrays):
 *  0: Timestamp
 *  1: Name
 *  2: Student ID
 *  3: Phone
 *  4: Destination
 *  5: Travel Date
 *  6: Seats
 *  7: Pickup
 *  8: Location
 *  9: Booking ID
 * 10: Status
 * 11: Trip ID
 * 12: Booking Type
 */

function createJsonOutput(payload) {
  // Note: Apps Script ContentService TextOutput does not support setHeader().
  // CORS headers must be handled by the client or deployment settings.
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");

    if (!sheet) {
      return createJsonOutput({ success: false, error: "Sheet1 not found" });
    }

    var data = {};
    if (e && e.postData && e.postData.contents) {
      try {
        data = JSON.parse(e.postData.contents);
      } catch (parseError) {
        return createJsonOutput({ success: false, error: "Invalid JSON" });
      }
    }

    // ==============================
    // ACTION ROUTING
    // ==============================
    var action = data.action;
    var debugInfo = {
      providedAction: action || null,
      hasName: Boolean(data.name),
      hasStudentId: Boolean(data.studentId),
      hasDestination: Boolean(data.destination),
      payload: data,
    };

    // If no explicit action provided, decide based on payload shape.
    // Also add a resilient payment confirmation fallback:
    // if bookingId + token are present, assume confirmPayment.
    if (!action) {
      var hasToken = Boolean(data.token);
      var hasBookingId = Boolean(data.bookingId);
      if (hasToken && hasBookingId) {
        action = "confirmPayment";
      } else {
        // If payload looks like a booking (has name and destination), treat as createBooking
        if ((data.name && data.destination) || (data.studentId && data.destination)) {
          action = "createBooking";
        } else {
          return createJsonOutput({ success: false, error: "Missing action or invalid payload", debug: debugInfo });
        }
      }
    }


    // Non-mutating actions (no lock needed)
    if (action === "trackBooking") return handleTrackBooking(sheet, data);
    if (action === "getAllData") return handleGetAllData(sheet);

    // Mutating actions — require lock + optional token validation
    var mutating = (action === "updateStatus" || action === "createBooking" || action === "deleteBooking");
    if (!mutating) {
      return createJsonOutput({ success: false, error: "Unknown action", debug: debugInfo });
    }

    // Apps Script LockService signature: getScriptLock()
    // waitLock(timeoutMs)
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);


    } catch (lockErr) {
      return createJsonOutput({ success: false, error: "Could not acquire lock" });
    }

    try {
      if (action === "confirmPayment") {
        // Payment confirmation: force status to Confirmed (paid)
        data.status = "Confirmed";
        // accept either bookingId or tripId
        if (!data.bookingId && data.tripId) {
          data.tripId = String(data.tripId);
        }
        return handleUpdateStatus(sheet, data);
      }
      if (action === "updateStatus") {
        return handleUpdateStatus(sheet, data);
      }
      if (action === "deleteBooking") {

        return handleDeleteBooking(sheet, data);
      }
      // CREATE BOOKING
      if (action === "createBooking") {
        return handleCreateBooking(sheet, data);
      }

      return createJsonOutput({ success: false, error: "Unknown action", debug: debugInfo });
    } finally {

      try {
        lock.releaseLock();
      } catch (releaseErr) {
        // ignore
      }
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpdateStatus(sheet, data) {
  var token = (data && data.token) ? String(data.token) : "";
  if (token !== "HAWKINS_SECURE_GATEWAY_2026") {
    return createJsonOutput({ success: false, error: "Unauthorized" });
  }

  var tripId = data.tripId || "";
  var bookingId = data.bookingId || "";

  if (!tripId && !bookingId) {
    return createJsonOutput({ success: false, error: "Missing tripId or bookingId" });
  }

  var requestedStatus = (data.status || "").toString().trim();

  var allowedStatuses = [
    "Pending",
    "Confirmed",
    "Boarding",
    "Departed",
    "Arrived",
    "Completed",
    "Cancelled",
  ];

  // If caller didn't send a valid status, reject.
  if (allowedStatuses.indexOf(requestedStatus) === -1) {
    return createJsonOutput({ success: false, error: "Invalid status" });
  }

  var nextStatus = requestedStatus;

  // If payment is confirmed we may want to keep the status logic consistent.
  // (No-op here; actual payment flow should map to Confirmed explicitly.)



  var values = sheet.getDataRange().getValues() || [];

  if (values.length === 0) {
    return createJsonOutput({ success: true, updatedCount: 0 });
  }

  // Detect if first row is a header row
  var headerRows = 0;
  if (String(values[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
    headerRows = 1;
  }

  var updatedCount = 0;

  if (bookingId) {
    // Update single booking by Booking ID
    for (var i = headerRows; i < values.length; i++) {
      var rowBookingId = String(values[i][9] || "").trim();
      if (rowBookingId && rowBookingId === String(bookingId).trim()) {
        var sheetRow = i + 1;
        sheet.getRange(sheetRow, 11).setValue(nextStatus); // Status is column 11 (1-indexed)
        updatedCount++;
        break;
      }
    }
  } else {
    // Update all bookings under a Trip ID
    for (var k = headerRows; k < values.length; k++) {
      var rowTripId = String(values[k][11] || "").trim();
      if (rowTripId && rowTripId === String(tripId).trim()) {
        var sRow = k + 1;
        sheet.getRange(sRow, 11).setValue(nextStatus);
        updatedCount++;
      }
    }
  }

  return createJsonOutput({
    success: true,
    updatedCount: updatedCount,
    tripId: tripId,
    bookingId: bookingId,
    status: nextStatus,
  });
}

function handleDeleteBooking(sheet, data) {
  var token = (data && data.token) ? String(data.token) : "";
  if (token !== "HAWKINS_SECURE_GATEWAY_2026") {
    return createJsonOutput({ success: false, error: "Unauthorized" });
  }

  var bookingId = (data.bookingId || "").toString().trim();
  if (!bookingId) {
    return createJsonOutput({ success: false, error: "Missing bookingId" });
  }

  var values = sheet.getDataRange().getValues() || [];
  var headerRows = 0;
  if (values.length > 0 && String(values[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
    headerRows = 1;
  }

  for (var i = headerRows; i < values.length; i++) {
    var rowBookingId = String(values[i][9] || "").trim();
    if (rowBookingId === bookingId) {
      var sheetRow = i + 1; // 1-indexed
      sheet.deleteRow(sheetRow);
      return createJsonOutput({
        success: true,
        message: "Booking deleted successfully",
        bookingId: bookingId,
      });
    }
  }

  return createJsonOutput({ success: false, error: "Booking not found" });
}

function handleCreateBooking(sheet, data) {
  // Normalize booking type to proper casing
  var rawBookingType = (data.bookingType || "").toString().toLowerCase().trim();
  var bookingType = "Standard";
  if (rawBookingType === "premium" || rawBookingType === "premium luxury") {
    bookingType = "Premium";
  } else if (rawBookingType === "route" || rawBookingType === "custom") {
    bookingType = "Standard"; // route/custom are UI types, not class types
  }

  // Generate unique Booking ID
  var bookingId = "TWH-" + new Date().getTime() + "-" + Math.floor(Math.random() * 10000);

  var destination = data.destination || "Unknown";
  var travelDate = data.travelDate || new Date().toISOString().split("T")[0];

  // Extract route code from destination
  var routeCode = destination
    .replace("Mzuzu → ", "")
    .substring(0, 3)
    .toUpperCase();

  // Generate Trip ID by grouping with same destination AND travel date
  var tripId = generateTripId(sheet, destination, travelDate, routeCode);

  // Save booking to sheet
  sheet.appendRow([
    new Date(),              // 0: Timestamp
    data.name || "",         // 1: Name
    data.studentId || "",    // 2: Student ID
    data.phone || "",        // 3: Phone
    destination,             // 4: Destination
    travelDate,              // 5: Travel Date
    data.seats || 1,         // 6: Seats
    data.pickup || "",       // 7: Pickup
    data.location || "",     // 8: Location
    bookingId,               // 9: Booking ID
    "Pending",               // 10: Status
    tripId,                  // 11: Trip ID
    bookingType,             // 12: Booking Type (Standard|Premium)
  ]);

  return createJsonOutput({
    success: true,
    bookingId: bookingId,
    tripId: tripId,
    bookingType: bookingType,
    message: "Booking saved successfully",
  });
}

function generateTripId(sheet, destination, travelDate, routeCode) {
  var allData = sheet.getDataRange().getValues() || [];

  // Detect header row
  var startRow = 0;
  if (allData.length > 0 && String(allData[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
    startRow = 1;
  }

  var targetDest = String(destination || "").trim();
  var targetDate = String(travelDate || "").trim();

  // 1) Try to find an existing trip group for the exact pair that still has Pending bookings.
  for (var i = startRow; i < allData.length; i++) {
    var existingDestination = String(allData[i][4] || "").trim();
    var existingDate = String(allData[i][5] || "").trim();

    if (existingDestination !== targetDest || existingDate !== targetDate) continue;

    var existingTripId = String(allData[i][11] || "").trim();
    var existingStatus = String(allData[i][10] || "Pending").trim();

    if (existingTripId && existingStatus === "Pending") {
      return existingTripId;
    }
  }

  // 2) No existing unmatched/available trip found: compute next global maximum
  var prefix = "TRIP-" + String(routeCode || "").toUpperCase() + "-";
  var maxSeq = 0;

  for (var j = startRow; j < allData.length; j++) {
    var rowTripId = String(allData[j][11] || "").trim();

    if (!rowTripId) continue;
    if (rowTripId.indexOf(prefix) !== 0) continue;

    var seqPart = rowTripId.slice(prefix.length);
    var seqNum = parseInt(seqPart, 10);
    if (!isNaN(seqNum) && seqNum > maxSeq) maxSeq = seqNum;
  }

  var nextSeq = maxSeq + 1;
  return prefix + String(nextSeq).padStart(3, "0");
}

function handleTrackBooking(sheet, data) {
  var bookingId = (data.bookingId || "").toString().trim();

  if (!bookingId) {
    return createJsonOutput({ success: false, error: "Missing bookingId" });
  }

  var values = sheet.getDataRange().getValues() || [];
  if (values.length === 0) {
    return createJsonOutput({ success: true, bookings: [] });
  }

  // Detect header
  var startRow = 0;
  if (String(values[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
    startRow = 1;
  }

  var found = [];
  for (var i = startRow; i < values.length; i++) {
    var row = values[i];
    var rowBookingId = String(row[9] || "").trim();

    // Normalize and allow partial/case-insensitive matches to be forgiving
    var normRequested = bookingId.toLowerCase().replace(/\s+/g, "");
    var normRow = String(rowBookingId).toLowerCase().replace(/\s+/g, "");

    if (
      rowBookingId &&
      (normRow === normRequested ||
        normRow.indexOf(normRequested) !== -1 ||
        normRequested.indexOf(normRow) !== -1)
    ) {
      found.push({
        timestamp: row[0],
        name: row[1],
        studentId: row[2],
        phone: row[3],
        destination: row[4],
        travelDate: row[5],
        seats: row[6],
        pickup: row[7],
        location: row[8],
        bookingId: row[9],
        status: row[10],
        tripId: row[11],
        bookingType: row[12]
      });
    }
  }

  return createJsonOutput({ success: true, bookings: found });
}

// ===============================
// GET ALL DATA (DASHBOARD) — raw export for admin
// ===============================
function handleGetAllData(sheet) {
  var data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return createJsonOutput({ success: true, bookings: [] });
  }

  var headerRow = 0;
  if (String(data[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
    headerRow = 1;
  }

  var rows = data.slice(headerRow);

  var bookings = rows.map(function (row) {
    return {
      timestamp: row[0],
      name: row[1],
      studentId: row[2],
      phone: row[3],
      destination: row[4],
      travelDate: row[5],
      seats: row[6],
      pickup: row[7],
      location: row[8],
      bookingId: row[9],
      status: row[10],
      tripId: row[11],
      bookingType: row[12]
    };
  });

  // Sort by timestamp (newest first)
  bookings.sort(function (a, b) {
    var at = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    var bt = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return bt - at;
  });

  return createJsonOutput({
    success: true,
    totalBookings: bookings.length,
    bookings: bookings,
  });
}

// ===============================
// GET BOOKINGS (DASHBOARD) — legacy endpoint
// ===============================
function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");

    if (!sheet) {
      return createJsonOutput({ success: true, bookings: [] });
    }

    return handleGetAllData(sheet);
  } catch (error) {
    return createJsonOutput({ success: false, error: error.toString() });
  }
}

