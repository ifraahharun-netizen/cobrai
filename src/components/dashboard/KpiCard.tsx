export default function KpiCard({
    title,
    value,
    subtitle,
}: {
    title: string;
    value: string | number;
    subtitle?: string;
}) {
    return (
        <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold text-black/60">{title}</div>
                <div className="text-xs text-black/40">i</div>
            </div>

            <div className="text-2xl font-semibold tracking-tight">{value}</div>
            {subtitle ? <div className="mt-1 text-xs text-black/50">{subtitle}</div> : null}
        </div>
    );
}
