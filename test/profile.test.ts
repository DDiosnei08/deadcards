import { describe, expect, it } from "vitest";
import { DEFAULT_TIER_CONFIG } from "../src/lib/cards";
import { parseProfileCard, summarizeCollection } from "../src/lib/profile";
import type { Player } from "../src/lib/types";

function player(id: string, ovr: number, extra: Partial<Player> = {}): Player {
  return {
    id, name: id, teamId: "t1", hero: "Abrams", position: "Flex", ovr,
    stats: { MIR: ovr, MAC: ovr, SUP: ovr, MOV: ovr, POL: ovr, CON: ovr },
    c1: "#000000", c2: "#ffffff", history: [], ...extra,
  };
}

describe("parseProfileCard", () => {
  const base = { name: "Fulano", hero: "Abrams", stats: { MIR: 50, MAC: 50, SUP: 50, MOV: 50, POL: 50, CON: 50 } };

  it("aceita carta antiga sem função", () => {
    expect(parseProfileCard(base)).not.toHaveProperty("position");
  });

  it("guarda uma função válida e recusa uma desconhecida", () => {
    expect(parseProfileCard({ ...base, position: "Suporte" })?.position).toBe("Suporte");
    expect(parseProfileCard({ ...base, position: "Admin" })).toBeNull();
    expect(parseProfileCard({ ...base, position: 1 })).toBeNull();
  });
});

describe("summarizeCollection", () => {
  it("não divide por zero se o catálogo estiver vazio", () => {
    const result = summarizeCollection([], ["missing"], DEFAULT_TIER_CONFIG);
    expect(result.cards).toEqual([]);
    expect(result.percent).toBe(0);
    expect(result.best).toBeNull();
    expect(result.rarities.every((r) => r.count === 0)).toBe(true);
  });

  it("ignora IDs duplicados e cartas removidas do catálogo", () => {
    const all = [player("a", 91), player("b", 77), player("c", 50)];
    const result = summarizeCollection(all, ["a", "a", "b", "deleted"], DEFAULT_TIER_CONFIG);
    expect(result.cards.map((p) => p.id)).toEqual(["a", "b"]);
    expect(result.percent).toBe(67);
    expect(result.best?.id).toBe("a");
    expect(result.rarities.find((r) => r.tierKey === "S")?.count).toBe(1);
    expect(result.rarities.find((r) => r.tierKey === "B")?.count).toBe(1);
  });

  it("conta as versões especiais no progresso e na raridade base", () => {
    const all = [player("base", 83), player("special", 95, {
      special: true, variantOf: "base", frame: { style: "gelo" },
    })];
    const result = summarizeCollection(all, ["special"], DEFAULT_TIER_CONFIG);
    expect(result.percent).toBe(50);
    expect(result.rarities.find((r) => r.tierKey === "SS")?.count).toBe(1);
    expect(result.rarities.reduce((sum, r) => sum + r.count, 0)).toBe(1);
  });
});
