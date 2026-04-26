const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

function getHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...getHeaders(), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Auth
export async function login(email: string, password: string) {
  return request<{ access_token: string; refresh_token: string; role: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string, fullName: string) {
  return request<{ message: string; pending_approval: boolean }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
}

// Bill template delete
export async function deleteBillTemplate(id: string) {
  return request<void>(`/bills/templates/${id}`, { method: "DELETE" });
}

// Admin: purge month
export async function purgeMonth(year: number, month: number) {
  return request<{ deleted_instances: number; deleted_payments: number; deleted_files: number }>(
    `/bills/instances/purge?year=${year}&month=${month}`, { method: "DELETE" }
  );
}

// Reverse payment
export async function reversePayment(id: string) {
  return request<void>(`/payments/${id}`, { method: "DELETE" });
}

// Admin: delete user
export async function deleteUser(id: string) {
  return request<void>(`/users/${id}`, { method: "DELETE" });
}

// Categories
export async function getCategories() {
  return request<Category[]>("/categories");
}

// Bill Templates
export async function getBillTemplates() {
  return request<BillTemplate[]>("/bills/templates");
}

export async function createBillTemplate(data: BillTemplateCreate) {
  return request<BillTemplate>("/bills/templates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Bill Instances
export async function getBillInstances(year: number, month: number, status?: string) {
  const params = new URLSearchParams({ year: String(year), month: String(month) });
  if (status) params.set("status", status);
  return request<BillInstance[]>(`/bills/instances?${params}`);
}

export async function generateBillInstances(year: number, month: number) {
  return request<{ created: number; message: string }>(
    `/bills/instances/generate?year=${year}&month=${month}`,
    { method: "POST" }
  );
}

export async function updateBillStatuses() {
  return request<{ updated: number }>("/bills/instances/update-statuses", { method: "POST" });
}

// Payments
export async function recordPayment(instanceId: string, data: FormData) {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const res = await fetch(`${API_BASE}/bills/instances/${instanceId}/payments`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: data,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

// Dashboard
export async function getDashboardSummary(year: number, month: number) {
  return request<DashboardSummary>(`/dashboard/summary?year=${year}&month=${month}`);
}

export async function getBudgetVariance(year: number, month: number) {
  return request<BudgetVariance>(`/dashboard/budget-variance?year=${year}&month=${month}`);
}

export async function getCashflow(year: number, month: number) {
  return request<CashflowForecast>(`/dashboard/cashflow?year=${year}&month=${month}`);
}

export async function getDashboardFull(year: number, month: number) {
  return request<DashboardFullResponse>(`/dashboard/full?year=${year}&month=${month}`);
}

// Notification settings
export async function getNotificationConfig() {
  return request<NotificationConfig>("/notifications/config");
}

export async function updateNotificationConfig(data: Partial<NotificationConfigUpdate>) {
  return request<NotificationConfig>("/notifications/config", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function testNotification(channel: string) {
  return request<{ message: string }>("/notifications/test", {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

// Notification rules per template
export async function getNotificationRule(templateId: string) {
  return request<NotifRule>(`/notifications/rules/${templateId}`);
}

export async function updateNotificationRule(templateId: string, data: Partial<NotifRuleUpdate>) {
  return request<NotifRule>(`/notifications/rules/${templateId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// Payments history
export async function listPayments(year?: number, month?: number, search?: string) {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  if (search) params.set("search", search);
  return request<PaymentWithBill[]>(`/payments?${params}`);
}

export function getAttachmentUrl(paymentId: string, attachmentId: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return `${base}/payments/${paymentId}/attachments/${attachmentId}`;
}

// Profile
export async function updateProfile(data: { email?: string; full_name?: string; timezone?: string }) {
  return request<any>("/users/me", { method: "PATCH", body: JSON.stringify(data) });
}

export async function changePassword(data: { current_password: string; new_password: string }) {
  return request<{ message: string }>("/users/me/change-password", { method: "POST", body: JSON.stringify(data) });
}

// Admin: user management
export async function listUsers(search?: string) {
  const params = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<UserFull[]>(`/users${params}`);
}

export async function adminCreateUser(data: { email: string; password: string; full_name: string; role?: string }) {
  return request<any>("/users", { method: "POST", body: JSON.stringify(data) });
}

export async function adminUpdateUser(id: string, data: { is_active?: boolean; role?: string }) {
  return request<any>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

// Income Sources
export async function getIncomeSources() {
  return request<IncomeSource[]>("/income-sources");
}

export async function createIncomeSource(data: IncomeSourceCreate) {
  return request<IncomeSource>("/income-sources", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateIncomeSource(id: string, data: Partial<IncomeSourceCreate>) {
  return request<IncomeSource>(`/income-sources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteIncomeSource(id: string) {
  return request<void>(`/income-sources/${id}`, { method: "DELETE" });
}

// Bill Template update
export async function updateBillTemplate(id: string, data: Partial<BillTemplateCreate> & { is_active?: boolean }) {
  return request<BillTemplate>(`/bills/templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// User
export async function getMe() {
  return request<{ id: string; email: string; full_name: string; timezone: string }>("/auth/me");
}

// Types
export interface IncomeSource {
  id: string;
  name: string;
  amount: number;
  day_of_month: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface IncomeSourceCreate {
  name: string;
  amount: number;
  day_of_month: number;
  notes?: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
}

export interface BillTemplate {
  id: string;
  category: Category;
  name: string;
  provider: string | null;
  estimated_amount: number;
  due_day_of_month: number;
  recurrence_type: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

export interface BillTemplateCreate {
  category_id: string;
  name: string;
  provider?: string;
  estimated_amount: number;
  due_day_of_month: number;
  recurrence_type?: string;
  notes?: string;
}

export interface BillInstance {
  id: string;
  bill_template_id: string;
  category: Category;
  year: number;
  month: number;
  name: string;
  expected_amount: number;
  due_date: string;
  status: "pending" | "due_soon" | "overdue" | "paid" | "cancelled";
  notes: string | null;
  paid_at: string | null;
  total_paid: number;
  created_at: string;
}

export interface DashboardFullResponse {
  summary: DashboardSummary;
  cashflow: CashflowForecast;
  bills: BillInstance[];
}

export interface DashboardSummary {
  total_pending: number;
  total_paid: number;
  total_overdue: number;
  count_pending: number;
  count_paid: number;
  count_overdue: number;
  count_due_soon: number;
  overdue_bills: BillInstance[];
  due_soon_bills: BillInstance[];
  upcoming_bills: BillInstance[];
}

export interface BudgetVarianceItem {
  category_name: string;
  category_slug: string;
  budget_amount: number;
  actual_paid: number;
  variance_amount: number;
  variance_percentage: number;
}

export interface BudgetVariance {
  year: number;
  month: number;
  total_budget: number;
  total_actual: number;
  total_variance: number;
  items: BudgetVarianceItem[];
}

export interface CashflowForecast {
  year: number;
  month: number;
  total_income: number;
  total_paid: number;
  total_pending: number;
  projected_balance: number;
  is_negative: boolean;
}

export interface PaymentAttachment {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface PaymentWithBill {
  id: string;
  bill_instance_id: string;
  bill_name: string;
  bill_category: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference: string | null;
  notes: string | null;
  attachments: PaymentAttachment[];
  created_at: string;
}

export interface UserFull {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  bill_count: number;
}

export interface NotificationConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password_set: boolean;
  smtp_from_email: string;
  smtp_tls: boolean;
  telegram_bot_token_set: boolean;
  telegram_chat_id: string;
  email_enabled: boolean;
  telegram_enabled: boolean;
  notification_hour: number;
  notification_minute: number;
}

export interface NotificationConfigUpdate {
  smtp_host?: string;
  smtp_port?: number;
  smtp_user?: string;
  smtp_password?: string;
  smtp_from_email?: string;
  smtp_tls?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  email_enabled?: boolean;
  telegram_enabled?: boolean;
  notification_hour?: number;
  notification_minute?: number;
}

export interface NotifRule {
  id: string;
  bill_template_id: string;
  remind_days_before: string;
  remind_overdue_daily: boolean;
  channels: string;
  extra_emails: string | null;
  is_active: boolean;
}

export interface NotifRuleUpdate {
  remind_days_before?: string;
  remind_overdue_daily?: boolean;
  channels?: string;
  extra_emails?: string;
  is_active?: boolean;
}
