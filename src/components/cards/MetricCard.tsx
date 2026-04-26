export default function MetricCard({
    title,
    value,
    note,
}: {
    title: string;
    value: string;
    note: string;
}) {
    return (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <div className="font-medium">{title}</div>
                <button className="text-sm text-neutral-500 hover:text-neutral-800">View</button>
            </div>

            <div className="mt-3 text-3xl font-semibold">{value}</div>
            <div className="mt-1 text-sm text-neutral-500">{note}</div>

            <div className="mt-4 rounded-xl border border-dashed p-6 text-neutral-500">
                Placeholder
            </div>
        </div>
    );
}
