import type { SupabaseClient } from "@supabase/supabase-js";
import type { Invoice, Payment, PurchaseOrder } from "./data";
import type { ApRepo, CaseRecord } from "./repo";
import type { PolicySection } from "./policies";

// Live data access. Two clients:
// - `user`: acts as the signed-in supplier, so row level security only returns their company's rows
// - `service`: the server's privileged client, for private fields and for writing cases
// With guards on, supplier data is read through `user`, so the database enforces the
// company boundary even if the code had a bug. The v1 baseline (guards off) reads through
// `service` on purpose, to show what a naive integration would leak.
export class SupabaseRepo implements ApRepo {
  constructor(
    private user: SupabaseClient,
    private service: SupabaseClient,
    private guarded: boolean,
  ) {}

  private get reader() {
    return this.guarded ? this.user : this.service;
  }

  async findSupplierByEmail(email: string) {
    const { data } = await this.reader
      .from("company_users")
      .select("name, companies(id, name)")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    const company = data?.companies as unknown as { id: string; name: string } | null;
    if (!data || !company) return null;
    return { id: company.id, name: company.name, contactName: data.name };
  }

  async listInvoices(companyId: string | null, inv: string, po: string) {
    let q = this.reader.from("invoices").select("*").order("invoice_date", { ascending: false });
    if (companyId) q = q.eq("company_id", companyId);
    if (inv) q = q.eq("number", inv);
    if (po) q = q.eq("po_number", po);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []).map(toInvoice);
    if (!this.guarded && rows.length) {
      const { data: notes } = await this.service
        .from("invoice_private")
        .select("invoice_number, internal_notes")
        .in("invoice_number", rows.map((r) => r.number));
      for (const n of notes ?? []) {
        const row = rows.find((r) => r.number === n.invoice_number);
        if (row) row.internalNotes = n.internal_notes;
      }
    }
    return rows;
  }

  async getPurchaseOrder(companyId: string | null, poNumber: string): Promise<PurchaseOrder | null> {
    let q = this.reader.from("purchase_orders").select("*").eq("number", poNumber);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.maybeSingle();
    if (!data) return null;
    return {
      number: data.number,
      supplierId: data.company_id,
      buyerName: data.buyer_name,
      totalAmount: Number(data.total_amount),
      invoicedToDate: Number(data.invoiced_to_date),
      receiptStatus: data.receipt_status,
      lines: data.lines,
    };
  }

  async getPayment(companyId: string | null, paymentId: string): Promise<Payment | null> {
    let q = this.reader.from("payments").select("*").eq("id", paymentId);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      supplierId: data.company_id,
      invoiceNumbers: data.invoice_numbers,
      amount: Number(data.amount),
      date: data.date,
      method: data.method,
      reference: data.reference,
      deductions: data.deductions?.length ? data.deductions : undefined,
    };
  }

  async getProfile(companyId: string) {
    const { data } = await this.reader.from("companies").select("*").eq("id", companyId).maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      name: data.name,
      paymentTerms: data.payment_terms,
      paymentMethod: data.payment_method,
      bankName: data.bank_name,
      bankLast4: data.bank_last4,
    };
  }

  async getPrivate(companyId: string) {
    const { data } = await this.service.from("company_private").select("*").eq("company_id", companyId).maybeSingle();
    if (!data) return null;
    return {
      bankAccountNumber: data.bank_account_number,
      phoneOnFile: data.phone_on_file,
      fraudFlag: data.fraud_flag,
      internalNotes: data.internal_notes,
    };
  }

  async recordCase(c: CaseRecord) {
    const { error } = await this.service.from("cases").insert({
      id: c.id,
      company_id: c.companyId,
      type: c.type,
      category: c.category ?? null,
      summary: c.summary,
      created_by: c.createdBy,
    });
    if (error) console.error("Failed to record case", c.id, error.message);
  }

  async listPolicies(supplierId: string | null, all: boolean) {
    if (all) {
      const { data } = await this.service.from("policies").select("*").order("id");
      return (data ?? []).map(toPolicy);
    }
    // Read as the signed-in user: the database itself hides internal sections and
    // other suppliers' agreements. The filter below is a second check in code.
    const { data } = await this.user.from("policies").select("*").order("id");
    return (data ?? [])
      .map(toPolicy)
      .filter((p) => p.audience === "supplier" && (p.supplierId === null || p.supplierId === supplierId));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw database row
function toPolicy(r: any): PolicySection {
  return {
    id: r.id,
    policyId: r.policy_id,
    policyTitle: r.policy_title,
    heading: r.heading,
    body: r.body,
    audience: r.audience,
    supplierId: r.company_id,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw database row
function toInvoice(r: any): Invoice {
  return {
    number: r.number,
    supplierId: r.company_id,
    poNumber: r.po_number,
    amount: Number(r.amount),
    invoiceDate: r.invoice_date,
    dueDate: r.due_date,
    status: r.status,
    scheduledPaymentDate: r.scheduled_payment_date ?? undefined,
    paymentId: r.payment_id ?? undefined,
    holdReason: r.hold_reason ?? undefined,
    supplierMemo: r.supplier_memo ?? undefined,
  };
}
