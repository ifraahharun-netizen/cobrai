import { NextResponse } from "next/server";

type Task = {
    id: string;
    title: string;
    account?: string;
    done: boolean;
    createdAt: string;
};

const g = globalThis as any;
g.__cobrai_tasks = g.__cobrai_tasks ?? ([] as Task[]);

export async function GET() {
    return NextResponse.json({ tasks: g.__cobrai_tasks });
}

export async function POST(req: Request) {
    const body = await req.json().catch(() => ({}));
    const title = String(body.title ?? "").trim();
    const account = body.account ? String(body.account) : undefined;

    if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

    const task: Task = {
        id: crypto.randomUUID(),
        title,
        account,
        done: false,
        createdAt: new Date().toISOString(),
    };

    g.__cobrai_tasks.unshift(task);
    return NextResponse.json({ task });
}

export async function PATCH(req: Request) {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "");
    const done = Boolean(body.done);

    const t = g.__cobrai_tasks.find((x: Task) => x.id === id);
    if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

    t.done = done;
    return NextResponse.json({ task: t });
}
