"use client";

import Image from "next/image";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
} from "firebase/auth";

import { getFirebaseAuthSafe } from "@/lib/firebase.client";
import TermsModal from "@/components/TermsModal";
import { privacyContent, termsContent } from "@/lib/legalContent";

type AuthView = "login" | "signup" | null;
type LegalView = "terms" | "privacy" | null;

export default function MarketingHeader() {
    const pathname = usePathname();
    const router = useRouter();

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [authView, setAuthView] = useState<AuthView>(null);
    const [legalView, setLegalView] = useState<LegalView>(null);

    const [fullName, setFullName] = useState("");
    const [companyName, setCompanyName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [agreed, setAgreed] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const isHomeActive = pathname === "/";

    function resetAuthState() {
        setError("");
        setLoading(false);
        setPassword("");
    }

    function openAuth(view: Exclude<AuthView, null>) {
        setMobileMenuOpen(false);
        resetAuthState();
        setAuthView(view);
    }

    function closeAuth() {
        if (loading) return;
        setAuthView(null);
        resetAuthState();
    }

    function switchAuthView(view: Exclude<AuthView, null>) {
        resetAuthState();
        setAuthView(view);
    }

    useEffect(() => {
        setMobileMenuOpen(false);
    }, [pathname]);

    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth > 900) setMobileMenuOpen(false);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);


    useEffect(() => {
        function handleOpenAuth(
            event: Event
        ) {
            const customEvent = event as CustomEvent<{
                view?: "login" | "signup";
            }>;

            openAuth(customEvent.detail?.view ?? "login");
        }

        window.addEventListener("cobrai:open-auth", handleOpenAuth);

        return () => {
            window.removeEventListener("cobrai:open-auth", handleOpenAuth);
        };
    }, []);

    useEffect(() => {
        if (!authView) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !loading) {
                setAuthView(null);
                resetAuthState();
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [authView, loading]);

    async function createSession(idToken: string) {
        const response = await fetch("/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
        });

        if (!response.ok) {
            throw new Error(
                "Authentication succeeded, but the session could not be created."
            );
        }
    }

    async function handleLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const cleanEmail = email.trim().toLowerCase();

        if (!cleanEmail) return setError("Please enter your email.");
        if (!password) return setError("Please enter your password.");

        setLoading(true);

        try {
            const firebase = getFirebaseAuthSafe();

            if (!firebase.ok) {
                throw new Error(
                    firebase.error === "auth/invalid-api-key"
                        ? "Firebase configuration is blocked. Check your Firebase API key restrictions."
                        : `Authentication setup error: ${firebase.error}`
                );
            }

            const credential = await signInWithEmailAndPassword(
                firebase.auth,
                cleanEmail,
                password
            );

            const idToken = await credential.user.getIdToken(true);
            await createSession(idToken);

            setAuthView(null);
            router.push("/dashboard");
            router.refresh();
        } catch (caughtError: unknown) {
            const authError = caughtError as { code?: string; message?: string };

            setError(
                authError.code === "auth/invalid-credential"
                    ? "Incorrect email or password."
                    : authError.message || "Login failed. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }

    function validateSignup() {
        if (!fullName.trim()) return "Please enter your full name.";
        if (!companyName.trim()) return "Please enter your company name.";
        if (!email.trim()) return "Please enter your email.";
        if (!/\S+@\S+\.\S+/.test(email.trim())) return "Please enter a valid email.";
        if (!password) return "Please enter a password.";
        if (password.length < 8) return "Password must be at least 8 characters.";
        if (!agreed) return "Please agree to the Terms and Privacy Policy.";
        return "";
    }

    async function handleSignup(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setError("");

        const validationError = validateSignup();
        if (validationError) return setError(validationError);

        setLoading(true);

        try {
            const firebase = getFirebaseAuthSafe();

            if (!firebase.ok) {
                throw new Error(
                    firebase.error === "auth/invalid-api-key"
                        ? "Firebase configuration is blocked. Check your Firebase API key restrictions."
                        : `Authentication setup error: ${firebase.error}`
                );
            }

            const cleanEmail = email.trim().toLowerCase();
            const credential = await createUserWithEmailAndPassword(
                firebase.auth,
                cleanEmail,
                password
            );

            await updateProfile(credential.user, {
                displayName: fullName.trim(),
            });

            const idToken = await credential.user.getIdToken(true);

            const registerResponse = await fetch("/api/auth/register", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    fullName: fullName.trim(),
                    companyName: companyName.trim(),
                }),
            });

            const registerData = await registerResponse.json().catch(() => null);

            if (!registerResponse.ok || !registerData?.ok) {
                throw new Error(
                    registerData?.error || "Failed to finish account setup."
                );
            }

            await createSession(idToken);

            setAuthView(null);
            router.push("/dashboard");
            router.refresh();
        } catch (caughtError: unknown) {
            const authError = caughtError as { code?: string; message?: string };

            const message =
                authError.code === "auth/email-already-in-use"
                    ? "That email is already in use."
                    : authError.code === "auth/invalid-email"
                        ? "That email address is invalid."
                        : authError.code === "auth/weak-password"
                            ? "Please choose a stronger password."
                            : authError.message ||
                            "Something went wrong while creating your account.";

            setError(message);
        } finally {
            setLoading(false);
        }
    }

    const legalTitle =
        legalView === "terms"
            ? termsContent.title
            : legalView === "privacy"
                ? privacyContent.title
                : "";

    const legalSections =
        legalView === "terms"
            ? termsContent.sections
            : legalView === "privacy"
                ? privacyContent.sections
                : [];

    return (
        <>
            <header className="siteHeader">
                <div className="siteHeaderInner">
                    <Link
                        href="/"
                        aria-label="Go to Cobrai homepage"
                        className="logoWrap"
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <Image
                            src="/branding/cobrai.logo.jpg.PNG"
                            alt="Cobrai"
                            width={126}
                            height={42}
                            priority
                            unoptimized
                        />
                    </Link>

                    <nav className="topNav" aria-label="Main navigation">
                        <Link
                            href="/"
                            className={`navLink ${isHomeActive ? "active" : ""}`}
                        >
                            Home
                        </Link>
                    </nav>

                    <div className="headerActions">
                        <button
                            type="button"
                            className="headerGhostBtn"
                            onClick={() => openAuth("login")}
                        >
                            Log in
                        </button>

                        <button
                            type="button"
                            className="headerPrimaryBtn"
                            onClick={() => openAuth("signup")}
                        >
                            Sign up
                        </button>
                    </div>

                    <button
                        type="button"
                        className="headerMenuButton"
                        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                        aria-expanded={mobileMenuOpen}
                        aria-controls="marketing-mobile-menu"
                        onClick={() => setMobileMenuOpen((current) => !current)}
                    >
                        {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
                    </button>
                </div>

                {mobileMenuOpen && (
                    <nav
                        id="marketing-mobile-menu"
                        className="headerMobileMenu"
                        aria-label="Mobile navigation"
                    >
                        <Link
                            href="/"
                            className={isHomeActive ? "mobileNavActive" : ""}
                            onClick={() => setMobileMenuOpen(false)}
                        >
                            Home
                        </Link>

                        <div className="mobileMenuDivider" />

                        <button
                            type="button"
                            className="headerMobileAuthButton"
                            onClick={() => openAuth("login")}
                        >
                            Log in
                        </button>

                        <button
                            type="button"
                            className="headerMobilePrimary"
                            onClick={() => openAuth("signup")}
                        >
                            Sign up
                        </button>
                    </nav>
                )}
            </header>

            {authView && (
                <div
                    className="marketingAuthOverlay"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeAuth();
                    }}
                >
                    <section
                        className="marketingAuthModal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="marketing-auth-title"
                    >
                        <button
                            type="button"
                            className="marketingAuthClose"
                            aria-label="Close"
                            onClick={closeAuth}
                            disabled={loading}
                        >
                            <X size={18} />
                        </button>

                        <div className="marketingAuthContent">
                            <p className="marketingAuthEyebrow">Cobrai</p>

                            <h2 id="marketing-auth-title">
                                {authView === "login" ? "Welcome back" : "Create your workspace"}
                            </h2>

                            <p className="marketingAuthIntro">
                                {authView === "login"
                                    ? "Log in to access your retention dashboard."
                                    : "Start your 14-day free trial. No credit card required."}
                            </p>

                            <form
                                className="marketingAuthForm"
                                onSubmit={authView === "login" ? handleLogin : handleSignup}
                            >
                                {authView === "signup" && (
                                    <>
                                        <label className="marketingAuthField">
                                            <span>Full name</span>
                                            <input
                                                type="text"
                                                value={fullName}
                                                onChange={(event) => setFullName(event.target.value)}
                                                autoComplete="name"
                                                disabled={loading}
                                            />
                                        </label>

                                        <label className="marketingAuthField">
                                            <span>Company name</span>
                                            <input
                                                type="text"
                                                value={companyName}
                                                onChange={(event) => setCompanyName(event.target.value)}
                                                autoComplete="organization"
                                                disabled={loading}
                                            />
                                        </label>
                                    </>
                                )}

                                <label className="marketingAuthField">
                                    <span>Email</span>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => setEmail(event.target.value)}
                                        autoComplete="email"
                                        disabled={loading}
                                    />
                                </label>

                                <label className="marketingAuthField">
                                    <span>Password</span>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(event) => setPassword(event.target.value)}
                                        autoComplete={authView === "login" ? "current-password" : "new-password"}
                                        disabled={loading}
                                    />
                                </label>

                                {authView === "signup" && (
                                    <label className="marketingAuthLegal">
                                        <input
                                            type="checkbox"
                                            checked={agreed}
                                            onChange={(event) => setAgreed(event.target.checked)}
                                            disabled={loading}
                                        />
                                        <span>
                                            I agree to the{" "}
                                            <button type="button" onClick={() => setLegalView("terms")}>
                                                Terms
                                            </button>{" "}
                                            and{" "}
                                            <button type="button" onClick={() => setLegalView("privacy")}>
                                                Privacy Policy
                                            </button>
                                            .
                                        </span>
                                    </label>
                                )}

                                {error && (
                                    <div className="marketingAuthError" role="alert">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    className="marketingAuthSubmit"
                                    disabled={loading}
                                >
                                    {loading
                                        ? authView === "login"
                                            ? "Logging in..."
                                            : "Creating account..."
                                        : authView === "login"
                                            ? "Log in"
                                            : "Create account"}
                                </button>
                            </form>

                            <p className="marketingAuthSwitch">
                                {authView === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => switchAuthView(authView === "login" ? "signup" : "login")}
                                >
                                    {authView === "login" ? "Sign up" : "Log in"}
                                </button>
                            </p>
                        </div>
                    </section>
                </div>
            )}



            <TermsModal
                open={legalView !== null}
                title={legalTitle}
                sections={legalSections}
                onClose={() => setLegalView(null)}
            />
        </>
    );
}
