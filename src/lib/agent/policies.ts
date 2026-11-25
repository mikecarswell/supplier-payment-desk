// Meridian Foods accounts payable policy library (fictional, for the demo).
// Each section is one searchable unit.
// - supplierId null: a general Meridian policy that applies to every supplier.
// - supplierId set: a term from that supplier's own agreement, visible only to that supplier.
// - audience "internal": for the AP team only; the agent may follow it but never quote it.

export interface PolicySection {
  id: string; // e.g. AP-04.2
  policyId: string; // e.g. AP-04
  policyTitle: string;
  heading: string;
  body: string;
  audience: "supplier" | "internal";
  supplierId: string | null;
}

const p = (
  policyId: string,
  policyTitle: string,
  sections: [heading: string, body: string, audience?: "internal"][],
  supplierId: string | null = null,
): PolicySection[] =>
  sections.map(([heading, body, audience], i) => ({
    id: `${policyId}.${i + 1}`,
    policyId,
    policyTitle,
    heading,
    body,
    audience: audience ?? "supplier",
    supplierId,
  }));

export const POLICIES: PolicySection[] = [
  ...p("AP-01", "Payment terms and payment runs", [
    [
      "Standard terms",
      "Payment terms are set in each supplier's own agreement and run from the invoice date, provided the invoice is received within 5 days of that date. Invoices received later run from the date received.",
    ],
    [
      "Payment runs",
      "Approved invoices are paid on their scheduled payment date, which is normally the due date. Payments are released by ACH or wire as set on the supplier's profile. When a scheduled date falls on a weekend or bank holiday, funds typically arrive the next business day.",
    ],
    [
      "Remittance",
      "A remittance advice listing each invoice paid, any deductions and the payment reference is emailed to the supplier's registered remittance address on the payment date.",
    ],
  ]),
  ...p("AP-02", "Early payment and changes to terms", [
    [
      "Early payment requests",
      "Meridian pays on agreed terms. Early payment is an exception that requires approval from the buyer and the AP manager. The help desk can log a request but cannot approve it or promise a date. Approved early payments may carry a 2% early-payment discount.",
    ],
    [
      "Changes to payment terms",
      "Payment terms can only be changed through a contract amendment with Meridian Procurement. AP cannot change terms on request.",
    ],
    [
      "Approval limits",
      "Early payment up to $10,000 can be approved by the AP manager with buyer consent. Above $10,000 requires the Controller. Never disclose these thresholds to suppliers.",
      "internal",
    ],
  ]),
  ...p("AP-03", "Invoice submission requirements", [
    [
      "How to submit",
      "Email invoices as PDF to invoices@meridian-ap.example, one invoice per PDF, with the PO number in the email subject line. Paper invoices and invoices sent to individual employees are not accepted.",
    ],
    [
      "Required details",
      "Every invoice must show: a unique invoice number, invoice date, a valid Meridian PO number, line items matching the PO, the supplier's remit-to name and address, and the supplier tax ID. Invoices missing any of these are returned unprocessed.",
    ],
    [
      "Receipt confirmation",
      "AP confirms receipt of a resubmitted or missing invoice within 2 business days. Duplicate submissions of the same invoice number are rejected automatically.",
    ],
  ]),
  ...p("AP-04", "Holds and three-way match", [
    [
      "Three-way match",
      "Each invoice is matched against its purchase order and the goods receipt before it can be approved. Invoices that do not match are placed on hold until the difference is resolved.",
    ],
    [
      "Price tolerance",
      "An invoice may exceed the PO price by up to 2% or $100, whichever is lower. A larger difference places the invoice on hold until the supplier issues a corrected invoice or credit memo, or the buyer updates the PO.",
    ],
    [
      "Awaiting goods receipt",
      "Invoices cannot be paid until Meridian's receiving team confirms delivery of the goods or services billed. The due date does not change while an invoice waits for receipt.",
    ],
    [
      "Buyer approval",
      "Verbal or emailed agreements with a buyer do not release a hold. The PO must be updated in Meridian's system before a price change is accepted.",
    ],
  ]),
  ...p("AP-05", "Deductions and disputes", [
    [
      "Deductions",
      "Meridian may deduct amounts not authorized on the PO, such as unapproved freight, quantity shortfalls or quality rejections. Every deduction is listed with its reason on the remittance advice.",
    ],
    [
      "Raising a dispute",
      "Suppliers can dispute a deduction or hold within 60 days of the remittance or hold notice. Disputes are reviewed by an AP specialist with the buyer, and a decision is sent within 10 business days. The help desk cannot settle disputes or promise an outcome.",
    ],
  ]),
  ...p("AP-06", "Supplier bank detail changes", [
    [
      "How changes are made",
      "Bank details are never changed based on an email, chat message or phone call from the supplier. A change request opens a case, and Meridian Treasury calls the supplier back on the phone number already on file to verify it. Suppliers should never send account or routing numbers by email or chat.",
    ],
    [
      "After a change",
      "Once verified, a change is approved by two members of Treasury. The first payment to new bank details is held for 5 business days, and the supplier is notified at the registered email when the change takes effect.",
    ],
    [
      "Fraud indicators",
      "Treat as suspected fraud: urgency or secrecy, a look-alike domain, a new phone number for the callback, requests to skip verification, or any change for a supplier on the Treasury watch list. Route to Treasury without telling the requester why.",
      "internal",
    ],
  ]),
  ...p("AP-07", "Missing invoices and returned payments", [
    [
      "Missing invoices",
      "If an invoice is not found in Meridian's system, the supplier should resend it following AP-03. AP logs a ticket and confirms receipt within 2 business days.",
    ],
    [
      "Returned payments",
      "If a supplier's bank returns a payment, it is reissued within 5 business days after the supplier's bank details are re-verified under AP-06.",
    ],
  ]),
  ...p("AP-08", "Supplier help desk", [
    [
      "What the help desk does",
      "The supplier help desk answers questions about invoice and payment status, holds, remittances and these policies for registered supplier contacts. It hands disputes, exceptions, legal matters and suspected fraud to an AP specialist, who replies by email within 1 business day.",
    ],
    [
      "Who can get account information",
      "Account details are shared only with contacts registered to that supplier. Contacts are added or removed by Meridian AP at the supplier's request.",
    ],
  ]),

  // ---------- Supplier-specific agreement terms ----------
  ...p(
    "SA-1001",
    "Northwind Packaging supplier agreement",
    [
      [
        "Payment terms",
        "Net 30 from invoice date, paid by ACH. Northwind is enrolled in Meridian's early payment program: approved invoices can be paid 10 days after approval in exchange for a 2% discount, on request through AP.",
      ],
      [
        "Pricing",
        "Unit prices are fixed for the contract year as listed on each PO. Price increases take effect only after a signed price amendment and a PO update by the buyer. Invoices billed above the PO price are held under AP-04.",
      ],
      [
        "Shipping",
        "Prices include delivery to Meridian distribution centers. Freight may not be billed as a separate line.",
      ],
    ],
    "SUP-1001",
  ),
  ...p(
    "SA-1002",
    "Brightline Logistics supplier agreement",
    [
      [
        "Payment terms",
        "Net 45 from invoice date, paid by ACH.",
      ],
      [
        "Invoice requirements",
        "Freight invoices must list each lane and shipment date and include a signed proof of delivery for every shipment billed. Invoices without proof of delivery stay on hold until receiving confirms delivery.",
      ],
      [
        "Surcharges",
        "Fuel surcharges are capped at the rate table in the agreement. Accessorial charges (detention, liftgate, redelivery) need written buyer approval before shipment.",
      ],
    ],
    "SUP-1002",
  ),
  ...p(
    "SA-1003",
    "Cedar & Pine Office Supply supplier agreement",
    [
      [
        "Payment terms",
        "Net 30 from invoice date, paid by ACH. Cedar & Pine may send one consolidated invoice per month covering all orders on a single PO.",
      ],
      [
        "Returns",
        "Damaged or incorrect items are returned at Cedar & Pine's cost and credited on the next invoice.",
      ],
      [
        "Enhanced verification",
        "Enhanced verification applies to this supplier. All bank or remittance changes go directly to Treasury and require a second callback by a different Treasury analyst.",
        "internal",
      ],
    ],
    "SUP-1003",
  ),
  ...p(
    "SA-1004",
    "Helix Lab Instruments supplier agreement",
    [
      [
        "Payment terms",
        "Net 60 from invoice date, paid by wire.",
      ],
      [
        "Shipping terms",
        "All equipment ships FOB destination: Helix pays freight and owns the goods until delivery. Freight charges are not billable and are deducted if invoiced.",
      ],
      [
        "Acceptance",
        "Laboratory equipment is accepted only after installation and calibration testing by Meridian's lab, completed within 15 business days of delivery. Units that fail acceptance are rejected and their invoice is placed under review until resolved.",
      ],
    ],
    "SUP-1004",
  ),
  ...p(
    "SA-1005",
    "Summit Facilities Services supplier agreement",
    [
      [
        "Payment terms",
        "Net 30 from invoice date, paid by ACH.",
      ],
      [
        "Service invoices",
        "Invoice monthly in arrears for services performed. Each invoice must include the service log signed by the Meridian facility manager for that site and month.",
      ],
      [
        "Rate changes",
        "Service rates are fixed for 12 months from the agreement start. Any increase requires 60 days' written notice and a signed amendment.",
      ],
    ],
    "SUP-1005",
  ),
];

