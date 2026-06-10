// ─────────────────────────────────────────────────────────────────────────────
// BI query / formula engine
//
// Pure, in-memory transform of tabular data. Given an array of row objects
// ({ columnName: value }) plus a query config, it produces:
//   • row-level computed columns (safe formula eval via expr-eval)
//   • filtering
//   • grouping + aggregation (SUM/AVG/COUNT/MIN/MAX/MEDIAN/COUNT_DISTINCT/FIRST/LAST)
//   • sorting + limiting
//
// No DB access here — callers pass rows in and store results out. This keeps the
// engine testable and lets every widget reuse one code path via POST /api/bi/query.
// ─────────────────────────────────────────────────────────────────────────────
const { Parser } = require('expr-eval');

// expr-eval Parser is safe (no eval); we lock it down a touch more.
const parser = new Parser({
  operators: {
    logical: true, comparison: true, concatenate: true,
    conditional: true, add: true, subtract: true,
    multiply: true, divide: true, remainder: true, power: true, factorial: false,
  },
});

const exprCache = new Map();
function compile(expr) {
  if (exprCache.has(expr)) return exprCache.get(expr);
  const fn = parser.parse(expr);
  exprCache.set(expr, fn);
  return fn;
}

// Try to read a value as a number. Strips currency symbols, thousands separators,
// percent signs and whitespace so spreadsheet text like "$1,234.50" works.
function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const cleaned = String(v).replace(/[%$€£,\s]/g, '');
  if (cleaned === '' || isNaN(Number(cleaned))) return null;
  return Number(cleaned);
}

function isBlank(v) {
  return v === null || v === undefined || v === '';
}

// Build the variable scope expr-eval sees for one row. Column names are sanitized
// into valid identifiers; we also expose them via a `col('Original Name')`-style
// map so formulas can reference columns with spaces.
function sanitizeKey(k) {
  return String(k).replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1');
}

function buildScope(row, scalars) {
  const scope = {};
  for (const [k, v] of Object.entries(row)) {
    const num = toNumber(v);
    const val = num !== null ? num : v;
    scope[sanitizeKey(k)] = val;
    // also keep the raw key if it's already a valid identifier
    if (sanitizeKey(k) !== k && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(k)) scope[k] = val;
  }
  // Inject scalars (manual inputs / named metrics) — these win over column names.
  if (scalars) for (const [k, v] of Object.entries(scalars)) scope[sanitizeKey(k)] = v;
  return scope;
}

// ── Computed columns ──────────────────────────────────────────────────────────
function applyComputed(rows, computed, scalars) {
  if (!computed || !computed.length) return rows;
  return rows.map((row) => {
    const out = { ...row };
    const scope = buildScope(out, scalars);
    for (const c of computed) {
      try {
        const result = compile(c.expr).evaluate(scope);
        out[c.name] = result;
        scope[sanitizeKey(c.name)] = typeof result === 'number' ? result : toNumber(result) ?? result;
      } catch (e) {
        out[c.name] = null;
      }
    }
    return out;
  });
}

// ── Filtering ───────────────────────────────────────────────────────────────
const FILTER_OPS = {
  eq:  (a, b) => String(a) === String(b),
  neq: (a, b) => String(a) !== String(b),
  gt:  (a, b) => toNumber(a) > toNumber(b),
  gte: (a, b) => toNumber(a) >= toNumber(b),
  lt:  (a, b) => toNumber(a) < toNumber(b),
  lte: (a, b) => toNumber(a) <= toNumber(b),
  contains:    (a, b) => String(a).toLowerCase().includes(String(b).toLowerCase()),
  ncontains:   (a, b) => !String(a).toLowerCase().includes(String(b).toLowerCase()),
  blank:       (a) => isBlank(a),
  notblank:    (a) => !isBlank(a),
  in:          (a, b) => (Array.isArray(b) ? b : String(b).split(',')).map(String).includes(String(a)),
  // date range against YYYY-MM-DD prefix
  dgte: (a, b) => String(a).slice(0, 10) >= String(b).slice(0, 10),
  dlte: (a, b) => String(a).slice(0, 10) <= String(b).slice(0, 10),
};

