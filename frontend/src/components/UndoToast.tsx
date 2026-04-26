"use client";

import { useEffect, useState } from "react";
import { CheckCircle, Undo2 } from "lucide-react";
import { reversePayment } from "@/lib/api";

interface UndoToastProps {
  paymentId: string;
  billName: string;
  amount: string;
  onUndo: () => void;
  onExpire: () => void;
}

export default function UndoToast({ paymentId, billName, amount, onUndo, onExpire }: UndoToastProps) {
  const [progress, setProgress] = useState(100);
  const [undoing, setUndoing] = useState(false);
  const [undone, setUndone] = useState(false);
  const DURATION = 10000; // 10 seconds
  const INTERVAL = 50;

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        const next = p - (INTERVAL / DURATION) * 100;
        if (next <= 0) {
          clearInterval(timer);
          onExpire();
          return 0;
        }
        return next;
      });
    }, INTERVAL);
    return () => clearInterval(timer);
  }, [onExpire]);

  async function handleUndo() {
    setUndoing(true);
    try {
      await reversePayment(paymentId);
      setUndone(true);
      setTimeout(() => onUndo(), 1500);
    } catch {
      onExpire(); // Close on error
    }
  }

  if (undone) {
    return (
      <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-rohu-secondary text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in">
        <CheckCircle className="w-5 h-5" />
        <span className="text-sm font-medium">Pago deshecho</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] w-[90%] max-w-md">
      <div className="bg-rohu-primary text-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <CheckCircle className="w-5 h-5 text-rohu-accent flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">Pago registrado: {billName}</p>
              <p className="text-xs text-white/60">{amount}</p>
            </div>
          </div>
          <button
            onClick={handleUndo}
            disabled={undoing}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] bg-rohu-accent text-white text-sm font-semibold rounded-lg hover:bg-rohu-accent-light disabled:opacity-50 flex-shrink-0"
          >
            {undoing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            {undoing ? "..." : "Deshacer"}
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-white/10">
          <div
            className="h-full bg-rohu-accent transition-all ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
