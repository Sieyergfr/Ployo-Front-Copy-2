"use client";

import { createContext, useContext, type ReactNode } from "react";
const DatePreferencesContext = createContext("dd.mm.yyyy");
export function DatePreferencesProvider({ format, children }: { format: string; children: ReactNode }) {
  return <DatePreferencesContext.Provider value={format}>{children}</DatePreferencesContext.Provider>;
}
export function useDatePreference() { return useContext(DatePreferencesContext); }
