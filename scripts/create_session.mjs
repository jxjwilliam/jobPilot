// Generate a Supabase session token for a user by email
// Usage: node scripts/create_session.mjs <email>
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/create_session.mjs <email>");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing env vars. Source .env.local first.");
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find user by email
const { data: users, error: findError } = await adminClient.auth.admin.listUsers();
if (findError) { console.error("List users error:", findError); process.exit(1); }

const user = users.users.find(u => u.email === email);
if (!user) { console.error(`User ${email} not found`); process.exit(1); }

console.log(`Found user: ${user.id} (${user.email})`);

// Generate a sign-in link (magic link with redirect)
const { data, error } = await adminClient.auth.admin.generateLink({
  type: "magiclink",
  email: email,
  options: { redirectTo: `http://localhost:3000/auth/callback` },
});

if (error) { console.error("Generate link error:", error); process.exit(1); }

console.log("Generated link:", data.properties?.action_link || data?.url || "N/A");
