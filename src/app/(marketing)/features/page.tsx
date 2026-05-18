import Link from "next/link";
import FeatureHeroVisual from "@/components/landing/FeatureHeroVisual";

export default function FeaturesPage() {
    return (
        <section className="landingSection">
            <div className="sectionShell">

                {/* HERO */}
                <div className="featureHero">

                    <p className="featureEyebrow">
                        RETENTION INTELLIGENCE
                    </p>

                    <h1 className="featureHeroTitle">
                        Protect MRR with
                        <br />
                        AI retention intelligence
                    </h1>

                    <p className="featureHeroText">
                        Track churn risk, uncover warning signals, and prioritize the accounts that need attention immediately.
                    </p>

                    <div className="featureHeroButtons">

                        <Link
                            href="/signup"
                            className="featurePrimaryBtn"
                        >
                            Reduce Churn Now
                        </Link>

                    </div>

                </div>

                {/* PREMIUM VISUAL */}
                <FeatureHeroVisual />

            </div>
        </section>
    );
}