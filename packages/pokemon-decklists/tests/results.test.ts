import { describe, expect, it } from "vitest";
import { matchStats, roundResult } from "../src/results.js";

describe("tournament round results", () => {
	it("calculates a best-of-three round from its games", () => {
		expect(roundResult([{ result: "win" }, { result: "loss" }, { result: "win" }])).toBe("win");
		expect(roundResult([{ result: "win" }, { result: "loss" }])).toBe("draw");
	});

	it("supports Training Court special outcomes", () => {
		expect(roundResult([], "bye")).toBe("win");
		expect(roundResult([], "no-show")).toBe("win");
		expect(roundResult([], "intentional-draw")).toBe("draw");
	});

	it("summarizes rounds rather than individual games", () => {
		const rounds = ["win", "win", "loss", "draw"].map((result, index) => ({ id: String(index), deckId: "deck", deckRevisionId: "v1", playedAt: "2026-07-18", result, visibility: "public" })) as any;
		expect(matchStats(rounds)).toEqual({ total: 4, wins: 2, losses: 1, draws: 1, winRate: 50 });
	});
});
