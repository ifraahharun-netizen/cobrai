import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./MarketingHeader";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Insights from "./pages/Insights";
import Settings from "./pages/Settings";

// Simple auth check (no backend yet)
const isAuthed = () => localStorage.getItem("cobrai_authed") === "true";

function PrivateRoute({ children }) {
    return isAuthed() ? children : <Navigate to="/" replace />;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Login />} />

                <Route
                    path="/dashboard"
                    element={
                        <PrivateRoute>
                            <Dashboard />
                        </PrivateRoute>
                    }
                />

                <Route
                    path="/customers"
                    element={
                        <PrivateRoute>
                            <Customers />
                        </PrivateRoute>
                    }
                />

                <Route
                    path="/insights"
                    element={
                        <PrivateRoute>
                            <Insights />
                        </PrivateRoute>
                    }
                />

                <Route
                    path="/settings"
                    element={
                        <PrivateRoute>
                            <Settings />
                        </PrivateRoute>
                    }
                />

                {/* Default route */}
                <Route
                    path="/"
                    element={<Navigate to={isAuthed() ? "/dashboard" : "/"} replace />}
                />

                {/* Catch-all */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
