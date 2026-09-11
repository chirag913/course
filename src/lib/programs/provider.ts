import type { ProgramType, ProgramTypeAdapter } from "./types";

const adapters = new Map<ProgramType, ProgramTypeAdapter>();

export function registerProgramTypeAdapter(adapter: ProgramTypeAdapter) {
  adapters.set(adapter.typeId, adapter);
}

export function getProgramTypeAdapter(typeId: ProgramType): ProgramTypeAdapter | undefined {
  return adapters.get(typeId);
}

export function getAllProgramTypeAdapters(): ProgramTypeAdapter[] {
  return Array.from(adapters.values());
}

export { adapters as _registeredProgramTypeAdapters };