function applyFilters(rows, filters) {
  if (!filters || !filters.length) return rows;
  return rows.filter((row) =>
    filters.every((f) => {
      const op = FILTER_OPS[f.op];
      if (!op) return true;
      return op(row[f.field], f.value);
    })
  );
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregateValues(values, fn) {
  const nums = values.map(toNumber).filter((n) => n !== null);
  switch ((fn || 'sum').toLowerCase()) {
    case 'sum':   return nums.reduce((a, b) => a + b, 0);
    case 'avg':   return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    case 'min':   return nums.length ? Math.min(...nums) : null;
    case 'max':   return nums.length ? Math.max(...nums) : null;
    case 'count': return values.filter((v) => !isBlank(v)).length;
    case 'count_all': return values.length;
    case 'count_distinct': return new Set(values.filter((v) => !isBlank(v)).map(String)).size;
    case 'median': {
      if (!nums.length) return null;
      const s = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }
    case 'first': return values.find((v) => !isBlank(v)) ?? null;
    case 'last':  return [...values].reverse().find((v) => !isBlank(v)) ?? null;
    default:      return nums.reduce((a, b) => a + b, 0);
  }
}

// Group rows by the groupBy fields and compute each aggregation per group.
// Returns array of group rows: { <groupField>: value, <aggName>: value, ... }
function aggregate(rows, { groupBy = [], aggregations = [] }) {
  if (!aggregations.length) return rows;

  const makeAgg = (groupRows) => {
    const out = {};
    for (const a of aggregations) {
      const vals = groupRows.map((r) => r[a.field]);
      out[a.name || `${a.fn}_${a.field}`] = aggregateValues(vals, a.fn);
    }
    return out;
  };

  if (!groupBy.length) {
    return [makeAgg(rows)];
  }

  const groups = new Map();
  for (const row of rows) {
    const key = groupBy.map((g) => String(row[g] ?? '')).join('');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const result = [];
  for (const groupRows of groups.values()) {
    const out = {};
    for (const g of groupBy) out[g] = groupRows[0][g];
    Object.assign(out, makeAgg(groupRows));
    result.push(out);
  }
  return result;
}

// ── Sort / limit ───────────────────────────────────────────────────────────────
function applySort(rows, sort) {
  if (!sort || !sort.length) return rows;
  const sorted = [...rows];
  sorted.sort((ra, rb) => {
    for (const s of sort) {
      const a = ra[s.field], b = rb[s.field];
      const na = toNumber(a), nb = toNumber(b);
      let cmp;
      if (na !== null && nb !== null) cmp = na - nb;
      else cmp = String(a ?? '').localeCompare(String(b ?? ''));
      if (cmp !== 0) return s.dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
  return sorted;
}

// ── Top-level: run a full query config against rows ─────────────────────────────
function runQuery(rows, config = {}) {
  let out = Array.isArray(rows) ? rows : [];
  out = applyComputed(out, config.computed, config.scalars);
  out = applyFilters(out, config.filters);
  if ((config.aggregations && config.aggregations.length) || (config.groupBy && config.groupBy.length)) {
    out = aggregate(out, { groupBy: config.groupBy, aggregations: config.aggregations });
  }
  out = applySort(out, config.sort);
  if (config.limit && config.limit > 0) out = out.slice(0, config.limit);
  return out;
}

// Evaluate a single scalar formula (for KPI cards / named metrics) given a set of
// named scalar inputs (e.g. aggregates pulled from one or more datasources).
function evalScalar(expr, scalars = {}) {
  try {
    const scope = {};
    for (const [k, v] of Object.entries(scalars)) scope[sanitizeKey(k)] = v;
    return compile(expr).evaluate(scope);
  } catch (e) {
    return null;
  }
}

module.exports = {
  runQuery,
  evalScalar,
  aggregateValues,
  toNumber,
  sanitizeKey,
  // exposed for tests
  applyComputed, applyFilters, aggregate, applySort,
};
