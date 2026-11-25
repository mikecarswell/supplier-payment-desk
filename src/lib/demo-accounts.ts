// Demo sign-in accounts. These use the fictional suppliers' emails, so nobody can
// receive a code for them; the demo sign-in route signs in as them directly.
// Two are deliberately unregistered, to show what an impostor gets.
export const DEMO_ACCOUNTS = [
  { email: "ar@northwindpkg.com", label: "Northwind Packaging", note: "registered" },
  { email: "billing@brightlinelogistics.com", label: "Brightline Logistics", note: "registered" },
  { email: "accounts@cedarpine.co", label: "Cedar & Pine Office Supply", note: "registered" },
  { email: "ar@helixlab.io", label: "Helix Lab Instruments", note: "registered" },
  { email: "finance@summitfacilities.com", label: "Summit Facilities", note: "registered" },
  { email: "northwind.billing@gmail.com", label: "Impostor: personal Gmail", note: "not registered" },
  { email: "accounts@cedarpine-co.com", label: "Impostor: look-alike domain", note: "not registered" },
] as const;

export const isDemoAccount = (email: string) => DEMO_ACCOUNTS.some((a) => a.email === email.trim().toLowerCase());
