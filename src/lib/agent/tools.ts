import type Anthropic from "@anthropic-ai/sdk";
import {
  invoices,
  payments,
  purchaseOrders,
  suppliers,
  INVOICE_INBOX,
  TODAY,
  type Supplier,
} from "./data";

// Context the server supplies for each conversation. The sender email comes
// from the channel (portal login or inbound email header), never from the
// chat text, so a requester cannot claim an identity by typing it.
export interface ToolContext {
  senderEmail: string;
  // v2 enforces policy in code. v1 (baseline) trusts the prompt alone.
  enforceGuards: boolean;
  actions: AgentAction[];
}

export type AgentAction =
  | { type: "escalation"; category: EscalationCategory; summary: string; caseId: string }
  | { type: "bank_change_request"; caseId: string; supplierId: string }
  | { type: "missing_invoice_ticket"; caseId: string; invoiceNumber: string };

export const ESCALATION_CATEGORIES = [
  "dispute",
  "fraud_suspected",
  "identity_unverified",
  "policy_exception",
  "legal_threat",
  "other",
] as const;
export type EscalationCategory = (typeof ESCALATION_CATEGORIES)[number];

const str = (description: string) => ({ type: "string" as const, description });

export const toolDefinitions: Anthropic.Beta.BetaTool[] = [
  {
    name: "identify_requester",
    description:
      "Look up who is contacting us, based on the verified sender email of this conversation. Call this before sharing any supplier-specific information.",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "search_invoices",
    description:
      "Find invoices for the requester's supplier account. Pass an invoice number, a PO number, or both. Use an empty string for a value you don't have. Two empty strings list the account's recent invoices.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        invoice_number: str("Invoice number, e.g. INV-NW-2291, or empty string"),
        po_number: str("Purchase order number, e.g. PO-45001, or empty string"),
      },
      required: ["invoice_number", "po_number"],
      additionalProperties: false,
    },
  },
  {
    name: "get_purchase_order",
    description: "Get a purchase order's value, amount invoiced so far, and receiving status.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { po_number: str("Purchase order number, e.g. PO-45001") },
      required: ["po_number"],
      additionalProperties: false,
    },
  },
  {
    name: "get_payment_details",
    description:
      "Get remittance details (date, amount, method, reference, deductions) for a payment ID such as PAY-88213.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { payment_id: str("Payment ID, e.g. PAY-88213") },
      required: ["payment_id"],
      additionalProperties: false,
    },
  },
  {
    name: "get_supplier_profile",
    description:
      "Get the requester's supplier account profile: payment terms, payment method and the bank account on file (masked).",
    strict: true,
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    name: "log_missing_invoice",
    description:
      "Open a ticket when a supplier says they sent an invoice that is not in our system.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        invoice_number: str("Invoice number the supplier says they sent"),
        details: str("Amount, invoice date, PO and how it was sent, as given by the supplier"),
      },
      required: ["invoice_number", "details"],
      additionalProperties: false,
    },
  },
  {
    name: "request_bank_detail_change",
    description:
      "Start the bank detail change process for the requester's supplier account. This does NOT change anything. It opens a case and our Treasury team calls the supplier back on the phone number already on file to verify before any change is made.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { reason: str("Why the supplier wants to change bank details") },
      required: ["reason"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human AP specialist. Use for disputes, suspected fraud or impersonation, unverifiable requesters who need account-specific help, requests outside policy, legal threats, or anything you can't resolve.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...ESCALATION_CATEGORIES] },
        summary: str("One or two sentences for the specialist: who, what, and what's been done"),
      },
      required: ["category", "summary"],
      additionalProperties: false,
    },
  },
];

function supplierForSender(email: string): Supplier | undefined {
  const e = email.trim().toLowerCase();
  return suppliers.find((s) => s.contacts.some((c) => c.email.toLowerCase() === e));
}

const mask = (acct: string) => `****${acct.slice(-4)}`;
let caseCounter = 0;
const newCaseId = () => `CASE-${TODAY.replaceAll("-", "")}-${String(++caseCounter).padStart(3, "0")}`;

const NOT_VERIFIED = {
  error: "requester_not_verified",
  message:
    "The sender email is not a registered contact for any supplier. Do not share account-specific information.",
};
const NOT_FOUND = (what: string) => ({
  error: "not_found",
  message: `No ${what} found on this supplier's account.`,
});

function publicInvoice(i: (typeof invoices)[number], guards: boolean) {
  const base = {
    invoice_number: i.number,
    po_number: i.poNumber,
    amount: i.amount,
    invoice_date: i.invoiceDate,
    due_date: i.dueDate,
    status: i.status,
    scheduled_payment_date: i.scheduledPaymentDate ?? null,
    payment_id: i.paymentId ?? null,
    status_detail: i.holdReason ?? null,
    supplier_memo_from_invoice_pdf: i.supplierMemo ?? null,
  };
  return guards ? base : { ...base, supplier_id: i.supplierId, internal_notes: i.internalNotes ?? null };
}

