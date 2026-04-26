import styles from "./RetentionChart.module.css";

const points = [
    { x: 0, y: 62 }, { x: 12, y: 58 }, { x: 24, y: 64 }, { x: 36, y: 60 },
    { x: 48, y: 66 }, { x: 60, y: 69 }, { x: 72, y: 67 }, { x: 84, y: 72 }, { x: 100, y: 70 },
];

function toPath(pts: { x: number; y: number }[]) {
    return pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${100 - p.y}`)
        .join(" ");
}

export default function RetentionChart() {
    const line = toPath(points);
    const area = `${line} L 100 100 L 0 100 Z`;

    return (
        <div className={styles.panel}>
            <div className={styles.header}>
                <div>
                    <div className={styles.title}>Store Retention Trend</div>
                    <div className={styles.sub}>Cobrai model: usage + tickets + billing signals</div>
                </div>

                <div className={styles.tabs}>
                    <button className={styles.tabActive}>Retention</button>
                    <button className={styles.tab}>Churn Risk</button>
                    <button className={styles.tab}>Expansion</button>
                </div>
            </div>

            <div className={styles.controls}>
                <div className={styles.pills}>
                    <span className={styles.pill}>All day</span>
                    <span className={styles.pill}>All week</span>
                    <span className={styles.pillActive}>All month</span>
                    <span className={styles.pill}>All year</span>
                </div>

                <div className={styles.range}>
                    <span>2026-01-01</span>
                    <span style={{ opacity: 0.6 }}>→</span>
                    <span>2026-12-31</span>
                </div>
            </div>

            <div className={styles.chartWrap}>
                <svg viewBox="0 0 100 100" className={styles.svg} preserveAspectRatio="none">
                    <path d={area} className={styles.area} />
                    <path d={line} className={styles.line} />
                </svg>

                <div className={styles.legend}>
                    <div className={styles.legendItem}><span className={styles.dotA} /> Retention score</div>
                    <div className={styles.legendItem}><span className={styles.dotB} /> Risk threshold</div>
                </div>
            </div>
        </div>
    );
}
