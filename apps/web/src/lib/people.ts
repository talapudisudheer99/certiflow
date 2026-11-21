import { api } from "@/lib/api";

export type Role = "CENTRE" | "DISTRICT_OFFICER" | "QUALITY" | "STATE";
export type Person = { id: string; name: string; role: Role; districtId: string | null };

export const ROLE_LABEL: Record<Role, string> = {
  CENTRE: "Training centre",
  DISTRICT_OFFICER: "District officer",
  QUALITY: "Quality reviewer",
  STATE: "State office",
};

export const listPeople = () => api<{ people: Person[] }>("/auth/people");
export const getMe = () => api<{ user: Person }>("/auth/me");
export const login = (userId: string) => api<{ user: Person }>("/auth/login", { method: "POST", body: JSON.stringify({ userId }) });
export const logout = () => api<{ ok: true }>("/auth/logout", { method: "POST" });
