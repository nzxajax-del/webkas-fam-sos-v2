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
