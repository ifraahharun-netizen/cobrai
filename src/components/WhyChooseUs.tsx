"use client";

import React from "react";
import { motion, Variants } from "framer-motion";

const items = [
    {
        title: "See Who's About to Churn",
        desc: "Identify customers at risk in the next 7–30 days — before revenue is lost.",
    },
    {

        title: "Understand Why It's Happening",
        desc: "Cobrai pinpoints the exact behaviours and usage drops driving churn.",
    },
    {
        title: "Know What To Do Next",
        desc: " Get clear, AI-recommended actions to retain accounts and prioritise support.",
    },
];

const cardVariants: Variants = {
    hidden: { opacity: 0, y: 18 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.55, delay: i * 0.12, ease: "easeOut" },
    }),
};

export default function WhyChooseUs() {
    return (
        <section
            className="why">

            <h3 className="why__title">Why Choose Us</h3>
            <p className="why__subtitle">
                Cobrai gives you powerful AI tools to predict, retain, and understand customers.
            </p>

            <div className="why__cards">
                {items.map((item, i) => (
                    <motion.div
                        key={item.title}
                        className="whyCard"
                        custom={i}
                        variants={cardVariants}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, amount: 0.25 }}
                        whileHover={{ y: -6, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        transition={{ type: "spring", stiffness: 280, damping: 22 }}
                    >
                        <h4 className="whyCard__title">{item.title}</h4>
                        <p className="whyCard__text">{item.desc}</p>
                    </motion.div>

                ))}
            </div>
        </section>
    );
}
