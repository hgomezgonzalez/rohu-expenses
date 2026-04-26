export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}

export function getStatusConfig(status: string) {
  const configs: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    overdue: { label: "Vencida", color: "text-red-700", bg: "bg-red-100", icon: "alert-circle" },
    due_soon: { label: "Próxima", color: "text-amber-700", bg: "bg-amber-100", icon: "clock" },
    pending: { label: "Pendiente", color: "text-rohu-primary", bg: "bg-rohu-primary/10", icon: "circle" },
    paid: { label: "Pagada", color: "text-rohu-secondary", bg: "bg-rohu-secondary/10", icon: "check-circle" },
    cancelled: { label: "Cancelada", color: "text-gray-500", bg: "bg-gray-100", icon: "x-circle" },
  };
  return configs[status] || configs.pending;
}

export function getMonthName(month: number): string {
  const names = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  return names[month] || "";
}
