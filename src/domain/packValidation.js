import { buildWorkingCustomsRecord } from "./workingRecord.js";
import { validateStandardCustomsRecord } from "../validation/standardEngine.js";

export function buildValidatedPack(pack, customerStrategy = null) {
  if (!pack) return pack;
  const workingRecord = buildWorkingCustomsRecord(pack, customerStrategy);
  const standard = validateStandardCustomsRecord(workingRecord);
  const requiresReview = standard.checks.some(check => check.status === "fail" || check.status === "review");

  return {
    ...pack,
    workingRecord,
    status: requiresReview ? "Needs review" : "Ready",
    validationStatus: requiresReview ? "Failed" : "Validated",
    validationChecks: standard.checks,
    validationSummary: standard.summary
  };
}
