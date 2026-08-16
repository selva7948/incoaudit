// auditEngine.js
// Phase 3 — IncoAudit Audit Engine
// Pure functions: no React dependencies, safe to reuse later.

const HIGH_AMOUNT_MULTIPLIER = 3;
const DUPLICATE_WINDOW_DAYS = 1;

/**
 * Normalize a transaction so older backup files can also be audited.
 */
export function normalizeTransaction(txn) {
  return {
    ...txn,
    id: txn.id || crypto.randomUUID(),
    type: txn.type || "expense",
    amount: Number(txn.amount) || 0,
    category: txn.category || "Other",
    date: txn.date || new Date().toISOString().slice(0, 10),
    mode: txn.mode || "Unknown",
    note: txn.note || "",
    auditStatus: txn.auditStatus || "pending",
    auditReasons: Array.isArray(txn.auditReasons)
      ? txn.auditReasons
      : [],
    auditNote: txn.auditNote || "",
    reviewedAt: txn.reviewedAt || null,
  };
}

/**
 * Calculate average expense amount for the same category.
 */
function getCategoryAverage(txns, category, excludeId = null) {
  const values = txns
    .filter(
      (t) =>
        t.type === "expense" &&
        t.category === category &&
        t.id !== excludeId &&
        Number(t.amount) > 0
    )
    .map((t) => Number(t.amount));

  if (!values.length) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Difference between two dates in days.
 */
function daysBetween(date1, date2) {
  const a = new Date(date1);
  const b = new Date(date2);

  const diff = Math.abs(a.getTime() - b.getTime());

  return diff / (1000 * 60 * 60 * 24);
}

/**
 * Detect transactions that appear to be duplicates.
 *
 * Same:
 * - amount
 * - category
 * - payment mode
 *
 * within the configured date window.
 */
function findDuplicates(txn, txns) {
  if (txn.type !== "expense") return [];

  return txns.filter((other) => {
    if (other.id === txn.id) return false;
    if (other.type !== "expense") return false;

    return (
      Number(other.amount) === Number(txn.amount) &&
      other.category === txn.category &&
      other.mode === txn.mode &&
      daysBetween(other.date, txn.date) <= DUPLICATE_WINDOW_DAYS
    );
  });
}

/**
 * Main transaction audit function.
 */
export function auditTransaction(txn, allTransactions = []) {
  const transaction = normalizeTransaction(txn);

  const reasons = [];
  let severity = "normal";

  // Income is currently not subjected to expense anomaly rules.
  if (transaction.type === "income") {
    return {
      ...transaction,
      auditStatus: transaction.auditStatus || "pending",
      auditReasons: [],
      auditSeverity: "normal",
    };
  }

  // ------------------------------------------------------------
  // RULE 1 — High amount
  // ------------------------------------------------------------

  const categoryAverage = getCategoryAverage(
    allTransactions,
    transaction.category,
    transaction.id
  );

  if (
    categoryAverage > 0 &&
    transaction.amount >= categoryAverage * HIGH_AMOUNT_MULTIPLIER
  ) {
    reasons.push(
      `Amount is unusually high for ${transaction.category}.`
    );

    severity = "high";
  }

  // ------------------------------------------------------------
  // RULE 2 — Possible duplicate
  // ------------------------------------------------------------

  const duplicates = findDuplicates(transaction, allTransactions);

  if (duplicates.length > 0) {
    reasons.push(
      `Possible duplicate transaction detected (${duplicates.length} similar ${
        duplicates.length === 1 ? "entry" : "entries"
      }).`
    );

    severity = "high";
  }

  // ------------------------------------------------------------
  // RULE 3 — Missing / suspicious amount
  // ------------------------------------------------------------

  if (transaction.amount <= 0) {
    reasons.push("Transaction amount is missing or invalid.");
    severity = "high";
  }

  // ------------------------------------------------------------
  // RULE 4 — Missing date
  // ------------------------------------------------------------

  if (!transaction.date) {
    reasons.push("Transaction date is missing.");
    severity = "medium";
  }

  // ------------------------------------------------------------
  // RULE 5 — Missing category
  // ------------------------------------------------------------

  if (
    transaction.type === "expense" &&
    (!transaction.category ||
      transaction.category.trim() === "")
  ) {
    reasons.push("Expense category is missing.");
    severity = "medium";
  }

  // ------------------------------------------------------------
  // Determine status
  // ------------------------------------------------------------

  let auditStatus = "pending";

  if (reasons.length > 0) {
    auditStatus = "flagged";
  }

  return {
    ...transaction,
    auditStatus,
    auditReasons: reasons,
    auditSeverity: severity,
    duplicateIds: duplicates.map((d) => d.id),
  };
}

/**
 * Audit every transaction in a dataset.
 *
 * Important:
 * We audit against the complete transaction list so duplicate
 * detection and category averages have access to the full history.
 */
export function auditTransactions(txns = []) {
  const normalized = txns.map(normalizeTransaction);

  return normalized.map((txn) =>
    auditTransaction(txn, normalized)
  );
}

/**
 * Mark a transaction as reviewed.
 */
export function markReviewed(txn, note = "") {
  return {
    ...txn,
    auditStatus: "reviewed",
    auditNote: note,
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * Mark a transaction as manually flagged.
 */
export function markFlagged(txn, note = "") {
  return {
    ...txn,
    auditStatus: "flagged",
    auditNote: note,
    reviewedAt: new Date().toISOString(),
  };
}

/**
 * Reset transaction to pending state.
 */
export function resetAudit(txn) {
  return {
    ...txn,
    auditStatus: "pending",
    auditNote: "",
    reviewedAt: null,
  };
}

/**
 * Get audit statistics for dashboard / audit queue.
 */
export function getAuditSummary(txns = []) {
  const total = txns.length;

  const pending = txns.filter(
    (t) => (t.auditStatus || "pending") === "pending"
  ).length;

  const flagged = txns.filter(
    (t) => t.auditStatus === "flagged"
  ).length;

  const reviewed = txns.filter(
    (t) => t.auditStatus === "reviewed"
  ).length;

  const highRisk = txns.filter(
    (t) => t.auditSeverity === "high"
  ).length;

  const reviewedPercentage =
    total === 0
      ? 0
      : Math.round((reviewed / total) * 100);

  return {
    total,
    pending,
    flagged,
    reviewed,
    highRisk,
    reviewedPercentage,
  };
}

/**
 * Return only transactions requiring audit attention.
 */
export function getAuditQueue(txns = []) {
  return txns.filter(
    (txn) =>
      txn.auditStatus === "pending" ||
      txn.auditStatus === "flagged"
  );
}

/**
 * Search/filter audit transactions.
 */
export function filterAuditTransactions(
  txns = [],
  {
    status = "all",
    severity = "all",
    category = "all",
    search = "",
  } = {}
) {
  const query = search.trim().toLowerCase();

  return txns.filter((txn) => {
    const statusMatch =
      status === "all" ||
      (txn.auditStatus || "pending") === status;

    const severityMatch =
      severity === "all" ||
      (txn.auditSeverity || "normal") === severity;

    const categoryMatch =
      category === "all" ||
      txn.category === category;

    const searchMatch =
      !query ||
      String(txn.category || "")
        .toLowerCase()
        .includes(query) ||
      String(txn.note || "")
        .toLowerCase()
        .includes(query) ||
      String(txn.mode || "")
        .toLowerCase()
        .includes(query) ||
      String(txn.amount || "").includes(query);

    return (
      statusMatch &&
      severityMatch &&
      categoryMatch &&
      searchMatch
    );
  });
}

/**
 * Re-run the audit engine after transactions change.
 *
 * Reviewed transactions remain reviewed unless a new audit run
 * explicitly finds a new issue.
 */
export function reAuditTransactions(txns = []) {
  const normalized = txns.map(normalizeTransaction);

  return normalized.map((txn) => {
    const result = auditTransaction(txn, normalized);

    if (
      txn.auditStatus === "reviewed" &&
      result.auditReasons.length === 0
    ) {
      return {
        ...result,
        auditStatus: "reviewed",
        auditNote: txn.auditNote || "",
        reviewedAt: txn.reviewedAt || null,
      };
    }

    return result;
  });
}
