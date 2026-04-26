"use client";

import { useEffect } from "react";

type TermsSection = {
    heading: string;
    body: string[];
};

type TermsModalProps = {
    open: boolean;
    title: string;
    sections: TermsSection[];
    onClose: () => void;
};

export default function TermsModal({
    open,
    title,
    sections,
    onClose,
}: TermsModalProps) {
    useEffect(() => {
        if (!open) return;

        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }

        document.addEventListener("keydown", onKeyDown);
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = "";
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="legalModalOverlay" onClick={onClose}>
            <div
                className="legalModalCard"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="legal-modal-title"
            >
                <div className="legalModalHeader">
                    <h2 id="legal-modal-title" className="legalModalTitle">
                        {title}
                    </h2>

                    <button
                        type="button"
                        className="legalModalClose"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        ×
                    </button>
                </div>

                <div className="legalModalBody">
                    {sections.map((section) => (
                        <div key={section.heading} className="legalModalSection">
                            <h3>{section.heading}</h3>
                            {section.body.map((paragraph, index) => (
                                <p key={`${section.heading}-${index}`}>{paragraph}</p>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}