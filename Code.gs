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
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", "*");
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
    if (!action) {
      // If payload looks like a booking (has name and destination), treat as createBooking
      if ((data.name && data.destination) || (data.studentId && data.destination)) {
        action = "createBooking";
      } else {
        return createJsonOutput({ success: false, error: "Missing action or invalid payload", debug: debugInfo });
      }
    }

    if (action === "updateStatus") {
      return handleUpdateStatus(sheet, data);
    }

    if (action === "trackBooking") {
      return handleTrackBooking(sheet, data);
    }

    // CREATE BOOKING
    if (action === "createBooking") {
      return handleCreateBooking(sheet, data);
    }

    return createJsonOutput({ success: false, error: "Unknown action", debug: debugInfo });
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleUpdateStatus(sheet, data) {
  var tripId = data.tripId || "";
  var status = data.status || "Pending";

  if (!tripId) {
    return createJsonOutput({ success: false, error: "Missing tripId" });
  }
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

  // Iterate over the data array (0-indexed). Trip ID is at index 11 (0-indexed).
  for (var i = headerRows; i < values.length; i++) {
    var rowTripId = String(values[i][11] || "").trim();
    if (rowTripId && rowTripId === String(tripId).trim()) {
      var sheetRow = i + 1; // Convert 0-index to 1-indexed sheet row
      // Status is column 11 (1-indexed)
      sheet.getRange(sheetRow, 11).setValue(status);
      updatedCount++;
    }
  }

  return createJsonOutput({
    success: true,
    updatedCount: updatedCount,
    tripId: tripId,
    status: status,
  });
}

function handleCreateBooking(sheet, data) {
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
    data.bookingType || "standard" // 12: Booking Type
  ]);

  return createJsonOutput({
    success: true,
    bookingId: bookingId,
    tripId: tripId,
    message: "Booking saved successfully",
  });
}

function generateTripId(sheet, destination, travelDate, routeCode) {
  var lastRow = sheet.getLastRow();
  var tripNumber = 1;

  if (lastRow > 1) {
    // Get all data from sheet
    var allData = sheet.getDataRange().getValues();

    // Skip header if present
    var startRow = 1;
    if (allData.length > 0 && String(allData[0][0] || "").toLowerCase().indexOf("timestamp") !== -1) {
      startRow = 1;
    }

    // Count matching trips (same destination AND travel date)
    for (var i = startRow; i < allData.length; i++) {
      var existingDestination = String(allData[i][4] || "").trim(); // Destination column (0-indexed)
      var existingDate = String(allData[i][5] || "").trim(); // Travel Date column (0-indexed)

      if (
        existingDestination === destination.trim() &&
        existingDate === travelDate.trim()
      ) {
        tripNumber++;
      }
    }
  }

  return "TRIP-" + routeCode + "-" + String(tripNumber).padStart(3, "0");
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
    if (rowBookingId && (normRow === normRequested || normRow.indexOf(normRequested) !== -1 || normRequested.indexOf(normRow) !== -1)) {
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
// GET BOOKINGS (DASHBOARD)
// ===============================
function doGet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Sheet1");

    if (!sheet) {
      return createJsonOutput({ success: true, bookings: [] });
    }

    var data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      return createJsonOutput({ success: true, bookings: [] });
    }

    var headerRow = 0;
    // Detect header row
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
  } catch (error) {
    return createJsonOutput({ success: false, error: error.toString() });
  }
}

