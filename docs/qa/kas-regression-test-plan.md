# V2 regression-test plan for KAS ledger

Status: test cases specified; not yet executed against a running database.

These tests must pass before production transactions are enabled. They are based on the observed legacy migrations plus the user's master rules. Where the legacy implementation and the master rules may differ, the master rules are the intended product behavior and the discrepancy must be resolved explicitly.

## Daily dues (legacy behavior observed in source)

1. Daily rate 1,000; balance 3,000; arrears 0; process one date -> balance 2,000, arrears 0, one daily log.
2. Daily rate 1,000; balance 500; arrears 0; process one date -> balance 0, arrears 500, one daily log.
3. Re-run the same date -> no second daily deduction or arrears accrual.
4. Catch up 3 missing dates -> each missing date gets exactly one log entry, applied in date order.
5. A detected historical gap must stop processing and require reconciliation, not silently mutate the wallet.
6. A member not active on a date must not accrue dues before their dues start date.
7. Date boundaries use Asia/Jakarta; the scheduled daily job is intended for 00:01 WIB to charge the prior calendar day.

## Payment settlement (legacy hardening migration observed in source)

8. Arrears 5,000; approved payment 3,000 -> arrears 2,000, wallet balance unchanged.
9. Arrears 5,000; approved payment 8,000 -> arrears 0, wallet balance increases by 3,000.
10. Arrears 0; approved payment 3,000 -> wallet balance increases by 3,000.
11. Approving the same payment again must not duplicate ledger or wallet transaction rows.
12. Concurrent daily charge and payment approval must serialize on the wallet row lock.

## User master rules / additional acceptance criteria

13. NextPay advances only for obligations actually covered by payment; old balance must never be counted twice.
14. Partial arrears payment reduces days owed at 1,000 per day and advances the “Belum bayar dari” date by the same number of settled days.
15. The recap must show total arrears and put arrears >= 7,000 at the top.
16. Kas Lebih, NextPay, tunggakan, and ADM remain separate concepts; a change in report date recalculates eligible members without double charging.
17. New members require the defined ADM behavior and correct NextPay start; excluded display-only members stay hidden without deleting financial history.
18. Payment proof is private; only its owner and authorized admin can access it. Members must never read other members' private records.
19. Only a trusted server/admin path can approve/reject a payment; client-side role flags are not authorization.
20. RLS is enabled and verified for every exposed table, and storage upload policies enforce ownership, file type, and size.

## Release gate

Do not apply a production schema or enable live payment approval until the source schema/auth/RLS/storage paths are audited, migration reviewed, and cases 1–20 pass in an isolated V2 test project.


## V2 implementation-specific tests (added 21 October 2026)

21. New member registration always creates role `member`, status `pending`; supplied metadata cannot create an admin.
22. Admin approval/rejection only accepts a pending member; repeat decision must fail and create no second audit row.
23. Non-admin and anon calls to `review_member_registration` / `review_payment` fail; direct member profile status updates and payment status updates are denied.
24. KAS payment with arrears 5K and payment 3K -> arrears 2K, balance unchanged, unpaid_from advances by 3 days, and one payment_credit transaction plus audit event is recorded.
25. KAS payment with arrears 2K and payment 5K -> arrears 0, balance +3K, NextPay is advanced from the report date by exactly 3 days, and one ledger transaction is recorded.
26. KAS amount that is not a multiple of the configured daily amount is rejected without changing wallet, submission status, ledger, or audit log.
27. ADM payment must not exceed ADM due; approved ADM payment reduces only ADM due and must not change KAS balance, arrears, or NextPay.
28. Rejected payment does not mutate wallet or wallet_transactions; both approve and reject write reviewer, timestamp, and audit log atomically.
29. Two concurrent review attempts on the same submission result in exactly one successful decision and one wallet/ledger effect.
30. Private proof object cannot be read by anon or a different member; owner and active admin can generate short-lived signed URLs.
31. Amounts displayed/entered in the UI use K units (1K = 1,000 stored units); verify 1,000 displays as 1K and a user input of 5 becomes 5,000 stored units.
32. Admin registration queue can only activate/reject pending members and writes an audit log; no browser operation can grant admin role.
33. Failed upload or failed database insert must not be represented as a submitted payment; orphaned uploaded objects should be cleaned up by a safe maintenance process.
34. Netlify production build must pass and the deployed URL must serve the latest commit before the release is declared ready.

## Current execution status
- Tests 21–45 are **specified, not yet executed end-to-end**. Supabase Security Advisor returns no security lints, and the current database has zero Auth users. GitHub Actions build passed for commit `409398e9b271bf23e70e887fb79c1ffbfffd2d87`; Netlify live deployment remains unverified.
- Payment review RPCs and UI are implemented, but **do not use them for real cash until tests 21–34 pass**, especially concurrent review, NextPay, and partial-arrears date advancement.
- Daily dues processor is implemented in V2 but **no cron is scheduled** and cash operations remain locked. Do not schedule it until the daily rate/effective-date and report-date semantics are fully tested.

35. First-admin bootstrap fails for anon, missing token, incorrect token, or after an admin role exists.
36. Valid bootstrap token can promote only the currently authenticated pending member, once; it cannot be reused and is not readable from API schemas.
37. Bootstrap sets admin active, sets admin KAS exemption/ADM due to zero, and writes one audit log entry. Normal member registration still cannot set role=admin.\n38. With arrears 5K, NextPay 1 October, unpaid_from 1 October, and payment 3K, approval must produce arrears 2K, NextPay 4 October, unpaid_from 4 October, unchanged balance, and exactly one ledger entry.


## Daily dues engine tests (processor added 21 October 2026)

39. Re-running the processor for the same due date creates no duplicate daily_dues_log or wallet_transactions.
40. Catch-up across three missing dates creates exactly three daily logs per active, non-exempt member in date order.
41. If a later daily log exists but an earlier date is missing, processing aborts without silently mutating wallet state.
42. A date already covered by prepaid NextPay consumes the matching balance unit but does not advance NextPay a second time.
43. An uncovered due date consumes available balance first; any shortfall becomes arrears, sets unpaid_from only once, and leaves NextPay at the oldest unpaid obligation.
44. Daily rate change is rejected while an active member has prepaid balance, arrears, or a future NextPay; rate history preserves the effective rate for earlier dates.
45. Report date cannot move backwards; advancing it runs catch-up through the day before the new report date and writes an audit record. The date change remains blocked while cash_operations_enabled=false.
