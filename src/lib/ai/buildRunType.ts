export const PROMPT_VERSION = "ai_insights_v2";

export function buildRunType(timeframe: string, promptVersion = PROMPT_VERSION): string {
    return `ai_insights_${timeframe}_${promptVersion}`;
}