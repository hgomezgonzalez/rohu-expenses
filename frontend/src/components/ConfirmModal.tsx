"use client";

import { AlertTriangle, CheckCircle, Info, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  type?: "danger" | "success" | "info" | "warning";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
}

const typeConfig = {
  danger: { icon: AlertTriangle, iconColor: "text-red-600", iconBg: "bg-red-100", btnColor: "bg-red-600 hover:bg-red-700" },
  warning: { icon: AlertTriangle, iconColor: "text-amber-600", iconBg: "bg-amber-100", btnColor: "bg-amber-600 hover:bg-amber-700" },
  success: { icon: CheckCircle, iconColor: "text-rohu-secondary", iconBg: "bg-rohu-secondary/10", btnColor: "bg-rohu-secondary hover:bg-rohu-secondary-dark" },
  info: { icon: Info, iconColor: "text-rohu-primary", iconBg: "bg-rohu-primary/10", btnColor: "bg-rohu-primary hover:bg-rohu-primary-dark" },
};

export default function ConfirmModal({
  open, title, message, type = "info",
  confirmLabel = "Aceptar", cancelLabel = "Cancelar",
  onConfirm, onClose,
}: ConfirmModalProps) {
  if (!open) return null;

  const cfg = typeConfig[type];
  const Icon = cfg.icon;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${cfg.iconBg} mb-4`}>
            <Icon className={`w-7 h-7 ${cfg.iconColor}`} />
          </div>
          <h3 className="text-lg font-bold text-rohu-text mb-2">{title}</h3>
          <p className="text-sm text-rohu-muted whitespace-pre-line">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          {onConfirm ? (
            <>
              <button onClick={onClose}
                className="flex-1 py-2.5 min-h-[44px] border border-rohu-border text-rohu-muted font-medium rounded-lg hover:bg-gray-50 transition-colors text-sm">
                {cancelLabel}
              </button>
              <button onClick={() => { onConfirm(); onClose(); }}
                className={`flex-1 py-2.5 min-h-[44px] text-white font-medium rounded-lg transition-colors text-sm ${cfg.btnColor}`}>
                {confirmLabel}
              </button>
            </>
          ) : (
            <button onClick={onClose}
              className={`w-full py-2.5 min-h-[44px] text-white font-medium rounded-lg transition-colors text-sm ${cfg.btnColor}`}>
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
