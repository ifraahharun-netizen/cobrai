import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AuditRequestBody = {
    name?: unknown;
    email?: unknown;
    website?: unknown;
    mrr?: unknown;
};

const MRR_RANGES = new Set([
    "pre-revenue",
    "under-5k",
    "5k-20k",
    "20k-50k",
    "50k-100k",
    "100k-plus",
]);

function normaliseText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normaliseWebsite(value: string) {
    if (!value) {
        return "";
    }

    try {
        const withProtocol = /^https?:\/\//i.test(value)
            ? value
            : `https://${value}`;

        const url = new URL(withProtocol);

        if (!["http:", "https:"].includes(url.protocol)) {
            return "";
        }

        return url.toString();
    } catch {
        return "";
    }
}

function getClientIp(request: Request) {
    const forwardedFor = request.headers.get("x-forwarded-for");

    if (forwardedFor) {
        return forwardedFor.split(",")[0]?.trim() || null;
    }

    return request.headers.get("x-real-ip");
}

function createSecureToken() {
    return randomBytes(32).toString("base64url");
}

function hashToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function requestAcceptsHtml(request: Request) {
    return request.headers.get("accept")?.includes("text/html") ?? false;
}

function createUploadPath(auditId: string, uploadToken: string) {
    return (
        `/retention-audit/upload/${auditId}` +
        `?token=${encodeURIComponent(uploadToken)}`
    );
}

export async function POST(request: Request) {
    try {
        const contentType = request.headers.get("content-type") ?? "";

        let body: AuditRequestBody;

        if (contentType.includes("application/json")) {
            body = (await request.json()) as AuditRequestBody;
        } else {
            const formData = await request.formData();

            body = {
                name: formData.get("name"),
                email: formData.get("email"),
                website: formData.get("website"),
                mrr: formData.get("mrr"),
            };
        }

        const name = normaliseText(body.name);
        const email = normaliseText(body.email).toLowerCase();
        const website = normaliseWebsite(normaliseText(body.website));
        const mrr = normaliseText(body.mrr);

        if (!name || name.length < 2 || name.length > 100) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Please enter a valid name.",
                },
                { status: 400 },
            );
        }

        if (!email || !isValidEmail(email) || email.length > 254) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Please enter a valid work email.",
                },
                { status: 400 },
            );
        }

        if (!website) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Please enter a valid company website.",
                },
                { status: 400 },
            );
        }

        if (!MRR_RANGES.has(mrr)) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Please select a valid MRR range.",
                },
                { status: 400 },
            );
        }

        const recentDuplicate =
            await prisma.retentionAuditRequest.findFirst({
                where: {
                    email,
                    createdAt: {
                        gte: new Date(Date.now() - 15 * 60 * 1000),
                    },
                },
                select: {
                    id: true,
                    status: true,
                    createdAt: true,
                },
                orderBy: {
                    createdAt: "desc",
                },
            });

        /*
         * The raw token is never stored, so an existing request cannot return
         * its original token. Generate a fresh secure token and replace the
         * stored hash so the customer can continue from the combined form.
         */
        if (recentDuplicate) {
            const uploadToken = createSecureToken();
            const uploadTokenHash = hashToken(uploadToken);

            await prisma.retentionAuditRequest.update({
                where: {
                    id: recentDuplicate.id,
                },
                data: {
                    uploadTokenHash,
                    userAgent: request.headers.get("user-agent"),
                    ipAddress: getClientIp(request),
                },
            });

            const uploadPath = createUploadPath(
                recentDuplicate.id,
                uploadToken,
            );

            if (requestAcceptsHtml(request)) {
                return NextResponse.redirect(
                    new URL(uploadPath, request.url),
                    303,
                );
            }

            return NextResponse.json(
                {
                    success: true,
                    message:
                        "Your existing audit request is ready for its secure CSV upload.",
                    id: recentDuplicate.id,
                    requestId: recentDuplicate.id,
                    token: uploadToken,
                    uploadToken,
                    status: recentDuplicate.status,
                    createdAt: recentDuplicate.createdAt,
                    uploadUrl: uploadPath,
                },
                { status: 200 },
            );
        }

        const uploadToken = createSecureToken();
        const uploadTokenHash = hashToken(uploadToken);

        const auditRequest =
            await prisma.retentionAuditRequest.create({
                data: {
                    name,
                    email,
                    website,
                    mrrRange: mrr,
                    source: "retention-audit-landing-page",
                    userAgent: request.headers.get("user-agent"),
                    ipAddress: getClientIp(request),
                    uploadTokenHash,
                },
                select: {
                    id: true,
                    createdAt: true,
                },
            });

        const uploadPath = createUploadPath(
            auditRequest.id,
            uploadToken,
        );

        /*
         * Keep the redirect for any old HTML form that still submits directly
         * to this route.
         */
        if (requestAcceptsHtml(request)) {
            return NextResponse.redirect(
                new URL(uploadPath, request.url),
                303,
            );
        }

        /*
         * The combined client-side form uses these values to upload the CSV
         * immediately without visiting a separate upload page.
         */
        return NextResponse.json(
            {
                success: true,
                message:
                    "Your free AI Retention Audit request has been received.",
                id: auditRequest.id,
                requestId: auditRequest.id,
                token: uploadToken,
                uploadToken,
                createdAt: auditRequest.createdAt,
                uploadUrl: uploadPath,
            },
            { status: 201 },
        );
    } catch (error) {
        console.error(
            "Failed to create retention audit request:",
            error,
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "We could not submit your audit request right now. Please try again.",
            },
            { status: 500 },
        );
    }
}