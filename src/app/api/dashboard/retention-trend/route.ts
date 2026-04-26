import { NextResponse } from "next/server";

export async function GET() {
    // Mock data for now — later replace with real metrics
    const data = [
        { date: "Mon", retention: 94.1 },
        { date: "Tue", retention: 93.8 },
        { date: "Wed", retention: 93.2 },
        { date: "Thu", retention: 92.9 },
        { date: "Fri", retention: 92.6 },
        { date: "Sat", retention: 92.4 },
        { date: "Sun", retention: 92.4 },
    ];

    return NextResponse.json(data);
}
