// Account set-up shared by the CLI and the server's first start.
import { hashPassword } from "./auth.js";
import { validateNewUser } from "./validation.js";

// Creates a user unless one with that username already exists. Returns a status word.
export async function ensureUser(store, { username, password, role, displayName }) {
  const existing = await store.getUserByUsername(username);
  if (existing) return existing.role === role ? "exists" : "exists-with-other-role";
  const input = validateNewUser({ username, password, role, displayName });
  const created = await store.createUser({ ...input, passwordHash: await hashPassword(input.password) });
  return created ? "created" : "exists";
}

// Creates the administrator named in the settings (WADDLE_ADMIN_USER, WADDLE_ADMIN_PASSWORD)
// while there is no administrator at all, so a deploy that does not run install.sh, such as
// one from Slipway, still ends with someone who can sign in. Once any administrator exists
// the settings are ignored, so changing the password there changes nothing.
export async function ensureFirstAdmin(store, { username, password } = {}) {
  if (!username || !password) return "not-configured";
  if (await store.countUsersByRole("admin")) return "admin-exists";
  return ensureUser(store, { username, password, role: "admin" });
}
