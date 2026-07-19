import type { MatchResult } from "./domain.js";

export function roundResult(games: Array<{ result: MatchResult["result"] }>, specialOutcome?: MatchResult["specialOutcome"]): MatchResult["result"] {
	if (specialOutcome === "bye" || specialOutcome === "no-show") return "win";
	if (specialOutcome === "intentional-draw") return "draw";
	const wins = games.filter((game) => game.result === "win").length;
	const losses = games.filter((game) => game.result === "loss").length;
	return wins > losses ? "win" : losses > wins ? "loss" : "draw";
}

export function matchStats(items: MatchResult[]) {
	const wins = items.filter((item) => item.result === "win").length;
	const losses = items.filter((item) => item.result === "loss").length;
	const draws = items.length - wins - losses;
	return { total: items.length, wins, losses, draws, winRate: items.length ? Math.round((wins / items.length) * 1000) / 10 : 0 };
}
