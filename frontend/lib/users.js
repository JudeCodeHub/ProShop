export const ROLES = ["cashier", "admin"];

export const ROLE_LABELS = { admin: "Admin", cashier: "Cashier" };

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `A password can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return "";
}

export function validateNewUser({ name = "", email = "", password = "", role = "" } = {}) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "Enter a name.";
  }
  if (trimmedName.length > 100) {
    return "A name can be at most 100 characters.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address.";
  }
  if (!ROLES.includes(role)) {
    return "Choose a role.";
  }
  return validatePassword(password);
}

export const newUserBody = ({ name, email, password, role }) => ({
  name: name.trim(),
  email: email.trim().toLowerCase(),
  password,
  role,
});

export function filterUsers(users, search = "") {
  const term = search.trim().toLowerCase();
  if (!term) {
    return users;
  }
  return users.filter(
    (user) =>
      user.name.toLowerCase().includes(term) ||
      user.email.toLowerCase().includes(term) ||
      user.role.toLowerCase() === term,
  );
}

export function canDeactivate(user, currentUserId, users) {
  if (user.id === currentUserId) {
    return "You cannot deactivate your own account.";
  }
  if (
    user.role === "admin" &&
    users.filter((other) => other.role === "admin" && other.isActive).length <= 1
  ) {
    return "This is the last active admin. Add another admin first.";
  }
  return "";
}
