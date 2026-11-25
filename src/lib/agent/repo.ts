// Data access for the agent's tools. Two implementations share this interface:
// - MemoryRepo: the fixed mock data in data.ts (evals, tests, local dev without a database)
// - SupabaseRepo: the live database (repo-supabase.ts)
// Policy checks stay in tools.ts. A null companyId means "no company filter",
// which only the v1 baseline (guards off) ever asks for.
import { invoices, payments, purchaseOrders, suppliers, type Invoice, type Payment, type PurchaseOrder } from "./data";
import { POLICIES, visiblePolicies, type PolicySection } from "./policies";

export interface SupplierIdentity {
  id: string;
  name: string;
  contactName: string;
}

export interface SupplierProfile {
  id: string;
  name: string;
  paymentTerms: string;
  paymentMethod: string;
  bankName: string;
  bankLast4: string;
}

// Fields that must never reach a supplier. Only the baseline reads them.
export interface SupplierPrivate {
  bankAccountNumber: string;
  phoneOnFile: string;
  fraudFlag: boolean;
  internalNotes: string;
}

export interface CaseRecord {
  id: string;
  companyId: string | null;
  type: "escalation" | "bank_change_request" | "missing_invoice_ticket";
  category?: string;
  summary: string;
  createdBy: string;
}

export interface ApRepo {
  findSupplierByEmail(email: string): Promise<SupplierIdentity | null>;
  listInvoices(companyId: string | null, invoiceNumber: string, poNumber: string): Promise<Invoice[]>;
  getPurchaseOrder(companyId: string | null, poNumber: string): Promise<PurchaseOrder | null>;
  getPayment(companyId: string | null, paymentId: string): Promise<Payment | null>;
  getProfile(companyId: string): Promise<SupplierProfile | null>;
  getPrivate(companyId: string): Promise<SupplierPrivate | null>;
  recordCase(c: CaseRecord): Promise<void>;
  // all=false: general supplier-facing policies plus this supplier's agreement only.
  // all=true: every section, including internal ones and other suppliers' (v1 baseline only).
  listPolicies(supplierId: string | null, all: boolean): Promise<PolicySection[]>;
}

export class MemoryRepo implements ApRepo {
  async findSupplierByEmail(email: string) {
    const e = email.trim().toLowerCase();
    const s = suppliers.find((x) => x.contacts.some((c) => c.email.toLowerCase() === e));
    if (!s) return null;
    return { id: s.id, name: s.name, contactName: s.contacts.find((c) => c.email.toLowerCase() === e)!.name };
  }

  async listInvoices(companyId: string | null, inv: string, po: string) {
    return invoices.filter(
      (i) => (!companyId || i.supplierId === companyId) && (!inv || i.number === inv) && (!po || i.poNumber === po),
    );
  }

  async getPurchaseOrder(companyId: string | null, poNumber: string) {
    return purchaseOrders.find((p) => p.number === poNumber && (!companyId || p.supplierId === companyId)) ?? null;
  }

  async getPayment(companyId: string | null, paymentId: string) {
    return payments.find((p) => p.id === paymentId && (!companyId || p.supplierId === companyId)) ?? null;
  }

  async getProfile(companyId: string) {
    const s = suppliers.find((x) => x.id === companyId);
    if (!s) return null;
    return {
      id: s.id,
      name: s.name,
      paymentTerms: s.paymentTerms,
      paymentMethod: s.paymentMethod,
      bankName: s.bankName,
      bankLast4: s.bankAccountNumber.slice(-4),
    };
  }

  async getPrivate(companyId: string) {
    const s = suppliers.find((x) => x.id === companyId);
    if (!s) return null;
    return {
      bankAccountNumber: s.bankAccountNumber,
      phoneOnFile: s.phoneOnFile,
      fraudFlag: s.fraudFlag,
      internalNotes: s.internalNotes,
    };
  }

  async recordCase() {
    // Cases are returned to the caller as actions; nothing to persist in memory.
  }

  async listPolicies(supplierId: string | null, all: boolean) {
    return all ? POLICIES : visiblePolicies(POLICIES, supplierId);
  }
}
