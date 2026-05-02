export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px 16px",
                background: "#ffffff",
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 440,
                }}
            >
                {children}
            </div>
        </div>
    );
}