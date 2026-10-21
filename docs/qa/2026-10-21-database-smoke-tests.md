# Database smoke-test report — 21 October 2026

Project: WEBKAS FAM SOS V2  
Supabase project ref: `lzciyzibqbujshoizlbu`  
Test method: transactional SQL with synthetic fixtures and explicit `ROLLBACK`.

## Results

| Test | Expected behavior | Result |
|---|---|---|
| Prepaid balance across 3 due dates | Balance 3,000 becomes 0; NextPay already advanced to the following date remains unchanged; 3 deduction transactions/logs | PASS |
| Same-date rerun | No additional logs, wallet deductions, or arrears | PASS |
| Partial balance shortfall | Balance 500 against a 1,000 daily rate creates 500 arrears; the next two uncovered days increase arrears to 2,500; unpaid_from remains the first unpaid date | PASS |
| KAS-exempt member | One `exempt` daily log per due date and no wallet deduction | PASS |
| Fractional arrears settlement | 500 arrears + 1,000 payment => arrears 0, balance +500, NextPay +1 day, unpaid_from null | PASS after migration 20261021014000 |
| Partial arrears settlement | 1,500 arrears + 1,000 payment => arrears 500, NextPay +1 day, unpaid_from +1 day | PASS |
| Gap detection | If the later date has a log while the earlier date is missing, processor throws a reconciliation error and does not mutate wallet balance | PASS |
| Cash operations interlock | Daily processor rejects execution while `cash_operations_enabled=false` | PASS |
| Stale report date guard | Payment approval rejects a stale report date and leaves the submission pending and wallet unchanged | PASS |

## Defect fixed

Before migration `20261021014000_fix_fractional_arrears_payment_nextpay`, NextPay advanced using `floor(arrears_paid/daily_rate) + floor(balance_credit/daily_rate)`. For 500 arrears and a 1,000 payment, both terms rounded to zero despite the full payment representing one daily rate. The fix advances NextPay by the full payment's day-equivalent when arrears are being paid, while `unpaid_from` continues to advance according to whole days settled against arrears.

A second hardening migration, `20261021014711_require_current_report_date_for_payment_approval`, rejects payment approval if the report date is not today's Asia/Jakarta date. This prevents approval from using a stale catch-up horizon if a scheduled run has been missed.

## Safety and limitations

- Every synthetic Auth user, profile, wallet, payment submission, daily log, and wallet transaction was created inside a SQL transaction and rolled back. No test data was retained.
- The current database remains at `cash_operations_enabled=false`; no daily cron was created.
- This report does not claim the full acceptance suite passed. Concurrency, authorization/RLS, private storage, upload cleanup, UI workflows, real registration/bootstrap, and Netlify deployment still require verification.
