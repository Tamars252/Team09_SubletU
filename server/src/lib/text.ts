/**
 * Initials for the avatar badge: first letter of the first two name parts.
 * Shared by registration and the seed script so a seeded account and a
 * registered one render identically.
 */
export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
