export type Home = "palm_coast" | "boynton_beach";
export const HOME_LABEL: Record<string, string> = { palm_coast: "Palm Coast", boynton_beach: "Boynton Beach" };

function parts(addr: string) {
  const a = addr.toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ");
  return { zip: a.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1], street: a.match(/\b(\d{1,6}) ([a-z0-9]+)/)?.slice(1, 3).join(" "), raw: a };
}

/** Decide which home a shipping address belongs to. */
export function tagHome(address: string | null | undefined, palmCoast: string, boynton: string): Home | null {
  if (!address) return null;
  const a = parts(address);
  for (const [home, saved] of [["palm_coast", palmCoast], ["boynton_beach", boynton]] as const) {
    if (!saved) continue;
    const s = parts(saved);
    if (s.street && a.street === s.street) return home;
    if (s.zip && a.zip === s.zip) return home;
  }
  if (a.raw.includes("palm coast") || a.zip === "32137" || a.zip === "32164") return "palm_coast";
  if (a.raw.includes("boynton") || ["33424", "33425", "33426", "33435", "33436", "33437", "33472", "33473", "33474"].includes(a.zip || "")) return "boynton_beach";
  return null;
}
