# 連続する経営シミュレーション（提案②）

Six deterministic hypothetical rounds on one owned case. No AI, fabricated merchant facts, external events, scoring, customer validation or capability claims. Case title resolves live; all numerical setup is explicitly user-supplied and confirmed as a practice assumption.

Setup: caseId,title,currency,startDate,openingMinor,initialStock,unitPriceMinor,unitCostMinor,shipCostMinor,capacityUnits,leadRounds(0..2),customerPays(order|shipment),orderLimitPerRound,changedOrderLimit,changedCapacity,changedLeadRounds(0..2),hypotheticalConfirmed=true. Money0..1e9 minor units, quantities0..100000 (base capacity>=1), title<=300UTF16, notes<=3000. End date start+5 must be valid within existing cash date bounds. No prefilled invented business quantities.

Schedule is visible before starting: round1 initial terms; round2 onward new purchases use changedLeadRounds; round3 onward new-order cap is changedOrderLimit; round4 onward shipment capacity is changedCapacity. Changes never alter already scheduled inbound deliveries. These are exercise rules, not predictions about the case merchant.

Each turn input is purchaseUnits,acceptUnits,shipUnits,cancelUnits,reason,checkNext. Engine order: due supplies arrive; pay purchases and receive lead0; cancel oldest outstanding pre-existing orders (refund only order-prepaid units); accept new orders up to current cap (collect if order-prepaid); ship requested units FIFO within stock/current capacity (collect if shipment-paid and pay shipping cost). Orders due by end of next round; report outstanding/overdue units and closing cash arithmetically. Allow negative hypothetical cash but flag the modeled shortfall; never assume borrowing. Unit price/cost fixed for the run. Unsold initial stock is an opening assumption and is not deducted again.

Append-only committed turns preserve prior choices and reasons; create/turn/erase commands with expectedRevision+requestId and deletion tombstones. Setup is frozen once created; explicit clone creates a new hypothetical run for different assumptions. In-flight retry cannot duplicate a round; stale tabs compare rather than overwrite. Engine always recomputes from setup+turn inputs, never accepts client-calculated outcomes. SQL enforces the same structural and replay/action bounds. Own-authored run remains readable if source case disappears, with missing title marked; new runs require readable owned case.

UI: /business-lab/simulation?caseId=UUID, setup confirmation→one round at a time→transparent ledger/stock/order promises→six-round recap with own reasons/checks. No success/failure grade. Cash/pressure/practice links retain case id; explicit read-only export preview may map generated hypothetical flows to an existing cash save only after separate user confirmation, never auto-write. Initial complete delivery may use the transparent cash ledger without cross-saving; do not claim an unimplemented export.

Records/receipts owner-RLS/RPC-only, bounded pages20, source titles live, no report/material copies. Missing135 migration affects only simulation. Workspace integration can read bounded summary labels and last own checkNext.

Files: lib/domains/business-teardowns/simulation/**; app/(app)/business-lab/simulation/**;135_business_operating_simulation.sql. Root owns shared entries/workspace/schema.sql. No external calls or production mutations during development.
