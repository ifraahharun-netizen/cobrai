import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getWorkspaceFromRequest } from "@/lib/auth/getWorkspaceFromRequest";
import { buildThreads, demoThreads, normaliseChannel, threadKeyFor, type InboxMessageView } from "@/lib/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = InboxMessageView & {
    threadKey: string;
    customerId: string | null;
    customerName: string | null;
    archived?: boolean;
};

/** True when the inbox table hasn't been created yet (migration not applied). */
function isMissingTable(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function GET(req: Request) {
    try {
        const { workspaceId } = await getWorkspaceFromRequest(req);

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { demoMode: true, senderEmail: true, senderName: true, name: true },
        });

        if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

        if (workspace.demoMode) {
            return NextResponse.json({ source: "demo", threads: demoThreads(), setupRequired: false });
        }

        const senderEmail = workspace.senderEmail || "";
        const senderName = workspace.senderName || workspace.name || "Cobrai";

        // Retention emails Cobrai sent.
        const executions = await prisma.actionExecution.findMany({
            where: { workspaceId, subject: { not: null }, body: { not: null } },
            orderBy: { createdAt: "desc" },
            take: 200,
            select: {
                id: true,
                subject: true,
                body: true,
                status: true,
                provider: true,
                sentAt: true,
                createdAt: true,
                openedAt: true,
                clickedAt: true,
                customerId: true,
                customer: { select: { name: true, email: true } },
            },
        });

        const rows: Row[] = [];

        for (const execution of executions) {
            const to = execution.customer?.email;
            if (!to || !execution.subject) continue;

            rows.push({
                id: `retention-${execution.id}`,
                threadKey: threadKeyFor(to, execution.subject),
                customerId: execution.customerId,
                customerName: execution.customer?.name ?? null,
                direction: "outbound",
                source: "retention",
                channel: normaliseChannel(execution.provider) ?? "cobrai",
                fromEmail: senderEmail,
                fromName: senderName,
                toEmail: to,
                subject: execution.subject,
                bodyText: execution.body ?? "",
                createdAt: (execution.sentAt ?? execution.createdAt).toISOString(),
                status: execution.status === "failed" ? "failed" : "sent",
                read: true,
                openedAt: execution.openedAt?.toISOString() ?? null,
                clickedAt: execution.clickedAt?.toISOString() ?? null,
            });
        }

        // Replies received and replies sent from the inbox.
        let setupRequired = false;

        try {
            const messages = await prisma.inboxMessage.findMany({
                where: { workspaceId },
                orderBy: { createdAt: "desc" },
                take: 500,
                include: { customer: { select: { name: true } } },
            });

            for (const message of messages) {
                rows.push({
                    id: message.id,
                    threadKey: message.threadKey,
                    customerId: message.customerId,
                    customerName: message.customer?.name ?? null,
                    direction: message.direction === "inbound" ? "inbound" : "outbound",
                    source: "inbox",
                    fromEmail: message.fromEmail,
                    fromName: message.fromName,
                    toEmail: message.toEmail,
                    subject: message.subject,
                    bodyText: message.bodyText,
                    bodyHtml: message.bodyHtml,
                    createdAt: message.createdAt.toISOString(),
                    status: message.status,
                    channel: normaliseChannel(message.channel),
                    read: Boolean(message.readAt) || message.direction !== "inbound",
                    archived: Boolean(message.archivedAt),
                });
            }
        } catch (error) {
            if (!isMissingTable(error)) throw error;
            setupRequired = true;
        }

        const threads = buildThreads(rows);

        // Starred and archived conversations.
        if (!setupRequired) {
            try {
                const states = await prisma.inboxThreadState.findMany({
                    where: { workspaceId, OR: [{ starredAt: { not: null } }, { archivedAt: { not: null } }] },
                    select: { threadKey: true, starredAt: true, archivedAt: true },
                });
                const byKey = new Map(states.map((state) => [state.threadKey, state]));
                for (const thread of threads) {
                    const state = byKey.get(thread.key);
                    thread.starred = Boolean(state?.starredAt);
                    // Archived until a message arrives after it was archived.
                    if (state?.archivedAt) {
                        thread.archived = new Date(thread.lastAt).getTime() <= state.archivedAt.getTime();
                    }
                }
            } catch (error) {
                if (!isMissingTable(error)) throw error;
                setupRequired = true;
            }
        }

        // Account details for the side panel.
        const customerIds = [...new Set(threads.map((t) => t.customerId).filter((id): id is string => Boolean(id)))];
        const customers = customerIds.length
            ? await prisma.customer.findMany({
                where: { workspaceId, id: { in: customerIds } },
                select: {
                    id: true, name: true, email: true, plan: true, seats: true, mrr: true, status: true,
                    healthScore: true, riskScore: true, lastActiveAt: true, createdAt: true, website: true,
                },
            })
            : [];
        const accounts = new Map(customers.map((c) => [c.id, c]));

        // Retention context for the side panel: risk reasons, unpaid invoices, usage and recent outreach.
        const [risks, unpaidInvoices, snapshots, recentExecutions] = customerIds.length
            ? await Promise.all([
                prisma.accountRisk.findMany({
                    where: { workspaceId, customerId: { in: customerIds } },
                    orderBy: { riskScore: "desc" },
                    select: { customerId: true, reasonLabel: true, previousRiskScore: true },
                }),
                prisma.invoice.findMany({
                    where: { workspaceId, customerId: { in: customerIds }, status: { in: ["failed", "open"] }, paidAt: null },
                    select: { customerId: true, amount: true },
                }),
                prisma.customerHealthSnapshot.findMany({
                    where: { workspaceId, customerId: { in: customerIds } },
                    orderBy: { snapshotDate: "desc" },
                    distinct: ["customerId"],
                    select: { customerId: true, activeDays30d: true },
                }),
                prisma.actionExecution.findMany({
                    where: { workspaceId, customerId: { in: customerIds } },
                    orderBy: { createdAt: "desc" },
                    take: 300,
                    select: {
                        customerId: true, title: true, subject: true, actionType: true, status: true,
                        sentAt: true, createdAt: true, openedAt: true, repliedAt: true,
                    },
                }),
            ])
            : [[], [], [], []];

        const toMajor = (value: number) => (value >= 10000 ? Math.round(value) / 100 : value);

        for (const thread of threads) {
            const c = thread.customerId ? accounts.get(thread.customerId) : undefined;
            thread.account = c
                ? {
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    plan: c.plan,
                    seats: c.seats,
                    mrr: c.mrr,
                    status: c.status,
                    healthScore: c.healthScore,
                    riskScore: c.riskScore,
                    lastActiveAt: c.lastActiveAt?.toISOString() ?? null,
                    customerSince: c.createdAt.toISOString(),
                    website: c.website,
                    riskReasons: [...new Set(risks.filter((r) => r.customerId === c.id).map((r) => r.reasonLabel))].slice(0, 3),
                    previousRiskScore: risks.find((r) => r.customerId === c.id)?.previousRiskScore ?? null,
                    activeDays30d: snapshots.find((snap) => snap.customerId === c.id)?.activeDays30d ?? null,
                    unpaid: unpaidInvoices
                        .filter((invoice) => invoice.customerId === c.id)
                        .reduce(
                            (sum, invoice) => ({ count: sum.count + 1, amount: sum.amount + toMajor(Number(invoice.amount || 0)) }),
                            { count: 0, amount: 0 }
                        ),
                    recentActions: recentExecutions
                        .filter((execution) => execution.customerId === c.id)
                        .slice(0, 3)
                        .map((execution) => ({
                            title: execution.title || execution.subject || execution.actionType.replace(/_/g, " "),
                            at: (execution.sentAt ?? execution.createdAt).toISOString(),
                            status: execution.status,
                            opened: Boolean(execution.openedAt),
                            replied: Boolean(execution.repliedAt),
                        })),
                }
                : null;
        }

        return NextResponse.json({ source: "live", threads, setupRequired });
    } catch (error) {
        console.error("Inbox load failed", error);
        return NextResponse.json({ error: "Could not load the inbox." }, { status: 500 });
    }
}
