## To Be Fixed

WARNING: THIS CONTENT IS AI GENERATED. MAKE SURE THAT THESE FIXES DO NOT CRASH THE PROJECT. MAKE SURE THAT ALL CHANGES CAN BE DONE WITHOUT DAMAGING OTHER THINGS.

1. Add an HTTP → HTTPS redirect at the application layer — don't rely on your host alone, since the first HTTP request still leaks data before any redirect can land. Use a 308 Permanent Redirect so POST and other non-GET methods aren't downgraded to GET on the way through. Preserve the full path AND query string — losing the query breaks OAuth flows, shareable links, and tracking parameters. The protocol check should read the x-forwarded-proto header rather than url.protocol, since requests on Vercel/Cloudflare/most hosts arrive over HTTP internally even when the user came in via HTTPS.

2. In app/api/analytics/pageview/route.ts, before using `body.path`, implement input validation. Define a Zod schema for the expected request body, including a `path` string, and use `safeParse` to validate the incoming JSON. Return a 400 error with details if validation fails.

3. In app/api/consent/route.ts, add input validation for the request body. Define a Zod schema that expects a 'value' (string, 'granted' or 'denied') and an optional 'bannerVersion' (string). Use `safeParse` to validate the incoming JSON before processing it, returning a 400 error on failure.

4. In app/api/me/avatar/route.ts, validate the uploaded 'avatar' file. Ensure it is an instance of `File` and check its size against an acceptable limit (e.g., 2MB) before proceeding. Return a 400 error if the file is missing, not a File, or too large.

5. In app/api/contact/route.ts, implement robust input validation for the request body. Define a Zod schema for 'name', 'email', 'message', and 'source' with appropriate type and length constraints. Use `safeParse` to validate the incoming JSON and return a 400 error with validation messages if it fails.

6. In app/api/me/employee-link/route.ts, add input validation for the request body. Define a Zod schema that enforces the presence and types of 'tenant', 'mode', and conditional fields like 'firstName', 'lastName', 'email' (for 'create' mode) or 'employeeId' (for 'link' mode). Use `safeParse` and return a 400 error on validation failure.

7. In app/api/me/documents/route.ts, validate the form data before processing. Ensure 'tenant' is a non-empty string and 'file' is an instance of `File`. Also, validate 'documentType' against the allowed list or ensure 'slot' is provided. Return a 400 error if these conditions are not met.

8. In app/api/me/account/route.ts, add input validation for the PATCH request body. Define a Zod schema that requires a 'name' field of type string. Use `safeParse` to validate the incoming JSON and return a 400 error with validation details if the 'name' is missing or invalid.

9. In app/api/me/account/deletion/route.ts, add input validation for the POST request body. Define a Zod schema that requires a 'password' field of type string. Use `safeParse` to validate the incoming JSON and return a 400 error if the 'password' is missing.

10. In app/api/me/account/password/route.ts, implement input validation for the request body. Define a Zod schema that requires 'currentPassword' and 'newPassword' as strings, and optionally accepts 'revokeOtherSessions' as a boolean. Use `safeParse` to validate the incoming JSON and return a 400 error on failure.

11. Implement rate limiting for the POST and GET methods in app/api/auth/[...all]/route.ts. Use the existing checkRateLimit and tooManyRequests functions from lib/rate-limit.ts. The rate limit should be approximately 5 requests per minute, keyed by the client's IP address using getClientIp(). Return an HTTP 429 status with a Retry-After header if the limit is exceeded.

12. Implement rate limiting for the POST method in app/api/webhooks/stripe/route.ts. Use the existing checkRateLimit and tooManyRequests functions from lib/rate-limit.ts. The rate limit should be approximately 10 requests per minute, keyed by the client's IP address using getClientIp(). Return an HTTP 429 status with a Retry-After header if the limit is exceeded.

