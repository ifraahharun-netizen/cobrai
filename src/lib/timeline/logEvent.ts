import { prisma } from "@/lib/prisma";

type LogEventInput = {
    workspaceId: string;
    customerId: string;

    type: string;

    title: string;

    description?: string;

    severity?: "info" | "success" | "warning" | "danger";

    source?: "stripe" | "ai" | "automation" | "hubspot" | "system";

    metadata?: Record<string, any>;
};

export async function logTimelineEvent(input: LogEventInput) {
    try {
        await prisma.accountTimelineEvent.create({
            data: {
                workspaceId: input.workspaceId,
                customerId: input.customerId,

                type: input.type,

                title: input.title,

                description: input.description,

                severity: input.severity || "info",

                source: input.source || "system",

                metadata: input.metadata || {},
            },
        });
    } catch (error) {
        console.error("Timeline event error:", error);
    }
}