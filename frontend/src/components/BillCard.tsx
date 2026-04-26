"use client";

import { AlertCircle, Clock, Circle, CheckCircle, XCircle } from "lucide-react";
import { BillInstance } from "@/lib/api";
import { formatCurrency, formatDate, getStatusConfig } from "@/lib/utils";

const iconMap: Record<string, React.ElementType> = {
  "alert-circle": AlertCircle,
  clock: Clock,
  circle: Circle,
  "check-circle": CheckCircle,
  "x-circle": XCircle,
};

interface BillCardProps {
  bill: BillInstance;
  onMarkPaid: (bill: BillInstance) => void;
}

export default function BillCard({ bill, onMarkPaid }: BillCardProps) {
  const config = getStatusConfig(bill.status);
  const Icon = iconMap[config.icon] || Circle;

  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${config.bg} border-opacity-50 transition-all hover:shadow-md`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={`p-2 rounded-lg ${config.bg}`}>
          <Icon className={`w-5 h-5 ${config.color}`} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{bill.name}</p>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.color}`}>
              {config.label}
            </span>
            <span>Vence {formatDate(bill.due_date)}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(bill.expected_amount)}
          </p>
          {bill.total_paid > 0 && (
            <p className="text-xs text-rohu-secondary">
              Pagado: {formatCurrency(bill.total_paid)}
            </p>
          )}
        </div>

        {bill.status !== "paid" && bill.status !== "cancelled" && (
          <button
            onClick={() => onMarkPaid(bill)}
            className="px-3 py-2 bg-rohu-secondary text-white text-sm font-medium rounded-lg hover:bg-rohu-secondary-dark transition-colors whitespace-nowrap min-h-[44px]"
          >
            Pagar
          </button>
        )}
      </div>
    </div>
  );
}