13. Implement rate limiting for the POST method in app/api/webhooks/apple/route.ts. Use the existing checkRateLimit and tooManyRequests functions from lib/rate-limit.ts. The rate limit should be approximately 10 requests per minute, keyed by the client's IP address using getClientIp(). Return an HTTP 429 status with a Retry-After header if the limit is exceeded.

14. In app/api/cron/notifications/route.ts, within the handleNotifications function, refactor the loop over tenants. Before the loop, fetch all relevant tenantReminder records for all tenants in a single batched query using tenantId: { in: tenantIds }. Then, process these reminders in memory for each tenant.

15. In app/api/cron/cleanup/route.ts, within the handleCleanup function, modify the loop that processes tenants for audit log deletion. Group tenants by their auditRetentionMonths setting. For each group, construct a single prisma.tenantAuditLog.deleteMany query using tenantId: { in: tenantIdsInGroup } and the corresponding cutoff date.

16. In app/api/cron/cleanup/route.ts, within the handleCleanup function, refactor the loop that calls assertFileDeletionAllowed. Modify assertFileDeletionAllowed or its callers to perform a single batched query that fetches all necessary permission/retention data for all filesToPurge at once. Then, filter the purgeableFiles in memory based on the fetched data.

17. In app/api/cron/cleanup/route.ts, within the handleCleanup function, refactor the loop that calls anonymizeFormerEmployeePii. Modify anonymizeFormerEmployeePii or its callers to perform batched updates or deletions for all dueForAnonymisierung employees in a single or a few optimized database operations, rather than processing each employee individually.

18. In app/api/cron/cleanup/route.ts, within the handleCleanup function, refactor the nested loop that checks for orphaned tenants. Before the outer loop, fetch all tenantMembership records for all dueForDeletion users and their associated tenants in a single batched query. Then, perform the ownership count and check in memory.

19. In app/api/cron/cleanup/route.ts, within the handleCleanup function, refactor the user deletion process. Collect all user IDs that are safe to delete into an array. Then, perform a single prisma.user.deleteMany operation using id: { in: userIdsToDelete }. Additionally, investigate if unlinkAndCleanupBeforeUserDeletion can be optimized to handle multiple user IDs in a batched manner.

20. In app/api/cron/cleanup/route.ts, consider adding a take option to the prisma.tenant.findMany call on line 109. If processing all tenants is necessary, implement a cursor-based pagination approach to fetch tenants in batches, rather than all at once.

21. In app/api/cron/cleanup/route.ts, add a take option to the prisma.user.findMany call on line 170. Implement a cursor-based pagination strategy to process users in batches, ensuring the cleanup job remains efficient even with many users marked for deletion.

22. In app/api/cron/notifications/route.ts, consider adding a take option to the prisma.tenant.findMany call on line 47. If all tenants must be processed, implement a cursor-based pagination to fetch and process tenants in manageable batches, improving the cron job's efficiency.

23. To enhance your application's presence on mobile devices, add a metadata export to app/(auth)/layout.tsx. Inside metadata, define icons: { apple: '/apple-icon.png' }, manifest: '/manifest.webmanifest', and themeColor: '#9B7A00' (use your brand color). Create app/manifest.ts exporting a MetadataRoute.Manifest with 192x192 and 512x512 PNG icons (one maskable). Place apple-icon.png, icon-192x192.png, and icon-512x512.png in your public directory.

24. Add Open Graph and Twitter Card metadata to every page (at minimum the root layout so it applies site-wide). Include og:title, og:description, og:image, og:url, og:site_name, plus twitter:card set to 'summary_large_image' with a matching title, description, and image. Create a 1200x630 PNG for the og:image and serve it from a stable URL. This is what shows when someone shares your site on Twitter, LinkedIn, Slack, or iMessage — without it, links look unprofessional and get fewer clicks.

25. Create a .env.example file at the project root listing every environment variable the app reads via process.env, each with a placeholder value, never a real secret. Check the API routes, lib files, and middleware for process.env usage to find them all. Keep this file updated going forward whenever a new environment variable is added.