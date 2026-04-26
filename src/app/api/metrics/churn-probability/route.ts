import { NextResponse } from "next/server";

export async function GET() {
    // Fake trend data (replace later with real model output)
    const points = [
        { label: "W-6", value: 12 },
        { label: "W-5", value: 18 },
        { label: "W-4", value: 25 },
        { label: "W-3", value: 33 },
        { label: "W-2", value: 28 },
        { label: "W-1", value: 31 },
    ];

    const avg = Math.round(points.reduce((a, p) => a + p.value, 0) / points.length);

    return NextResponse.json({ points, avg });
}
