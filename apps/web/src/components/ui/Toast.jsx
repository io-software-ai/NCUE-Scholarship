'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, X, Loader2 } from 'lucide-react';

const Toast = ({ show, message, type = 'success', onClose }) => {
    // Auto-close timer
    React.useEffect(() => {
        if (show) {
            const timer = setTimeout(() => onClose(), 5000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);

    // Icon and color configuration
    const config = {
        success: {
            icon: <CheckCircle className="w-6 h-6 text-ok" />,
            style: 'bg-ok/10/70 border-ok/30',
        },
        error: {
            icon: <AlertTriangle className="w-6 h-6 text-rose-500" />,
            style: 'bg-rose-50/70 border-rose-200',
        },
        info: {
            icon: <Info className="w-6 h-6 text-sky-500" />,
            style: 'bg-sky-50/70 border-sky-200',
        },
    };

    const selectedConfig = config[type] || config.info;

    return (
        // AnimatePresence handles the enter and exit animations
        <AnimatePresence>
            {show && (
                <motion.div
                    // Animation properties
                    initial={{ opacity: 0, y: -20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 50, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    // Positioning and RWD
                    className="fixed top-24 right-4 sm:right-6 z-[9999] w-[calc(100%-2rem)] sm:w-auto max-w-md"
                >
                    <div className={`flex items-center p-4 rounded-xl border backdrop-blur-lg shadow-lg ${selectedConfig.style}`}>
                        <div className="flex-shrink-0">{selectedConfig.icon}</div>
                        <div className="ml-3 flex-1">
                            <p className="text-sm font-semibold text-ink">{message}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="ml-4 p-1.5 text-ink-soft hover:text-ink rounded-full hover:bg-black/10 transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default Toast;