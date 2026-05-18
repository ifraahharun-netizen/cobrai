import {
    computeRiskVelocity,
    computeRiskAcceleration,
    computeMomentumScore,
    detectCriticalEscalation,
    predictRiskInDays,
} from "./riskVelocity";

type Snapshot = {
    riskScore: number;
    snapshotDate: Date;
    velocityScore?: number | null;
};

export function buildRiskForecast(args: {
    currentRisk: number;
    previousRisk: number;
    latestSnapshot?: Snapshot | null;
    previousSnapshot?: Snapshot | null;
}) {
    const {
        currentRisk,
        previousRisk,
        latestSnapshot,
        previousSnapshot,
    } = args;

    let daysBetween = 1;

    if (
        latestSnapshot?.snapshotDate &&
        previousSnapshot?.snapshotDate
    ) {
        daysBetween = Math.max(
            1,
            Math.round(
                (
                    latestSnapshot.snapshotDate.getTime() -
                    previousSnapshot.snapshotDate.getTime()
                ) / 86400000
            )
        );
    }

    const velocity =
        computeRiskVelocity({
            currentRisk,
            previousRisk,
            daysBetween,
        });

    const previousVelocity =
        latestSnapshot?.velocityScore || 0;

    const acceleration =
        computeRiskAcceleration({
            currentVelocity: velocity,
            previousVelocity,
        });

    const momentum =
        computeMomentumScore({
            riskScore: currentRisk,
            velocity,
            acceleration,
        });

    const escalationDetected =
        detectCriticalEscalation({
            riskScore: currentRisk,
            velocity,
            acceleration,
        });

    return {
        velocityScore: velocity,

        accelerationScore:
            acceleration,

        momentumScore:
            momentum,

        escalationDetected,

        predictedRisk7d:
            predictRiskInDays({
                currentRisk,
                velocity,
                acceleration,
                days: 7,
            }),

        predictedRisk14d:
            predictRiskInDays({
                currentRisk,
                velocity,
                acceleration,
                days: 14,
            }),

        predictedRisk30d:
            predictRiskInDays({
                currentRisk,
                velocity,
                acceleration,
                days: 30,
            }),
    };
}