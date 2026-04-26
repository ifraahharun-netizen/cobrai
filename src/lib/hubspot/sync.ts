
import { prisma } from "@/lib/prisma";

type HubSpotCompany = {
    id: string;
    properties?: {
        name?: string | null;
        domain?: string | null;
        lifecyclestage?: string | null;
        createdate?: string | null;
        hs_lastmodifieddate?: string | null;
        annualrevenue?: string | null;
        numberofemployees?: string | null;
    };
};

function toIsoOrNull(value?: string | null) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function toDateOrNull(value?: string | null) {
    const iso = toIsoOrNull(value);
    return iso ? new Date(iso) : null;
}

function toNumberOrZero(value?: string | null) {
    if (!value) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function deriveRiskFromLastActivity(lastActiveAt: Date | null) {
    if (!lastActiveAt) {
        return {
            riskScore: 55,
            churnRisk: 55,
            healthScore: 45,
            status: "watch",
            reasonKey: "crm_inactive",
            reasonLabel: "No recent CRM activity",
        };
    }

    const days = Math.floor((Date.now() - lastActiveAt.getTime()) / 86400000);

    if (days >= 60) {
        return {
            riskScore: 82,
            churnRisk: 82,
            healthScore: 18,
            status: "at_risk",
            reasonKey: "crm_inactive",
            reasonLabel: `No recent CRM activity in ${days} days`,
        };
    }

    if (days >= 30) {
        return {
            riskScore: 68,
            churnRisk: 68,
            healthScore: 32,
            status: "watch",
            reasonKey: "crm_inactive",
            reasonLabel: `No recent CRM activity in ${days} days`,
        };
    }

    if (days >= 14) {
        return {
            riskScore: 52,
            churnRisk: 52,
            healthScore: 48,
            status: "watch",
            reasonKey: "crm_inactive",
            reasonLabel: `Low recent CRM activity (${days} days)`,
        };
    }

    return {
        riskScore: 24,
        churnRisk: 24,
        healthScore: 76,
        status: "active",
        reasonKey: "crm_active",
        reasonLabel: "Recent CRM activity detected",
    };
}

async function fetchHubSpotCompanies(accessToken: string): Promise<HubSpotCompany[]> {
    const out: HubSpotCompany[] = [];
    let after: string | undefined;
    let loops = 0;

    while (loops < 5) {
        const url = new URL("https://api.hubapi.com/crm/v3/objects/companies");
        url.searchParams.set("limit", "100");
        url.searchParams.set(
            "properties",
            [
                "name",
                "domain",
                "lifecyclestage",
                "createdate",
                "hs_lastmodifieddate",
                "annualrevenue",
                "numberofemployees",
            ].join(",")
        );

        if (after) {
            url.searchParams.set("after", after);
        }

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data?.message || "Failed to fetch HubSpot companies");
        }

        const results = Array.isArray(data?.results) ? data.results : [];
        out.push(...results);

        after = data?.paging?.next?.after;
        if (!after) break;

        loops += 1;
    }

    return out;
}

export async function syncHubSpotWorkspace(args: {
    workspaceId: string;
    accessToken: string;
}) {
    const { workspaceId, accessToken } = args;

    const companies = await fetchHubSpotCompanies(accessToken);

    let synced = 0;
    let created = 0;
    let updated = 0;
    let risksUpdated = 0;

    for (const company of companies) {
        const hubspotCompanyId = String(company.id);
        const props = company.properties || {};

        const name = (props.name || "").trim() || `HubSpot Company ${hubspotCompanyId}`;
        const domain = (props.domain || "").trim() || null;
        const createdAt = toDateOrNull(props.createdate) || new Date();
        const lastActiveAt =
            toDateOrNull(props.hs_lastmodifieddate) ||
            toDateOrNull(props.createdate) ||
            null;

        const annualRevenue = toNumberOrZero(props.annualrevenue);
        const estimatedMrr =
            annualRevenue > 0 ? Math.round(annualRevenue / 12) : 0;

        const derived = deriveRiskFromLastActivity(lastActiveAt);

        let customer = await prisma.customer.findFirst({
            where: {
                workspaceId,
                hubspotCompanyId,
            },
            select: {
                id: true,
                hubspotCompanyId: true,
            },
        });

        if (!customer) {
            customer = await prisma.customer.findFirst({
                where: {
                    workspaceId,
                    OR: domain
                        ? [
                            {
                                name: {
                                    equals: name,
                                    mode: "insensitive",
                                },
                            },
                            {
                                website: {
                                    equals: domain,
                                    mode: "insensitive",
                                },
                            },
                        ]
                        : [
                            {
                                name: {
                                    equals: name,
                                    mode: "insensitive",
                                },
                            },
                        ],
                },
                select: {
                    id: true,
                    hubspotCompanyId: true,
                },
            });
        }

        if (customer) {
            await prisma.customer.update({
                where: { id: customer.id },
                data: {
                    name,
                    website: domain,
                    plan: props.lifecyclestage || null,
                    hubspotCompanyId,
                    lastActiveAt,
                    mrr: estimatedMrr,
                    churnRisk: derived.churnRisk,
                    riskScore: derived.riskScore,
                    healthScore: derived.healthScore,
                    status: derived.status,
                },
            });

            updated += 1;

            const existingRisk = await prisma.accountRisk.findFirst({
                where: {
                    workspaceId,
                    customerId: customer.id,
                },
                select: { id: true },
                orderBy: { updatedAt: "desc" },
            });

            if (derived.riskScore >= 45) {
                const riskData = {
                    workspaceId,
                    customerId: customer.id,
                    companyName: name,
                    riskScore: derived.riskScore,
                    reasonKey: derived.reasonKey,
                    reasonLabel: derived.reasonLabel,
                    mrr: estimatedMrr,
                };

                if (existingRisk) {
                    await prisma.accountRisk.update({
                        where: { id: existingRisk.id },
                        data: riskData,
                    });
                } else {
                    await prisma.accountRisk.create({
                        data: riskData,
                    });
                }

                risksUpdated += 1;
            }
        } else {
            const createdCustomer = await prisma.customer.create({
                data: {
                    workspaceId,
                    name,
                    email: null,
                    website: domain,
                    plan: props.lifecyclestage || null,
                    seats: 1,
                    mrr: estimatedMrr,
                    churnRisk: derived.churnRisk,
                    riskScore: derived.riskScore,
                    healthScore: derived.healthScore,
                    lastActiveAt,
                    createdAt,
                    hubspotCompanyId,
                    status: derived.status,
                },
                select: { id: true },
            });

            created += 1;

            if (derived.riskScore >= 45) {
                await prisma.accountRisk.create({
                    data: {
                        workspaceId,
                        customerId: createdCustomer.id,
                        companyName: name,
                        riskScore: derived.riskScore,
                        reasonKey: derived.reasonKey,
                        reasonLabel: derived.reasonLabel,
                        mrr: estimatedMrr,
                    },
                });

                risksUpdated += 1;
            }
        }

        synced += 1;
    }

    return {
        ok: true,
        synced,
        created,
        updated,
        risksUpdated,
    };
}