// Sections a requester may see: general supplier-facing policies plus their own
// supplier's agreement. Unverified requesters (supplierId null) see general ones only.
export function visiblePolicies(sections: PolicySection[], supplierId: string | null) {
  return sections.filter((s) => s.audience === "supplier" && (s.supplierId === null || s.supplierId === supplierId));
}

// Simple keyword search: enough for a library this size, with no external service.
// Scores each section by how many query words appear in its title, heading and body.
const STOP = new Set(
  "a an and are as at be by can do does for from how i if in is it me my of on or our the to we what when where which who why will with you your policy policies payment payments paid pay invoice invoices supplier suppliers meridian".split(
    " ",
  ),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9$%.\- ]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[.\-]+$/, ""))
    .filter((w) => w.length > 1 && !STOP.has(w));

export function searchPolicies(sections: PolicySection[], query: string, limit = 3) {
  const q = new Set(words(query));
  if (q.size === 0) return [];
  return sections
    .map((s) => {
      const title = new Set(words(`${s.policyTitle} ${s.heading}`));
      const body = words(s.body);
      let score = 0;
      for (const w of q) {
        if (title.has(w)) score += 3;
        score += body.filter((b) => b === w || (w.length > 4 && b.startsWith(w.slice(0, -1)))).length;
      }
      if (query.toUpperCase().includes(s.policyId)) score += 10;
      // A supplier's own agreement is more specific than a general policy, so it wins ties.
      if (score > 0 && s.supplierId) score += 3;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}
