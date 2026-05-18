type VelocityInput = {
    currentRisk: number;
    previousRisk: number;
    daysBetween: number;
};

export function computeRiskVelocity({
    currentRisk,
    previousRisk,
    daysBetween,
}: VelocityInput) {
    if (!daysBetween || daysBetween <= 0) {
        return 0;
    }

    return Number(
        (
            (currentRisk - previousRisk) /
            daysBetween
        ).toFixed(2)
    );
}

export function computeRiskAcceleration(args: {
    currentVelocity: number;
    previousVelocity: number;
}) {
    return Number(
        (
            args.currentVelocity -
            args.previousVelocity
        ).toFixed(2)
    );
}

export function computeMomentumScore(args: {
    riskScore: number;
    velocity: number;
    acceleration: number;
}) {
    let score = args.riskScore;

    score += args.velocity * 8;
    score += args.acceleration * 12;

    return Math.max(
        0,
        Math.min(100, Math.round(score))
    );
}

export function detectCriticalEscalation(args: {
    riskScore: number;
    velocity: number;
    acceleration: number;
}) {
    return (
        args.riskScore >= 75 &&
        args.velocity >= 2 &&
        args.acceleration >= 1
    );
}

export function predictRiskInDays(args: {
    currentRisk: number;
    velocity: number;
    acceleration: number;
    days: number;
}) {
    const projected =
        args.currentRisk +
        args.velocity * args.days +
        args.acceleration * (args.days / 2);

    return Math.max(
        0,
        Math.min(100, Math.round(projected))
    );
}