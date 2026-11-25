// Creates the schema and loads the mock AP data into Supabase.
// Usage: npm run db:setup   (reads DATABASE_URL from .env.local)
import "../evals/env";
import fs from "node:fs";
import pg from "pg";
import { invoices, payments, purchaseOrders, suppliers } from "../src/lib/agent/data";
import { POLICIES } from "../src/lib/agent/policies";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Add it to .env.local (Supabase > Project Settings > Database > Connection string > URI).");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("begin");
  await client.query(fs.readFileSync("supabase/schema.sql", "utf8"));

  for (const s of suppliers) {
    await client.query(
      "insert into companies (id, name, payment_terms, payment_method, bank_name, bank_last4) values ($1,$2,$3,$4,$5,$6)",
      [s.id, s.name, s.paymentTerms, s.paymentMethod, s.bankName, s.bankAccountNumber.slice(-4)],
    );
    await client.query(
      "insert into company_private (company_id, bank_account_number, phone_on_file, fraud_flag, internal_notes) values ($1,$2,$3,$4,$5)",
      [s.id, s.bankAccountNumber, s.phoneOnFile, s.fraudFlag, s.internalNotes],
    );
    for (const c of s.contacts) {
      await client.query("insert into company_users (email, company_id, name) values ($1,$2,$3)", [
        c.email.toLowerCase(),
        s.id,
        c.name,
      ]);
    }
  }

  for (const p of purchaseOrders) {
    await client.query(
      "insert into purchase_orders (number, company_id, buyer_name, total_amount, invoiced_to_date, receipt_status, lines) values ($1,$2,$3,$4,$5,$6,$7)",
      [p.number, p.supplierId, p.buyerName, p.totalAmount, p.invoicedToDate, p.receiptStatus, JSON.stringify(p.lines)],
    );
  }

  for (const i of invoices) {
    await client.query(
      `insert into invoices (number, company_id, po_number, amount, invoice_date, due_date, status,
         scheduled_payment_date, payment_id, hold_reason, supplier_memo) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        i.number,
        i.supplierId,
        i.poNumber,
        i.amount,
        i.invoiceDate,
        i.dueDate,
        i.status,
        i.scheduledPaymentDate ?? null,
        i.paymentId ?? null,
        i.holdReason ?? null,
        i.supplierMemo ?? null,
      ],
    );
    if (i.internalNotes) {
      await client.query("insert into invoice_private (invoice_number, internal_notes) values ($1,$2)", [
        i.number,
        i.internalNotes,
      ]);
    }
  }

  for (const p of payments) {
    await client.query(
      "insert into payments (id, company_id, invoice_numbers, amount, date, method, reference, deductions) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [p.id, p.supplierId, p.invoiceNumbers, p.amount, p.date, p.method, p.reference, JSON.stringify(p.deductions ?? [])],
    );
  }

  for (const s of POLICIES) {
    await client.query(
      "insert into policies (id, policy_id, policy_title, heading, body, audience, company_id) values ($1,$2,$3,$4,$5,$6,$7)",
      [s.id, s.policyId, s.policyTitle, s.heading, s.body, s.audience, s.supplierId],
    );
  }

  await client.query("commit");
  const counts = await client.query(
    "select (select count(*) from companies) companies, (select count(*) from company_users) users, (select count(*) from invoices) invoices, (select count(*) from payments) payments, (select count(*) from policies) policy_sections",
  );
  console.log("Database ready:", counts.rows[0]);
} catch (err) {
  await client.query("rollback");
  throw err;
} finally {
  await client.end();
}
