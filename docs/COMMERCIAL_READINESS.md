# Customs IDP — Commercial Readiness Checklist

## Goal
Move Customs IDP from an internal build to a controlled paid service. The first paid customer should use the platform with human review still available for exceptions.

## P0 — Must complete before a real production organisation
- [ ] Fix and verify the current Outlook pack visibility issue.
- [ ] Finish email deduplication and idempotency testing.
- [ ] Implement real user authentication and organisation membership.
- [ ] Enforce organisation isolation across every API and storage path.
- [ ] Test Organisation A cannot access Organisation B data.
- [ ] Build a 50–100 pack regression test set.
- [ ] Add production error logging and remove silent failure paths.
- [ ] Verify document originals cannot disappear during reprocessing or refresh.

## P1 — Pilot ready
- [x] PDF document preview.
- [x] Excel document preview.
- [x] Persistent document storage.
- [x] AI document extraction.
- [x] Standard validation engine.
- [x] Customer strategy foundation.
- [x] Review and Decision Agent.
- [x] Document Extraction Agent.
- [x] Weight discrepancy workflow.
- [x] Weight apportionment.
- [x] Customs Summary.
- [x] Post to LCA workflow.
- [x] Outlook/Graph email intake.
- [x] Email attachment processing.
- [x] Duplicate detection foundation.
- [x] Organisation/customer/team/strategy database foundation.
- [ ] Customer strategy administration through the UI.
- [ ] Mailbox/customer configuration through the UI.
- [ ] Audit trail for human and agent decisions.
- [ ] Processing metrics.
- [ ] Cost-per-pack measurement.
- [ ] Retry and recovery handling.
- [ ] Formal validation regression tests.

## P2 — First paid customer
- [ ] Real organisation onboarding flow.
- [ ] Real user invitations and roles.
- [ ] Customer onboarding procedure.
- [ ] Production monitoring.
- [ ] Usage limits.
- [ ] Pricing and billing.
- [ ] Customer support process.
- [ ] Data retention/deletion process.
- [ ] Customer-facing documentation.
- [ ] Pilot acceptance criteria.

## P3 — Repeatable SaaS
- [ ] Self-service organisation administration.
- [ ] Organisation-level usage dashboard.
- [ ] Customer-level reporting.
- [ ] Exportable operational reports.
- [ ] Backup/recovery procedure.
- [ ] Automated regression testing.
- [ ] 5,000-pack load/cost test.
- [ ] 50,000-pack scalability review.

## Commercial test pack
Create a repeatable test set covering:
- Simple invoice.
- Invoice + packing list.
- Multiple line items.
- Missing HS codes.
- HS codes supplied by email.
- Missing EORI.
- Different invoice/packing-list weights.
- Missing weights.
- Multiple currencies.
- Excel attachments.
- Bad/low-quality scans.
- Duplicate emails.
- Reprocessed packs.
- Failed extraction.
- Customer-specific validation rules.

## First paid customer gate
Before charging, all of the following should be true:
- [ ] No known critical data-isolation defects.
- [ ] No known critical document-loss defects.
- [ ] No known critical duplicate-ingestion defects.
- [ ] Customs validation is deterministic where it should be.
- [ ] Human review is available for exceptions.
- [ ] Usage and AI processing cost can be measured.
- [ ] Customer onboarding is documented.
- [ ] Support/contact process is ready.
- [ ] The customer understands what is automated and what remains subject to review.

## Milestones
**Milestone A — Internal MVP:** Core workflow works reliably on controlled test data.

**Milestone B — Pilot Ready:** A real customs organisation can process documents with human review and organisation isolation.

**Milestone C — First Paid Customer:** The service can be charged for with measurable usage, security controls and repeatable onboarding.

**Milestone D — Scalable SaaS:** New organisations can be onboarded without code changes and the platform can support multiple organisations with controlled costs.

## Current rule
From this point, prioritise work that moves an item on this checklist from incomplete to complete or fixes a production defect. Feature count is secondary to reliability, security and repeatability.

**Immediate objective:** Make one real organisation able to send customs documents into Customs IDP, process them reliably, review the results, and trust that its data is isolated from every other organisation.