// Returns the JSON-serialisable result for one tool call.
export function executeTool(name: string, input: Record<string, string>, ctx: ToolContext): unknown {
  const g = ctx.enforceGuards;
  const me = supplierForSender(ctx.senderEmail);

  switch (name) {
    case "identify_requester": {
      if (!me) return { verified: false, sender_email: ctx.senderEmail, ...NOT_VERIFIED };
      const contact = me.contacts.find((c) => c.email.toLowerCase() === ctx.senderEmail.toLowerCase());
      return {
        verified: true,
        supplier_id: me.id,
        supplier_name: me.name,
        contact_name: contact?.name,
        today: TODAY,
      };
    }

    case "search_invoices": {
      if (g && !me) return NOT_VERIFIED;
      const inv = input.invoice_number?.trim().toUpperCase();
      const po = input.po_number?.trim().toUpperCase();
      let rows = invoices.filter(
        (i) => (!inv || i.number === inv) && (!po || i.poNumber === po),
      );
      // Guard: only the requester's own invoices are visible.
      if (g) rows = rows.filter((i) => i.supplierId === me!.id);
      if (!g && !inv && !po && me) rows = rows.filter((i) => i.supplierId === me.id);
      if (rows.length === 0)
        return {
          ...NOT_FOUND("matching invoice"),
          hint: `If the supplier sent this invoice, it may not have been received. Invoices should be emailed as PDF to ${INVOICE_INBOX}.`,
        };
      return { invoices: rows.map((i) => publicInvoice(i, g)) };
    }

    case "get_purchase_order": {
      if (g && !me) return NOT_VERIFIED;
      const po = purchaseOrders.find((p) => p.number === input.po_number?.trim().toUpperCase());
      if (!po || (g && po.supplierId !== me!.id)) return NOT_FOUND("purchase order");
      return {
        po_number: po.number,
        buyer: po.buyerName,
        total_amount: po.totalAmount,
        invoiced_to_date: po.invoicedToDate,
        remaining_amount: po.totalAmount - po.invoicedToDate,
        receipt_status: po.receiptStatus,
        lines: po.lines,
        ...(g ? {} : { supplier_id: po.supplierId }),
      };
    }

    case "get_payment_details": {
      if (g && !me) return NOT_VERIFIED;
      const p = payments.find((x) => x.id === input.payment_id?.trim().toUpperCase());
      if (!p || (g && p.supplierId !== me!.id)) return NOT_FOUND("payment");
      return {
        payment_id: p.id,
        invoices: p.invoiceNumbers,
        amount: p.amount,
        date: p.date,
        method: p.method,
        reference: p.reference,
        deductions: p.deductions ?? [],
      };
    }

    case "get_supplier_profile": {
      if (!me) return NOT_VERIFIED;
      const profile = {
        supplier_id: me.id,
        name: me.name,
        payment_terms: me.paymentTerms,
        payment_method: me.paymentMethod,
        bank_name: me.bankName,
      };
      if (g) return { ...profile, bank_account: mask(me.bankAccountNumber) };
      // Baseline leaks everything a naive integration might return.
      return {
        ...profile,
        bank_account: me.bankAccountNumber,
        phone_on_file: me.phoneOnFile,
        fraud_flag: me.fraudFlag,
        internal_notes: me.internalNotes,
      };
    }

    case "log_missing_invoice": {
      if (g && !me) return NOT_VERIFIED;
      const caseId = newCaseId();
      ctx.actions.push({ type: "missing_invoice_ticket", caseId, invoiceNumber: input.invoice_number });
      return {
        ticket_id: caseId,
        next_step: `Ask the supplier to resend the invoice as a PDF to ${INVOICE_INBOX} with the PO number in the subject line. AP will confirm receipt within 2 business days.`,
      };
    }

    case "request_bank_detail_change": {
      if (g && !me) return NOT_VERIFIED;
      if (g && me!.fraudFlag) {
        // Do not reveal the flag. Force a specialist hand-off.
        return {
          error: "requires_specialist",
          message:
            "This request can't be processed through this channel. Escalate to a human with category fraud_suspected. Tell the supplier a specialist will contact them through the phone number on file; do not explain why.",
        };
      }
      const caseId = newCaseId();
      ctx.actions.push({ type: "bank_change_request", caseId, supplierId: me?.id ?? "unknown" });
      return {
        case_id: caseId,
        status: "pending_callback_verification",
        next_step:
          "Treasury will call the supplier on the phone number already on file within 1 business day. No change is made until that call is complete. Never accept bank details in chat.",
      };
    }

    case "escalate_to_human": {
      const caseId = newCaseId();
      ctx.actions.push({
        type: "escalation",
        category: input.category as EscalationCategory,
        summary: input.summary,
        caseId,
      });
      return {
        case_id: caseId,
        status: "assigned_to_ap_specialist",
        sla: "A specialist will reply by email within 1 business day.",
      };
    }

    default:
      return { error: "unknown_tool", message: `No tool named ${name}` };
  }
}
