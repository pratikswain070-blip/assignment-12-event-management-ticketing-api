/**
 * Comprehensive API Test Suite
 * Tests Authentication, RBAC, Event CRUD, ACID Concurrency (runTransaction), Rate Limiting, and Ticket Cancellation.
 */

const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

process.env.NODE_ENV = 'test';
process.env.PORT = '5055'; // Use isolated port for test

const app = require('../server');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  const PORT = 5055;
  const server = app.listen(PORT);
  console.log(`\n======================================================`);
  console.log(`🧪 Starting Test Suite for Pratik Swain (150096725184)`);
  console.log(`🚀 Test Server listening on port ${PORT}`);
  console.log(`======================================================\n`);

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, testName, detail = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      testsFailed++;
    }
  }

  const timestamp = Date.now();
  let organizerToken = '';
  let organizerId = '';
  let attendeeToken = '';
  let attendeeId = '';
  let testEventId = '';
  let bookedTicketId = '';

  try {
    // 1. Root & Health Check
    console.log('--- 1. Health & Documentation Check ---');
    const rootRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/',
      method: 'GET'
    });
    assert(rootRes.statusCode === 200, 'Root endpoint returns 200');
    assert(rootRes.data.author.includes('Pratik Swain'), 'Root specifies author Pratik Swain');

    const docsRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api-docs/',
      method: 'GET'
    });
    assert(docsRes.statusCode === 200, 'Swagger UI responds at /api-docs/');

    // 2. Authentication: Organizer Registration & Login
    console.log('\n--- 2. Authentication: Organizer & Attendee ---');
    const orgEmail = `organizer_${timestamp}@test.com`;
    const regOrgRes = await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Organizer Pratik',
        email: orgEmail,
        password: 'Password123!',
        role: 'Organizer'
      }
    );
    assert(regOrgRes.statusCode === 201, 'Organizer registered successfully');
    organizerToken = regOrgRes.data.token;
    organizerId = regOrgRes.data.user.id;
    assert(regOrgRes.data.user.role === 'Organizer', 'Registered user has role Organizer');

    const attendeeEmail = `attendee_${timestamp}@test.com`;
    const regAttRes = await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Attendee Kunal',
        email: attendeeEmail,
        password: 'Password123!',
        role: 'Attendee'
      }
    );
    assert(regAttRes.statusCode === 201, 'Attendee registered successfully');
    attendeeToken = regAttRes.data.token;
    attendeeId = regAttRes.data.user.id;
    assert(regAttRes.data.user.role === 'Attendee', 'Registered user has role Attendee');

    // Profile verification
    const profileRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/auth/profile',
      method: 'GET',
      headers: { Authorization: `Bearer ${attendeeToken}` }
    });
    assert(profileRes.statusCode === 200, 'Attendee profile retrieved');
    assert(profileRes.data.data.email === attendeeEmail, 'Profile email matches registered email');

    // 3. RBAC Enforcement
    console.log('\n--- 3. Role-Based Access Control (RBAC) ---');
    // Attendee attempts to create event -> Forbidden (403)
    const attendeeCreateEventRes = await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${attendeeToken}`
        }
      },
      {
        title: 'Unauthorized Event',
        description: 'Should fail',
        category: 'Technology',
        eventDate: '2026-10-01T10:00:00Z',
        venue: 'Mumbai',
        ticketPrice: 500,
        totalCapacity: 50
      }
    );
    assert(attendeeCreateEventRes.statusCode === 403, 'Attendee blocked from creating event (403 Forbidden)');

    // 4. Event Management
    console.log('\n--- 4. Event Creation & Filtering ---');
    const createEventRes = await makeRequest(
      {
        hostname: 'localhost',
        port: PORT,
        path: '/api/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${organizerToken}`
        }
      },
      {
        title: 'Global Cloud & AI Summit 2026',
        description: 'Annual flagship backend conference',
        category: 'Technology',
        eventDate: '2026-06-15T09:00:00Z',
        venue: 'Bandra Kurla Complex, Mumbai',
        ticketPrice: 1499,
        totalCapacity: 5 // Capacity 5 for testing concurrency!
      }
    );
    assert(createEventRes.statusCode === 201, 'Organizer creates event with capacity 5');
    testEventId = createEventRes.data.data.id;
    assert(createEventRes.data.data.availableTickets === 5, 'Event initial availableTickets is 5');

    // Browse events with filters
    const filterRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: '/api/events?category=Technology&city=Mumbai',
      method: 'GET'
    });
    assert(filterRes.statusCode === 200, 'Browse events with ?category=Technology&city=Mumbai');
    const foundEvent = filterRes.data.data.find((e) => e.id === testEventId);
    assert(!!foundEvent, 'Created event found in filtered list');

    // 5. ACID Concurrency Booking (runTransaction)
    console.log('\n--- 5. Firestore ACID Transaction & Concurrency Test ---');
    console.log('  Triggering 6 concurrent booking requests for an event with capacity = 5...');
    const bookingPromises = [];
    for (let i = 0; i < 6; i++) {
      bookingPromises.push(
        makeRequest(
          {
            hostname: 'localhost',
            port: PORT,
            path: '/api/tickets/book',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${attendeeToken}`
            }
          },
          {
            eventId: testEventId,
            quantity: 1,
            attendeeName: `Attendee ${i + 1}`,
            attendeeEmail: `user${i + 1}@example.com`
          }
        )
      );
    }

    const bookingResults = await Promise.all(bookingPromises);
    const successfulBookings = bookingResults.filter((r) => r.statusCode === 201);
    const failedBookings = bookingResults.filter((r) => r.statusCode === 400);

    assert(successfulBookings.length === 5, `Exactly 5 bookings succeeded (Got: ${successfulBookings.length})`);
    assert(failedBookings.length === 1, `Exactly 1 booking failed due to oversell prevention (Got: ${failedBookings.length})`);
    assert(
      failedBookings[0].data.message.includes('Insufficient tickets available'),
      'Failure message states "Insufficient tickets available"'
    );

    // Verify remaining tickets count is exactly 0
    const eventAfterBookings = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/events/${testEventId}`,
      method: 'GET'
    });
    assert(
      eventAfterBookings.data.data.availableTickets === 0,
      `availableTickets is exactly 0 (Got: ${eventAfterBookings.data.data.availableTickets})`
    );

    // Save one booked ticket ID for cancellation test
    bookedTicketId = successfulBookings[0].data.data.id;

    // 6. Ticket Cancellation & Inventory Restoral
    console.log('\n--- 6. Ticket Cancellation & Inventory Restoral ---');
    const cancelRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/tickets/${bookedTicketId}/cancel`,
      method: 'POST',
      headers: { Authorization: `Bearer ${attendeeToken}` }
    });
    assert(cancelRes.statusCode === 200, 'Ticket cancelled successfully');
    assert(cancelRes.data.data.status === 'cancelled', 'Ticket status updated to cancelled');

    // Verify inventory restored to 1
    const eventAfterCancel = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/events/${testEventId}`,
      method: 'GET'
    });
    assert(
      eventAfterCancel.data.data.availableTickets === 1,
      `Inventory restored: availableTickets is now 1 (Got: ${eventAfterCancel.data.data.availableTickets})`
    );

    // 7. Attendees List for Organizer
    console.log('\n--- 7. Organizer View Attendees ---');
    const attendeesRes = await makeRequest({
      hostname: 'localhost',
      port: PORT,
      path: `/api/events/${testEventId}/attendees`,
      method: 'GET',
      headers: { Authorization: `Bearer ${organizerToken}` }
    });
    assert(attendeesRes.statusCode === 200, 'Organizer fetched event attendees');
    assert(attendeesRes.data.totalAttendees === 4, `Confirmed attendees count is 4 (Got: ${attendeesRes.data.totalAttendees})`);

    // 8. Rate Limiting Verification (>10 requests within 60s)
    console.log('\n--- 8. Bot & Scalper Rate Limiting Protection (429) ---');
    console.log('  Sending 12 rapid booking requests to test express-rate-limit...');
    let rateLimitTriggered = false;
    let rateLimitStatusCode = 0;

    for (let i = 0; i < 12; i++) {
      const rlRes = await makeRequest(
        {
          hostname: 'localhost',
          port: PORT,
          path: '/api/tickets/book',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${attendeeToken}`
          }
        },
        {
          eventId: testEventId,
          quantity: 1,
          attendeeName: 'Bot Scalper',
          attendeeEmail: 'bot@scalper.com'
        }
      );

      if (rlRes.statusCode === 429) {
        rateLimitTriggered = true;
        rateLimitStatusCode = rlRes.statusCode;
        break;
      }
    }

    assert(rateLimitTriggered, 'Rate limit triggered HTTP 429 Too Many Requests after 10 requests');
    assert(rateLimitStatusCode === 429, 'Rate limit returns status 429');

  } catch (err) {
    console.error('Unexpected Test Error:', err);
    testsFailed++;
  } finally {
    server.close();
    console.log(`\n======================================================`);
    console.log(`🏁 Test Summary: ${testsPassed} Passed, ${testsFailed} Failed`);
    console.log(`======================================================\n`);
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

runTests();
